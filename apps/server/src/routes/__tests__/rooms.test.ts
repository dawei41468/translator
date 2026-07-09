import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { db } from '../../../../../packages/db/src/index.js';
import { roomsRouter } from '../rooms.js';

vi.mock('../../../../../packages/db/src/index.js', () => {
  const mockDb = {
    query: {
      rooms: {
        findFirst: vi.fn(),
      },
      roomParticipants: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((vals: any) => ({
        returning: vi.fn().mockResolvedValue([{ id: 'room-id-1', ...vals }]),
      })),
    }),
    $count: vi.fn().mockResolvedValue(0),
    transaction: vi.fn(async (callback: any) => callback(mockDb)),
  };
  return { db: mockDb };
});

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.user = { id: 'user-1' };
    next();
  });
  app.use('/api/rooms', roomsRouter);
  return app;
}

describe('Rooms Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mutable mock state between tests
    (db.query.rooms.findFirst as any).mockReset();
    (db.query.roomParticipants.findFirst as any).mockReset();
    (db.$count as any).mockReset().mockResolvedValue(0);
    (db.insert as any).mockReturnValue({
      values: vi.fn().mockImplementation((vals: any) => ({
        returning: vi.fn().mockResolvedValue([{ id: 'room-id-1', ...vals }]),
      })),
    });
    (db.transaction as any).mockImplementation(async (callback: any) => callback(db));
  });

  describe('POST /api/rooms', () => {
    it('creates a room and returns room code', async () => {
      const app = createApp();
      (db.query.rooms.findFirst as any).mockResolvedValue(null);

      const res = await request(app).post('/api/rooms').send({});
      expect(res.status).toBe(200);
      expect(res.body.roomId).toBe('room-id-1');
      expect(res.body.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('retries on room code collision', async () => {
      const app = createApp();
      // Simulate a unique violation on the first transaction attempt, then success.
      let attempt = 0;
      (db.transaction as any).mockImplementation(async (callback: any) => {
        attempt++;
        if (attempt === 1) {
          const error = new Error('duplicate key value violates unique constraint') as any;
          error.code = '23505';
          throw error;
        }
        return callback(db);
      });

      const res = await request(app).post('/api/rooms').send({});
      expect(res.status).toBe(200);
      expect(res.body.roomCode).toMatch(/^[A-Z0-9]{6}$/);
      expect(db.transaction).toHaveBeenCalledTimes(2);
    });
  });

  describe('POST /api/rooms/join/:code', () => {
    it('returns 404 when room not found', async () => {
      const app = createApp();
      (db.query.rooms.findFirst as any).mockResolvedValue(null);

      const res = await request(app).post('/api/rooms/join/ABCDEF').send({});
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Room not found');
    });

    it('returns alreadyJoined when user is already a participant', async () => {
      const app = createApp();
      (db.query.rooms.findFirst as any).mockResolvedValue({ id: 'room-1', code: 'ABCDEF' });
      (db.query.roomParticipants.findFirst as any).mockResolvedValue({ id: 'part-1' });

      const res = await request(app).post('/api/rooms/join/ABCDEF').send({});
      expect(res.status).toBe(200);
      expect(res.body.alreadyJoined).toBe(true);
    });

    it('returns 400 when room is full', async () => {
      const app = createApp();
      (db.query.rooms.findFirst as any).mockResolvedValue({ id: 'room-1', code: 'ABCDEF' });
      (db.query.roomParticipants.findFirst as any).mockResolvedValue(null);
      (db.$count as any).mockResolvedValue(10);

      const res = await request(app).post('/api/rooms/join/ABCDEF').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Room is full');
    });

    it('joins room successfully', async () => {
      const app = createApp();
      (db.query.rooms.findFirst as any).mockResolvedValue({ id: 'room-1', code: 'ABCDEF' });
      (db.query.roomParticipants.findFirst as any).mockResolvedValue(null);
      (db.$count as any).mockResolvedValue(3);

      const res = await request(app).post('/api/rooms/join/abcdef').send({});
      expect(res.status).toBe(200);
      expect(res.body.roomId).toBe('room-1');
      expect(res.body.roomCode).toBe('ABCDEF');
    });

    it('returns alreadyJoined on concurrent join unique violation', async () => {
      const app = createApp();
      (db.query.rooms.findFirst as any)
        .mockResolvedValueOnce({ id: 'room-1', code: 'ABCDEF' }) // inside transaction
        .mockResolvedValueOnce({ id: 'room-1', code: 'ABCDEF' }); // re-fetch after unique violation
      (db.query.roomParticipants.findFirst as any).mockResolvedValue(null);
      (db.$count as any).mockResolvedValue(3);

      const uniqueViolationError = new Error('duplicate key value violates unique constraint') as any;
      uniqueViolationError.code = '23505';
      (db.transaction as any).mockRejectedValue(uniqueViolationError);

      const res = await request(app).post('/api/rooms/join/ABCDEF').send({});
      expect(res.status).toBe(200);
      expect(res.body.alreadyJoined).toBe(true);
      expect(res.body.roomId).toBe('room-1');
    });
  });

  describe('GET /api/rooms/:code', () => {
    it('returns 404 when room not found', async () => {
      const app = createApp();
      (db.query.rooms.findFirst as any).mockResolvedValue(null);

      const res = await request(app).get('/api/rooms/ABCDEF');
      expect(res.status).toBe(404);
    });

    it('returns 403 when user is not a participant', async () => {
      const app = createApp();
      (db.query.rooms.findFirst as any).mockResolvedValue({
        id: 'room-1',
        code: 'ABCDEF',
        participants: [{ userId: 'other-user', user: { id: 'other-user', name: 'Other', language: 'en' } }],
      });

      const res = await request(app).get('/api/rooms/ABCDEF');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Not authorized to view this room');
    });

    it('returns room info with participants', async () => {
      const app = createApp();
      (db.query.rooms.findFirst as any).mockResolvedValue({
        id: 'room-1',
        code: 'ABCDEF',
        participants: [
          { userId: 'user-1', user: { id: 'user-1', name: 'Me', language: 'en' }, status: 'active', lastSeen: new Date(), backgroundedAt: null },
        ],
      });

      const res = await request(app).get('/api/rooms/ABCDEF');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('ABCDEF');
      expect(res.body.participants).toHaveLength(1);
      expect(res.body.participants[0].name).toBe('Me');
    });
  });
});
