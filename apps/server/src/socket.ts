import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { db } from "../../../packages/db/src/index.js";
import { users, rooms, roomParticipants } from "../../../packages/db/src/schema.js";
import { eq } from "drizzle-orm";
import { translationRegistry } from "./services/translation/index.js";
import { createRecognizeStream } from "./services/stt.js";
import { logger } from "./logger.js";
import { parseCookies } from "./middleware/auth.js";

// Centralized error handling
function handleSocketError(socket: AuthenticatedSocket, event: string, error: any, userMessage?: string, logContext?: any) {
  const errorId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  logger.error(`Socket error in ${event}`, {
    errorId,
    userId: socket.userId,
    roomId: socket.roomId,
    event,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...logContext
  });

  const message = userMessage || "An unexpected error occurred";
  socket.emit("error", { message, errorId });
}

// Graceful degradation for speech recognition
function handleSpeechError(socket: AuthenticatedSocket, error: any, context: string) {
  logger.warn(`Speech recognition error: ${context}`, {
    userId: socket.userId,
    roomId: socket.roomId,
    error: error instanceof Error ? error.message : String(error)
  });

  // Stop recognition to prevent further errors
  if (socket.recognizeStream) {
    socket.recognizeStream.end();
    socket.recognizeStream = undefined;
  }

  socket.sttNeedsRestart = true;

  socket.emit("speech-error", "Speech recognition temporarily unavailable. Please try again.");
}

// Retry mechanism for transient errors
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }

  throw lastError;
}

