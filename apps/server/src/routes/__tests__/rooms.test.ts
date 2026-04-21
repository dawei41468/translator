import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { db } from '../../../../../packages/db/src/index.js';
import { roomsRouter } from '../rooms.js';

vi.mock('../../../../../packages/db/src/index.js', () => ({
  db: {
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
  },
}));



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

    it('regenerates code if collision occurs', async () => {
      const app = createApp();
      let callCount = 0;
      (db.query.rooms.findFirst as any).mockImplementation(() => {
        callCount++;
        return callCount === 1 ? { id: 'existing' } : null;
      });

      const res = await request(app).post('/api/rooms').send({});
      expect(res.status).toBe(200);
      expect(db.query.rooms.findFirst).toHaveBeenCalledTimes(2);
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
