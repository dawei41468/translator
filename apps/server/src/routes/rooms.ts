import express from "express";
import { db } from "../../../../packages/db/src/index.js";
import { rooms, roomParticipants } from "../../../../packages/db/src/schema.js";
import { eq, lt, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

// Create a new room
router.post("/", async (req, res) => {
  try {
    const userId = req.user!.id;

    // Generate unique room code
    let roomCode: string;
    let existingRoom;
    do {
      roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      existingRoom = await db.query.rooms.findFirst({
        where: eq(rooms.code, roomCode),
      });
    } while (existingRoom);

    const [newRoom] = await db.insert(rooms).values({
      code: roomCode,
      createdBy: userId,
    }).returning();

    // Add creator as participant
    await db.insert(roomParticipants).values({
      roomId: newRoom.id,
      userId,
    });

    res.json({
      roomId: newRoom.id,
      roomCode: newRoom.code,
    });
  } catch (error) {
    console.error("Error creating room:", error);
    res.status(500).json({ error: "Failed to create room" });
  }
});

// Join a room by code
router.post("/join/:code", async (req, res) => {
  try {
    const userId = req.user!.id;
    const roomCode = req.params.code.toUpperCase();

    const room = await db.query.rooms.findFirst({
      where: eq(rooms.code, roomCode),
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Check if user is already a participant
    const existingParticipant = await db.query.roomParticipants.findFirst({
      where: (rp, { and }) => and(
        eq(rp.roomId, room.id),
        eq(rp.userId, userId)
      ),
    });

    if (existingParticipant) {
      return res.json({
        roomId: room.id,
        roomCode: room.code,
        alreadyJoined: true,
      });
    }

    // Check room capacity (max 10 for multi-user support)
    const participantCount = await db.$count(roomParticipants, eq(roomParticipants.roomId, room.id));
    if (participantCount >= 10) {
      return res.status(400).json({ error: "Room is full" });
    }

    await db.insert(roomParticipants).values({
      roomId: room.id,
      userId,
    });

    res.json({
      roomId: room.id,
      roomCode: room.code,
    });
  } catch (error) {
    console.error("Error joining room:", error);
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
      })),
    });
  } catch (error) {
    console.error("Error getting room:", error);
    res.status(500).json({ error: "Failed to get room" });
  }
});

// Cleanup expired rooms (24h old)
router.delete("/cleanup", async (req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Delete rooms older than 24 hours
    const deletedRooms = await db.delete(rooms)
      .where(lt(rooms.createdAt, twentyFourHoursAgo))
      .returning();

    res.json({
      message: `Cleaned up ${deletedRooms.length} expired rooms`,
      deletedCount: deletedRooms.length
    });
  } catch (error) {
    console.error("Error cleaning up rooms:", error);
    res.status(500).json({ error: "Failed to cleanup rooms" });
  }
});

export { router as roomsRouter };