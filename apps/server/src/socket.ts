import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { db } from "../../../packages/db/src/index.js";
import { users, rooms, roomParticipants } from "../../../packages/db/src/schema.js";
import { eq, and } from "drizzle-orm";
import { translationRegistry } from "./services/translation/index.js";
import { sttRegistry } from "./services/stt/index.js";
import { ttsRegistry } from "./services/tts/index.js";
import type { SttEngine } from "./services/stt/index.js";
import { logger } from "./logger.js";
import { parseCookies } from "./middleware/auth.js";
import { withRetry, validateSocketData, isRecoverableSttError, canRestartStt, handleSocketError } from "./services/socket-utils.js";
import { handleTranscript } from "./services/transcript-handler.js";

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

// Graceful degradation for speech recognition
function handleSpeechError(socket: AuthenticatedSocket, error: any, context: string) {
  logger.warn(`Speech recognition error: ${context}`, {
    userId: socket.userId,
    roomId: socket.roomId,
    error: error instanceof Error ? error.message : String(error)
  });

  // Stop recognition to prevent further errors
  if (socket.sttEngine) {
    socket.sttEngine.destroy();
    socket.sttEngine = undefined;
  }

  socket.sttNeedsRestart = true;

  socket.emit("speech-error", "Speech recognition temporarily unavailable. Please try again.");
}

const speechStartSchema = {
  languageCode: (v: any) => typeof v === 'string' && v.length >= 2 && v.length <= 10,
  soloMode: (v: any) => typeof v === 'boolean' || v === undefined,
  soloTargetLang: (v: any) => typeof v === 'string' || v === undefined,
  encoding: (v: any) => v === undefined || v === 'WEBM_OPUS' || v === 'LINEAR16',
  sampleRateHertz: (v: any) => v === undefined || typeof v === 'number',
};

const roomCodeSchema = {
  roomCode: (v: any) => typeof v === 'string' && v.length === 6 && /^[A-Z0-9]+$/.test(v),
};

const speechTranscriptSchema = {
  transcript: (v: any) => typeof v === 'string' && v.length > 0 && v.length <= 10000, // Reasonable max length
  sourceLang: (v: any) => typeof v === 'string' && v.length >= 2 && v.length <= 10,
};

const JWT_SECRET = process.env.JWT_SECRET!;
const AUTH_COOKIE_NAME = "auth_token";

