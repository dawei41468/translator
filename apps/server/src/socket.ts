import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { db } from "../../../packages/db/src/index.js";
import { users, rooms, roomParticipants } from "../../../packages/db/src/schema.js";
import { eq } from "drizzle-orm";
import { translateText } from "./services/translation.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  roomId?: string;
}

export function setupSocketIO(io: Server) {
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error"));
    }

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
    console.log(`User ${socket.userId} connected`);

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
        console.error("Error joining room:", error);
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
        // Get target user's language
        const participants = await db.query.roomParticipants.findMany({
          where: eq(roomParticipants.roomId, socket.roomId),
          with: {
            user: true,
          },
        });

        const targetUser = participants.find(p => p.userId !== socket.userId);
        if (!targetUser) return;

        const targetLang = targetUser.user.language || "en";

        // Translate
        const translatedText = await translateText(data.transcript, data.sourceLang, targetLang);

        // Broadcast to target user
        socket.to(socket.roomId).emit("translated-message", {
          originalText: data.transcript,
          translatedText,
          sourceLang: data.sourceLang,
          targetLang,
          fromUserId: socket.userId,
        });
      } catch (error) {
        console.error("Error processing speech transcript:", error);
        socket.emit("error", "Translation failed");
      }
    });

    socket.on("disconnect", () => {
      console.log(`User ${socket.userId} disconnected`);
      if (socket.roomId) {
        socket.to(socket.roomId).emit("user-left", { userId: socket.userId });
      }
    });

    socket.on("reconnect", () => {
      console.log(`User ${socket.userId} reconnected`);
      if (socket.roomId) {
        socket.to(socket.roomId).emit("user-reconnected", { userId: socket.userId });
      }
    });
  });
}
