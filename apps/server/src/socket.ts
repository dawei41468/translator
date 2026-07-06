import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { db } from "../../../packages/db/src/index.js";
import { users, rooms, roomParticipants } from "../../../packages/db/src/schema.js";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger.js";
import { parseCookies } from "./middleware/auth.js";
import { withRetry, validateSocketData, handleSocketError } from "./services/socket-utils.js";
import { UtteranceOrchestrator, generateUtteranceId, Participant } from "./services/utterance-orchestrator.js";

// Handle automatic disconnect after background timeout
async function handleAutoDisconnect(socket: AuthenticatedSocket) {
  if (!socket.userId || !socket.roomId) return;

  socket.participantStatus = 'disconnected';

  // Update database status
  await db.update(roomParticipants)
    .set({
      status: 'disconnected',
      lastSeen: new Date()
    })
    .where(and(
      eq(roomParticipants.roomId, socket.roomId!),
      eq(roomParticipants.userId, socket.userId!)
    ));

  // Broadcast status change
  socket.to(socket.roomId).emit("participant-status-changed", {
    userId: socket.userId,
    status: 'disconnected',
    lastSeen: new Date()
  });

  // Close socket connection
  socket.disconnect();
}

const utteranceStartSchema = {
  languageCode: (v: any) => typeof v === 'string' && v.length >= 2 && v.length <= 10,
};

const utteranceAudioSchema = {
  base64Audio: (v: any) => typeof v === 'string' && v.length > 0,
};

const roomCodeSchema = {
  roomCode: (v: any) => typeof v === 'string' && v.length === 6 && /^[A-Z0-9]+$/.test(v),
};

const JWT_SECRET = process.env.JWT_SECRET!;
const AUTH_COOKIE_NAME = "auth_token";

// Rate limiting for socket events
const rateLimits = new Map<string, { count: number; resetTime: number }>();

// Prune expired entries every 60 seconds to prevent unbounded growth
const RATE_LIMIT_PRUNE_INTERVAL = 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (now > entry.resetTime) {
      rateLimits.delete(key);
    }
  }
}, RATE_LIMIT_PRUNE_INTERVAL);