// Rate limiting for socket events
const rateLimits = new Map<string, { count: number; resetTime: number }>();

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
  sttEngine?: SttEngine;
  soloMode?: boolean;
  soloTargetLang?: string;
  sttLanguageCode?: string;
  sttActive?: boolean;
  sttNeedsRestart?: boolean;
  sttRestartWindowStartedAt?: number;
  sttRestartCount?: number;
  participantStatus?: 'active' | 'away' | 'disconnected';
  backgroundTimeout?: NodeJS.Timeout;
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

      const preferredTranslationEngine = (user as any)?.preferences?.translationEngine;
      if (typeof preferredTranslationEngine === 'string' && preferredTranslationEngine.length > 0) {
        translationRegistry.setUserPreference(userId, preferredTranslationEngine);
      }

      const preferredSttEngine = (user as any)?.preferences?.sttEngine;
      if (typeof preferredSttEngine === 'string' && preferredSttEngine.length > 0) {
        sttRegistry.setUserPreference(userId, preferredSttEngine);
      }

      const preferredTtsEngine = (user as any)?.preferences?.ttsEngine;
      if (typeof preferredTtsEngine === 'string' && preferredTtsEngine.length > 0) {
        ttsRegistry.setUserPreference(userId, preferredTtsEngine);
      }

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

    const stopRecognition = () => {
      try {
        if (socket.sttEngine) {
          socket.sttEngine.destroy();
          socket.sttEngine = undefined;
        }
      } catch (error) {
        logger.warn("Error stopping recognition", {
          userId: socket.userId,
          error: error instanceof Error ? error.message : String(error)
        });
      }

      socket.sttActive = false;
      socket.sttNeedsRestart = false;
      socket.sttLanguageCode = undefined;
    };

    const socketCanRestartStt = () => canRestartStt(socket);

    const startRecognitionStream = (data: { 
      languageCode: string;
      encoding?: "WEBM_OPUS" | "LINEAR16";
      sampleRateHertz?: number;
    }) => {
      stopRecognition();

      socket.sttActive = true;
      socket.sttLanguageCode = data.languageCode;
      socket.sttNeedsRestart = false;

      try {
        const engine = sttRegistry.getEngine(socket.userId);
        engine.start({ 
          languageCode: data.languageCode,
          encoding: data.encoding,
          sampleRateHertz: data.sampleRateHertz
        });

        engine.onTranscript(async (transcript, isFinal) => {
          if (isFinal && transcript && transcript.trim().length > 0) {
            const sourceLang = data.languageCode.split('-')[0];
            await handleTranscriptLocal(transcript, sourceLang);
          }
        });

        engine.onError((error) => {
          if (isRecoverableSttError(error)) {
            if (socket.sttEngine) {
              try {
                socket.sttEngine.destroy();
              } catch {
                // ignore
              }
              socket.sttEngine = undefined;
            }
            socket.sttNeedsRestart = true;
            return;
          }

          handleSpeechError(socket, error, "stream error");
        });

        engine.onEnd(() => {
          socket.sttEngine = undefined;
          if (socket.sttActive) {
            socket.sttNeedsRestart = true;
            if (socket.sttLanguageCode && socketCanRestartStt()) {
              startRecognitionStream({ languageCode: socket.sttLanguageCode });
            } else if (socket.sttLanguageCode) {
              socket.emit("speech-error", "Speech recognition session ended. Please stop and start again.");
            }
          }
        });

        engine.onClose(() => {
          socket.sttEngine = undefined;
          if (socket.sttActive) {
            socket.sttNeedsRestart = true;
            if (socket.sttLanguageCode && socketCanRestartStt()) {
              startRecognitionStream({ languageCode: socket.sttLanguageCode });
            } else if (socket.sttLanguageCode) {
              socket.emit("speech-error", "Speech recognition session ended. Please stop and start again.");
            }
          }
        });

        socket.sttEngine = engine;
      } catch (error) {
        handleSpeechError(socket, error, "failed to start recognition");
      }
    };

    socket.on(
      "start-speech",
      (data: { 
        languageCode: string; 
        soloMode?: boolean; 
        soloTargetLang?: string;
        encoding?: "WEBM_OPUS" | "LINEAR16";
        sampleRateHertz?: number;
      }) => {
      if (!validateSocketData(data, speechStartSchema)) {
        handleSocketError(socket, "start-speech", new Error("Invalid speech start data"));
        return;
      }

      if (!socket.userId || !checkRateLimit(socket.userId, 'start-speech', 20, 60000)) {
        socket.emit("speech-error", "Too many speech start attempts - please wait");
        return;
      }

      if (!socket.roomId) {
        socket.emit("speech-error", "Not in a room");
        return;
      }

      socket.soloMode = Boolean(data.soloMode);
      socket.soloTargetLang = data.soloTargetLang;

      startRecognitionStream({ 
        languageCode: data.languageCode,
        encoding: data.encoding,
        sampleRateHertz: data.sampleRateHertz
      });
    }
    );

    socket.on("speech-data", (data: Buffer) => {
      // Validate that data is a Buffer and not too large
      if (!(data instanceof Buffer) || data.length === 0 || data.length > 102400) { // 100KB max
        handleSocketError(socket, "speech-data", new Error("Invalid speech data"));
        return;
      }

      logger.info("Speech data received", {
        userId: socket.userId,
        roomId: socket.roomId,
        dataLength: data.length
      });

      if (!socket.sttEngine && socket.sttActive && socket.sttLanguageCode && socket.sttNeedsRestart) {
        if (!socketCanRestartStt()) {
          socket.emit("speech-error", "Speech recognition is unstable right now. Please stop and try again.");
          return;
        }

        startRecognitionStream({ languageCode: socket.sttLanguageCode });
      }

      if (socket.sttEngine) {
        try {
          socket.sttEngine.write(data);
        } catch (error) {
          if (isRecoverableSttError(error)) {
            if (socket.sttEngine) {
              try {
                socket.sttEngine.destroy();
              } catch {
                // ignore
              }
              socket.sttEngine = undefined;
            }
            socket.sttNeedsRestart = true;
            return;
          }
          handleSpeechError(socket, error, "writing to stream");
        }
      }
    });

    socket.on("stop-speech", () => {
      stopRecognition();
    });

    const handleTranscriptLocal = async (transcript: string, sourceLang: string) => {
      if (!socket.roomId || !socket.userId) {
        handleSocketError(socket, "handleTranscript", new Error("Missing room or user ID"));
        return;
      }

      if (!transcript || transcript.trim().length === 0) {
        return;
      }

      logger.info("Processing transcript", {
        userId: socket.userId,
        roomId: socket.roomId,
        transcript: transcript.substring(0, 100),
        sourceLang
      });

      try {
        await handleTranscript({
          transcript,
          sourceLang,
          roomId: socket.roomId,
          userId: socket.userId,
          soloMode: !!socket.soloMode,
          soloTargetLang: socket.soloTargetLang,
          translationEngine: translationRegistry.getEngine(socket.userId),
          getParticipants: async (roomId: string) => {
            return withRetry(() =>
              db.query.roomParticipants.findMany({
                where: eq(roomParticipants.roomId, roomId),
                with: { user: true },
              }), 2, 500
            );
          },
          emitToRoom: (participantId: string, event: string, data: any) => {
            io.to(`user:${participantId}`).emit(event, data);
          },
          emitToSelf: (event: string, data: any) => {
            socket.emit(event, data);
          },
          logInfo: logger.info,
          logWarn: logger.warn,
          logError: logger.error,
        });
      } catch (error) {
        handleSocketError(socket, "handleTranscript", error, "Failed to process your speech", {
          transcript: transcript.substring(0, 100)
        });
      }
    };

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

    socket.on("speech-transcript", async (data: { transcript: string; sourceLang: string }) => {
      if (!validateSocketData(data, speechTranscriptSchema)) {
        handleSocketError(socket, "speech-transcript", new Error("Invalid transcript data"));
        return;
      }

      if (!socket.userId || !checkRateLimit(socket.userId, 'speech-transcript', 60, 60000)) {
        // Don't emit error for transcript rate limiting to avoid spam
        return;
      }

      if (!data.transcript || data.transcript.trim().length === 0) {
        return; // Ignore empty transcripts (common from STT on silence/noise)
      }

      handleTranscriptLocal(data.transcript, data.sourceLang);
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

    socket.on("disconnect", async (reason) => {
      logger.info(`User disconnected from socket`, {
        userId: socket.userId,
        reason,
        roomId: socket.roomId
      });
      stopRecognition();

      if (socket.roomId && socket.userId) {
        // Update status to disconnected instead of deleting
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

          // Broadcast status change
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
      // Note: Client handles room rejoining via React useEffect
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

    socket.on("disconnect", () => {
      clearInterval(heartbeat);
    });
  });
}
