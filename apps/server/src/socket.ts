import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { db } from "../../../packages/db/src/index.js";
import { users, rooms, roomParticipants } from "../../../packages/db/src/schema.js";
import { eq } from "drizzle-orm";
import { translateText } from "./services/translation.js";
import { logger } from "./logger.js";
import { parseCookies } from "./middleware/auth.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const AUTH_COOKIE_NAME = "auth_token";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  roomId?: string;
}

export function setupSocketIO(io: Server) {
  io.use(async (socket: AuthenticatedSocket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const token = cookies[AUTH_COOKIE_NAME];
    if (!token) return next(new Error("Authentication error"));

    try {
      const verified = jwt.verify(token, JWT_SECRET) as any;
      const userId = verified.userId;
      if (!userId) {
        return next(new Error("Invalid token"));
      }

      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      if (!user) {
        return next(new Error("User not found"));
      }

      socket.userId = userId;
      next();
    } catch (err) {
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    logger.info(`User connected to socket`, { userId: socket.userId });

    socket.on("join-room", async (roomCode: string) => {
      try {
        const room = await db.query.rooms.findFirst({
          where: eq(rooms.code, roomCode),
        });

        if (!room) {
          socket.emit("error", "Room not found");
          return;
        }

        // Check if user is already a participant
        const existingParticipant = await db.query.roomParticipants.findFirst({
          where: (rp, { and }) => and(
            eq(rp.roomId, room.id),
            eq(rp.userId, socket.userId!)
          ),
        });

        if (!existingParticipant) {
          await db.insert(roomParticipants).values({
            roomId: room.id,
            userId: socket.userId!,
          });
        }

        socket.roomId = room.id;
        socket.join(room.id);

        // Notify others in the room
        socket.to(room.id).emit("user-joined", { userId: socket.userId });

        socket.emit("joined-room", { roomId: room.id });
      } catch (error) {
        logger.error("Error joining room", error, { roomCode, userId: socket.userId });
        socket.emit("error", "Failed to join room");
      }
    });

    socket.on("leave-room", async () => {
      if (socket.roomId) {
        socket.to(socket.roomId).emit("user-left", { userId: socket.userId });
        socket.leave(socket.roomId);
        socket.roomId = undefined;
      }
    });

    socket.on("speech-transcript", async (data: { transcript: string; sourceLang: string }) => {
      if (!socket.roomId || !socket.userId) return;

      try {
        // Get all other participants
        const participants = await db.query.roomParticipants.findMany({
          where: eq(roomParticipants.roomId, socket.roomId),
          with: {
            user: true,
          },
        });

        const otherParticipants = participants.filter(p => p.userId !== socket.userId);
        if (otherParticipants.length === 0) return;

        // Group participants by language to avoid redundant translations
        const participantsByLanguage = new Map<string, typeof otherParticipants>();

        for (const participant of otherParticipants) {
          const lang = participant.user.language || "en";
          if (!participantsByLanguage.has(lang)) {
            participantsByLanguage.set(lang, []);
          }
          participantsByLanguage.get(lang)!.push(participant);
        }

        // Translate once per unique language
        const translationPromises = Array.from(participantsByLanguage.entries()).map(
          async ([targetLang, participants]) => {
            const translatedText = await translateText(data.transcript, data.sourceLang, targetLang);
            return { targetLang, translatedText, participants };
          }
        );

        const translations = await Promise.all(translationPromises);

        // Emit to all participants in each language group
        for (const { targetLang, translatedText, participants } of translations) {
          for (const participant of participants) {
            socket.to(socket.roomId).emit("translated-message", {
              originalText: data.transcript,
              translatedText,
              sourceLang: data.sourceLang,
              targetLang,
              fromUserId: socket.userId,
              toUserId: participant.userId,
            });
          }
        }
      } catch (error) {
        logger.error("Error processing speech transcript", error, { 
          userId: socket.userId, 
          roomId: socket.roomId,
          transcript: data.transcript 
        });
        socket.emit("error", "Translation failed");
      }
    });

    socket.on("disconnect", () => {
      logger.info(`User disconnected from socket`, { userId: socket.userId });
      if (socket.roomId) {
        socket.to(socket.roomId).emit("user-left", { userId: socket.userId });
      }
    });

    socket.on("reconnect", () => {
      logger.info(`User reconnected to socket`, { userId: socket.userId });
      if (socket.roomId) {
        socket.to(socket.roomId).emit("user-reconnected", { userId: socket.userId });
      }
    });
  });
}