function checkRateLimit(userId: string, event: string, maxRequests: number, windowMs: number): boolean {
  const key = `${userId}:${event}`;
  const now = Date.now();
  const limit = rateLimits.get(key);

  if (!limit || now > limit.resetTime) {
    rateLimits.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (limit.count >= maxRequests) {
    return false;
  }

  limit.count++;
  return true;
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
  roomId?: string;
  activeUtterance?: UtteranceOrchestrator;
  participantStatus?: 'active' | 'away' | 'disconnected';
  backgroundTimeout?: NodeJS.Timeout;
}

async function fetchRoomParticipants(roomId: string): Promise<Participant[]> {
  const rows = await withRetry(() =>
    db.query.roomParticipants.findMany({
      where: eq(roomParticipants.roomId, roomId),
      with: { user: true },
    }), 2, 500
  );

  return rows.map((row) => ({
    userId: row.userId,
    language: row.user?.language ?? "en",
    displayName: row.user?.displayName ?? row.user?.name ?? undefined,
  }));
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

      const user = await withRetry(() =>
        db.query.users.findFirst({
          where: eq(users.id, userId),
        }), 2, 500
      );
      if (!user) {
        return next(new Error("User not found"));
      }

      socket.userId = userId;
      next();
    } catch (err) {
      logger.warn("Socket authentication failed", {
        error: err instanceof Error ? err.message : String(err),
        ip: socket.handshake.address
      });
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    logger.info(`User connected to socket`, {
      userId: socket.userId,
      userAgent: socket.handshake.headers['user-agent'],
      ip: socket.handshake.address
    });

    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }

    // Handle connection errors
    socket.on("connect_error", (error) => {
      logger.warn("Socket connection error", {
        userId: socket.userId,
        error: error.message
      });
    });

    socket.on("error", (error) => {
      handleSocketError(socket, "socket-error", error, "Connection error occurred");
    });

    const disposeActiveUtterance = async () => {
      if (socket.activeUtterance) {
        try {
          await socket.activeUtterance.dispose();
        } catch (error) {
          logger.warn("Error disposing active utterance", {
            userId: socket.userId,
            roomId: socket.roomId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        socket.activeUtterance = undefined;
      }
    };

    socket.on("start-utterance", async (data: { languageCode: string }) => {
      if (!validateSocketData(data, utteranceStartSchema)) {
        handleSocketError(socket, "start-utterance", new Error("Invalid utterance start data"));
        return;
      }

      if (!socket.userId || !checkRateLimit(socket.userId, 'start-utterance', 20, 60000)) {
        socket.emit("utterance-error", { utteranceId: "", message: "Too many utterance start attempts - please wait" });
        return;
      }

      if (!socket.roomId) {
        socket.emit("utterance-error", { utteranceId: "", message: "Not in a room" });
        return;
      }

      // Dispose any previous active utterance for this speaker.
      await disposeActiveUtterance();

      try {
        const participants = await fetchRoomParticipants(socket.roomId);
        const utteranceId = generateUtteranceId();

        socket.activeUtterance = new UtteranceOrchestrator(
          utteranceId,
          socket.userId,
          data.languageCode,
          participants,
          {
            emitStarted: (participantId, payload) => {
              io.to(`user:${participantId}`).emit("utterance-started", payload);
            },
            emitText: (participantId, payload) => {
              io.to(`user:${participantId}`).emit("utterance-text", payload);
            },
            emitAudio: (participantId, payload) => {
              io.to(`user:${participantId}`).emit("utterance-audio", payload);
            },
            emitDone: (participantId, payload) => {
              io.to(`user:${participantId}`).emit("utterance-done", payload);
            },
            emitError: (participantId, payload) => {
              io.to(`user:${participantId}`).emit("utterance-error", payload);
            },
          }
        );
      } catch (error) {
        handleSocketError(socket, "start-utterance", error, "Failed to start utterance");
        socket.emit("utterance-error", {
          utteranceId: "",
          message: error instanceof Error ? error.message : "Failed to start utterance"
        });
      }
    });

    socket.on("utterance-audio", (data: { base64Audio: string }) => {
      if (!validateSocketData(data, utteranceAudioSchema)) {
        handleSocketError(socket, "utterance-audio", new Error("Invalid utterance audio data"));
        return;
      }

      if (!socket.userId || !checkRateLimit(socket.userId, 'utterance-audio', 120, 60000)) {
        return;
      }

      if (!socket.activeUtterance) {
        return;
      }

      try {
        socket.activeUtterance.appendAudio(data.base64Audio);
      } catch (error) {
        handleSocketError(socket, "utterance-audio", error, "Failed to forward utterance audio");
      }
    });

    socket.on("stop-utterance", async () => {
      if (!socket.activeUtterance) return;

      try {
        await socket.activeUtterance.stop();
      } catch (error) {
        handleSocketError(socket, "stop-utterance", error, "Failed to stop utterance");
      } finally {
        socket.activeUtterance = undefined;
      }
    });

    socket.on("join-room", async (roomCode: string) => {
      logger.info(`User attempting to join room`, {
        userId: socket.userId,
        roomCode,
        userAgent: socket.handshake.headers['user-agent']
      });

      if (!validateSocketData({ roomCode }, roomCodeSchema)) {
        handleSocketError(socket, "join-room", new Error("Invalid room code format"));
        return;
      }

      if (!socket.userId || !checkRateLimit(socket.userId, 'join-room', 10, 60000)) {
        socket.emit("error", "Too many join attempts - please wait");
        return;
      }

      try {
        const normalizedCode = roomCode.toUpperCase();

        const room = await withRetry(() =>
          db.query.rooms.findFirst({
            where: eq(rooms.code, normalizedCode),
          }), 2, 500
        );

        if (!room) {
          socket.emit("error", "Room not found or expired");
          return;
        }

        // Check if user is already a participant
        const existingParticipant = await withRetry(() =>
          db.query.roomParticipants.findFirst({
            where: (rp, { and }) => and(
              eq(rp.roomId, room.id),
              eq(rp.userId, socket.userId!)
            ),
          }), 2, 500
        );

        if (!existingParticipant) {
          // Check room capacity
          const participantCount = await withRetry(() =>
            db.$count(roomParticipants, eq(roomParticipants.roomId, room.id)), 2, 500
          );
          if (participantCount >= 10) {
            socket.emit("error", "Room is full");
            return;
          }

          await withRetry(() =>
            db.insert(roomParticipants).values({
              roomId: room.id,
              userId: socket.userId!,
              status: 'active',
              lastSeen: new Date()
            }), 2, 500
          );
        }

        socket.roomId = room.id;
        socket.participantStatus = 'active';
        socket.join(room.id);

        // Notify others in the room
        socket.to(room.id).emit("user-joined", { userId: socket.userId });

        logger.info(`User successfully joined room`, {
          userId: socket.userId,
          roomId: room.id,
          roomCode: room.code
        });
        socket.emit("joined-room", { roomId: room.id });
      } catch (error) {
        handleSocketError(socket, "join-room", error, "Unable to join room - please try again", { roomCode });
      }
    });

    socket.on("leave-room", async () => {
      await disposeActiveUtterance();

      if (socket.roomId && socket.userId) {
        socket.to(socket.roomId).emit("user-left", { userId: socket.userId });

        // Remove from database
        try {
          await withRetry(() =>
            db.delete(roomParticipants).where(and(
              eq(roomParticipants.roomId, socket.roomId!),
              eq(roomParticipants.userId, socket.userId!)
            )), 2, 500
          );
        } catch (error) {
          logger.warn("Failed to remove participant from database on leave", {
            userId: socket.userId,
            roomId: socket.roomId,
            error: error instanceof Error ? error.message : String(error)
          });
        }

        socket.leave(socket.roomId);
        socket.roomId = undefined;
      }
    });

    socket.on("client-error", (data: { code: string; message: string; details?: any }) => {
      // Rate limit telemetry to prevent log flooding
      if (!socket.userId || !checkRateLimit(socket.userId, 'client-error', 10, 60000)) {
        return;
      }

      logger.error("Client reported error", {
        userId: socket.userId,
        roomId: socket.roomId,
        code: data.code,
        message: data.message,
        details: data.details,
        userAgent: socket.handshake.headers['user-agent']
      });
    });

    // Handle participant status updates
    socket.on("participant-status-update", async (data: { status: 'active' | 'away' | 'disconnected' }) => {
      if (!socket.userId || !socket.roomId) return;

      socket.participantStatus = data.status;

      // Update database
      await db.update(roomParticipants)
        .set({
          status: data.status,
          lastSeen: new Date(),
          backgroundedAt: data.status === 'away' ? new Date() : null
        })
        .where(and(
          eq(roomParticipants.roomId, socket.roomId!),
          eq(roomParticipants.userId, socket.userId!)
        ));

      // Broadcast status change to room
      socket.to(socket.roomId).emit("participant-status-changed", {
        userId: socket.userId,
        status: data.status,
        lastSeen: new Date()
      });

      // Handle auto-disconnect for away status
      if (data.status === 'away') {
        socket.backgroundTimeout = setTimeout(async () => {
          await handleAutoDisconnect(socket);
        }, 5 * 60 * 1000); // 5 minutes
      } else if (data.status === 'active' && socket.backgroundTimeout) {
        clearTimeout(socket.backgroundTimeout);
        socket.backgroundTimeout = undefined;
      }
    });

    // Add heartbeat/ping to detect connection issues early
    const heartbeat = setInterval(() => {
      if (socket.connected) {
        socket.emit("ping");
      }
    }, 30000); // 30 second heartbeat

    socket.on("pong", () => {
      // Client responds to ping - connection is healthy
    });

    socket.on("disconnect", async (reason) => {
      clearInterval(heartbeat);

      logger.info(`User disconnected from socket`, {
        userId: socket.userId,
        reason,
        roomId: socket.roomId
      });

      await disposeActiveUtterance();

      if (socket.roomId && socket.userId) {
        try {
          await withRetry(() =>
            db.update(roomParticipants)
              .set({
                status: 'disconnected',
                lastSeen: new Date()
              })
              .where(and(
                eq(roomParticipants.roomId, socket.roomId!),
                eq(roomParticipants.userId, socket.userId!)
              )), 2, 500
          );

          socket.to(socket.roomId).emit("participant-status-changed", {
            userId: socket.userId,
            status: 'disconnected',
            lastSeen: new Date()
          });
        } catch (error) {
          logger.warn("Failed to update participant status on disconnect", {
            userId: socket.userId,
            roomId: socket.roomId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    });

    // Handle reconnection - client will rejoin room automatically
    socket.on("reconnect", () => {
      logger.info(`User reconnected to socket`, { userId: socket.userId });
    });
  });
}
