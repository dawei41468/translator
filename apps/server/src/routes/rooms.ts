import express from "express";
import { db } from "../../../../packages/db/src/index.js";
import { rooms, roomParticipants } from "../../../../packages/db/src/schema.js";
import { eq, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import { isUniqueViolation } from "../services/socket-utils.js";

const router = express.Router();

const MAX_CODE_COLLISION_RETRIES = 10;
const MAX_ROOM_PARTICIPANTS = 10;

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Create a new room
router.post("/", async (req, res) => {
  const userId = req.user!.id;

  try {
    for (let attempt = 0; attempt < MAX_CODE_COLLISION_RETRIES; attempt++) {
      const roomCode = generateRoomCode();

      try {
        const newRoom = await db.transaction(async (tx) => {
          const [room] = await tx.insert(rooms).values({
            code: roomCode,
            createdBy: userId,
          }).returning();

          await tx.insert(roomParticipants).values({
            roomId: room.id,
            userId,
          });

          return room;
        });

        return res.json({
          roomId: newRoom.id,
          roomCode: newRoom.code,
        });
      } catch (error) {
        // A concurrent request created the same code; retry with a new one.
        if (isUniqueViolation(error)) {
          continue;
        }
        throw error;
      }
    }

    logger.error("Failed to generate a unique room code after max retries", { userId });
    res.status(500).json({ error: "Failed to create room" });
  } catch (error) {
    logger.error("Error creating room", error, { userId: req.user?.id });
    res.status(500).json({ error: "Failed to create room" });
  }
});

type JoinResult =
  | { kind: "notFound" }
  | { kind: "alreadyJoined"; roomId: string; roomCode: string }
  | { kind: "full" }
  | { kind: "joined"; roomId: string; roomCode: string };

// Join a room by code
router.post("/join/:code", async (req, res) => {
  const userId = req.user!.id;
  const roomCode = req.params.code.toUpperCase();

  try {
    let result: JoinResult | null;

    try {
      result = await db.transaction(async (tx) => {
        const room = await tx.query.rooms.findFirst({
          where: eq(rooms.code, roomCode),
        });

        if (!room) {
          return { kind: "notFound" as const };
        }

        const existingParticipant = await tx.query.roomParticipants.findFirst({
          where: (rp, { and }) => and(
            eq(rp.roomId, room.id),
            eq(rp.userId, userId)
          ),
        });

        if (existingParticipant) {
          return { kind: "alreadyJoined" as const, roomId: room.id, roomCode: room.code };
        }

        const participantCount = await tx.$count(roomParticipants, eq(roomParticipants.roomId, room.id));
        if (participantCount >= MAX_ROOM_PARTICIPANTS) {
          return { kind: "full" as const };
        }

        await tx.insert(roomParticipants).values({
          roomId: room.id,
          userId,
        });

        return { kind: "joined" as const, roomId: room.id, roomCode: room.code };
      });
    } catch (error) {
      // Another request joined concurrently; the unique constraint guarantees
      // the user is now a participant, so re-fetch the room info.
      if (isUniqueViolation(error)) {
        const room = await db.query.rooms.findFirst({
          where: eq(rooms.code, roomCode),
        });
        result = room
          ? { kind: "alreadyJoined", roomId: room.id, roomCode: room.code }
          : { kind: "notFound" };
      } else {
        throw error;
      }
    }

    switch (result.kind) {
      case "notFound":
        return res.status(404).json({ error: "Room not found" });
      case "full":
        return res.status(400).json({ error: "Room is full" });
      case "alreadyJoined":
        return res.json({
          roomId: result.roomId,
          roomCode: result.roomCode,
          alreadyJoined: true,
        });
      case "joined":
        return res.json({
          roomId: result.roomId,
          roomCode: result.roomCode,
        });
    }
  } catch (error) {
    logger.error("Error joining room", error, { userId: req.user?.id, roomCode: req.params.code });
    res.status(500).json({ error: "Failed to join room" });
  }
});

// Get room info by code
router.get("/:code", async (req, res) => {
  try {
    const roomCode = req.params.code.toUpperCase();
    const userId = req.user!.id;

    const room = await db.query.rooms.findFirst({
      where: eq(rooms.code, roomCode),
      with: {
        participants: {
          with: {
            user: true,
          },
        },
      },
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Check if user is participant
    const isParticipant = room.participants.some(p => p.userId === userId);
    if (!isParticipant) {
      return res.status(403).json({ error: "Not authorized to view this room" });
    }

    res.json({
      id: room.id,
      code: room.code,
      participants: room.participants.map(p => ({
        id: p.user.id,
        name: p.user.name,
        language: p.user.language,
        status: p.status,
        lastSeen: p.lastSeen,
        backgroundedAt: p.backgroundedAt,
      })),
    });
  } catch (error) {
    logger.error("Error getting room", error, { userId: req.user?.id, roomCode: req.params.code });
    res.status(500).json({ error: "Failed to get room" });
  }
});

export { router as roomsRouter };