// Input validation for socket events
function validateSocketData(data: any, schema: { [key: string]: (value: any) => boolean }) {
  for (const [key, validator] of Object.entries(schema)) {
    // Allow optional fields (those that accept undefined) to be missing
    if (!(key in data)) {
      // If the field is missing, check if the validator accepts undefined
      if (!validator(undefined)) {
        return false;
      }
      continue;
    }
    if (!validator(data[key])) {
      return false;
    }
  }
  return true;
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

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
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
  recognizeStream?: any;
  soloMode?: boolean;
  soloTargetLang?: string;
  sttLanguageCode?: string;
  sttActive?: boolean;
  sttNeedsRestart?: boolean;
  sttRestartWindowStartedAt?: number;
  sttRestartCount?: number;
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

    const stopRecognition = () => {
      try {
        if (socket.recognizeStream) {
          socket.recognizeStream.end();
          socket.recognizeStream = undefined;
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

    const isRecoverableSttError = (err: any) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('incomplete envelope')) return true;
      if (msg.toLowerCase().includes('connection reset by peer')) return true;
      if (msg.toLowerCase().includes('econnreset')) return true;
      if (msg.toLowerCase().includes('rst_stream')) return true;
      if (msg.toLowerCase().includes('maximum allowed stream duration')) return true;
      if (msg.toLowerCase().includes('audio timeout')) return true;
      if (msg.toLowerCase().includes('deadline exceeded')) return true;
      if (typeof err === 'object' && err !== null && 'code' in err) {
        const code = (err as any).code;
        if (code === 14 || code === 2) return true;
      }
      return false;
    };

    const canRestartStt = () => {
      const now = Date.now();
      const windowMs = 30_000;
      const maxRestarts = 3;

      if (!socket.sttRestartWindowStartedAt || now - socket.sttRestartWindowStartedAt > windowMs) {
        socket.sttRestartWindowStartedAt = now;
        socket.sttRestartCount = 0;
      }

      const count = socket.sttRestartCount ?? 0;
      if (count >= maxRestarts) return false;

      socket.sttRestartCount = count + 1;
      return true;
    };

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
        socket.recognizeStream = createRecognizeStream(
          { 
            languageCode: data.languageCode,
            encoding: data.encoding,
            sampleRateHertz: data.sampleRateHertz
          },
          async (transcript, isFinal) => {
            if (isFinal) {
              const sourceLang = data.languageCode.split('-')[0];
              await handleTranscript(transcript, sourceLang);
            }
          },
          (error) => {
            if (isRecoverableSttError(error)) {
              if (socket.recognizeStream) {
                try {
                  socket.recognizeStream.end();
                } catch {
                  // ignore
                }
                socket.recognizeStream = undefined;
              }
              socket.sttNeedsRestart = true;
              return;
            }

            handleSpeechError(socket, error, "stream error");
          }
        );

        if (socket.recognizeStream) {
          socket.recognizeStream.on('end', () => {
            socket.recognizeStream = undefined;
            if (socket.sttActive) {
              socket.sttNeedsRestart = true;
              if (socket.sttLanguageCode && canRestartStt()) {
                startRecognitionStream({ languageCode: socket.sttLanguageCode });
              } else if (socket.sttLanguageCode) {
                socket.emit("speech-error", "Speech recognition session ended. Please stop and start again.");
              }
            }
          });
          socket.recognizeStream.on('close', () => {
            socket.recognizeStream = undefined;
            if (socket.sttActive) {
              socket.sttNeedsRestart = true;
              if (socket.sttLanguageCode && canRestartStt()) {
                startRecognitionStream({ languageCode: socket.sttLanguageCode });
              } else if (socket.sttLanguageCode) {
                socket.emit("speech-error", "Speech recognition session ended. Please stop and start again.");
              }
            }
          });
        }
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

      if (!socket.recognizeStream && socket.sttActive && socket.sttLanguageCode && socket.sttNeedsRestart) {
        if (!canRestartStt()) {
          socket.emit("speech-error", "Speech recognition is unstable right now. Please stop and try again.");
          return;
        }

        startRecognitionStream({ languageCode: socket.sttLanguageCode });
      }

      if (socket.recognizeStream) {
        try {
          socket.recognizeStream.write(data);
        } catch (error) {
          if (isRecoverableSttError(error)) {
            if (socket.recognizeStream) {
              try {
                socket.recognizeStream.end();
              } catch {
                // ignore
              }
              socket.recognizeStream = undefined;
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

    const handleTranscript = async (transcript: string, sourceLang: string) => {
      if (!socket.roomId || !socket.userId) {
        handleSocketError(socket, "handleTranscript", new Error("Missing room or user ID"));
        return;
      }

      const messageId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const normalizeLang = (lang: string | null | undefined) => {
        const raw = (lang ?? "").trim();
        if (!raw) return "en";
        return raw.replace(/_/g, "-").split("-")[0]!.toLowerCase();
      };

      const normalizedSourceLang = normalizeLang(sourceLang);

      try {
        const participants = await withRetry(() =>
          db.query.roomParticipants.findMany({
            where: eq(roomParticipants.roomId, socket.roomId!),
            with: {
              user: true,
            },
          }), 2, 500
        );

        // Get the speaker's name for this message
        const speaker = participants.find((p) => p.userId === socket.userId);
        const speakerName = speaker?.user?.displayName || speaker?.user?.name || "Unknown User";

        const otherParticipants = participants.filter((p) => p.userId !== socket.userId);
        if (otherParticipants.length === 0 && !socket.soloMode) return;

        // In solo mode, don't emit translated-message events (only solo-translated)
        if (socket.soloMode) {
          otherParticipants.length = 0; // Prevent translated-message emission
        }

        const participantsByLanguage = new Map<string, typeof otherParticipants>();
        const sameLanguageParticipants: typeof otherParticipants = [];

        for (const participant of otherParticipants) {
          const lang = normalizeLang(participant.user.language || "en");

          if (lang === normalizedSourceLang) {
            sameLanguageParticipants.push(participant);
            continue;
          }

          if (!participantsByLanguage.has(lang)) {
            participantsByLanguage.set(lang, []);
          }
          participantsByLanguage.get(lang)!.push(participant);
        }

        // Deliver transcript directly (no translation) to participants already using the speaker's language.
        for (const participant of sameLanguageParticipants) {
          io.to(`user:${participant.userId}`).emit("translated-message", {
            originalText: transcript,
            translatedText: transcript,
            sourceLang: normalizedSourceLang,
            targetLang: normalizedSourceLang,
            fromUserId: socket.userId,
            toUserId: participant.userId,
            speakerName,
          });
        }

        if (participantsByLanguage.size > 0) {
          const translationPromises = Array.from(participantsByLanguage.entries()).map(
            async ([targetLang, participants]) => {
              try {
                const translationEngine = translationRegistry.getEngine(socket.userId);
                const translatedText = await withRetry(
                  () => translationEngine.translate({
                    text: transcript,
                    sourceLang: normalizedSourceLang,
                    targetLang,
                    context: `Room: ${socket.roomId}`
                  }),
                  2, 1000
                );
                return { targetLang, translatedText, participants, success: true };
              } catch (error) {
                return { targetLang, participants, error, success: false };
              }
            }
          );

          const translations = await Promise.all(translationPromises);

          for (const result of translations) {
            if (result.success) {
              const { targetLang, translatedText, participants } = result as any;
              for (const participant of participants) {
                io.to(`user:${participant.userId}`).emit("translated-message", {
                  originalText: transcript,
                  translatedText,
                  sourceLang: normalizedSourceLang,
                  targetLang,
                  fromUserId: socket.userId,
                  toUserId: participant.userId,
                  speakerName,
                });
              }
            } else {
              const { targetLang, error } = result as any;
              logger.warn("Translation failed for language group", {
                userId: socket.userId,
                roomId: socket.roomId,
                error,
                targetLang
              });
              // Continue with other translations even if one fails
            }
          }
        }

        // Also emit back to the sender so they see their own recognized text
        socket.emit("recognized-speech", {
          id: messageId,
          text: transcript,
          sourceLang: normalizedSourceLang,
          speakerName,
        });

        if (socket.soloMode && socket.soloTargetLang) {
          try {
            const translationEngine = translationRegistry.getEngine(socket.userId);
            const translatedText = await withRetry(
              () => translationEngine.translate({
                text: transcript,
                sourceLang: normalizedSourceLang,
                targetLang: socket.soloTargetLang!,
                context: `Solo mode - Room: ${socket.roomId}`
              }),
              2, 1000
            );

            socket.emit("solo-translated", {
              id: messageId,
              originalText: transcript,
              translatedText,
              sourceLang,
              targetLang: socket.soloTargetLang,
              speakerName,
            });
          } catch (error) {
            handleSocketError(socket, "solo-translation", error, "Translation failed in solo mode", {
              transcript: transcript.substring(0, 100)
            });
          }
        }
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
            }), 2, 500
          );
        }

        socket.roomId = room.id;
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
      if (socket.roomId) {
        socket.to(socket.roomId).emit("user-left", { userId: socket.userId });
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
      handleTranscript(data.transcript, data.sourceLang);
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

    socket.on("disconnect", (reason) => {
      logger.info(`User disconnected from socket`, {
        userId: socket.userId,
        reason,
        roomId: socket.roomId
      });
      stopRecognition();
      if (socket.roomId) {
        socket.to(socket.roomId).emit("user-left", { userId: socket.userId });
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
