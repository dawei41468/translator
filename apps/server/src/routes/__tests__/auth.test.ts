import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../../../../../packages/db/src/index.js';
import { authRouter } from '../auth.js';

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('mock-token'),
    verify: vi.fn(),
  },
}));

vi.mock('../../../../../packages/db/src/index.js', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((vals: any) => ({
        returning: vi.fn().mockResolvedValue([{
          id: 'user-1',
          ...vals,
        }]),
      })),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn().mockResolvedValue('hashed-password'),
  },
}));

vi.mock('../../middleware/auth.js', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test',
      displayName: 'Test',
      language: 'en',
      passwordHash: 'hashed-old',
      preferences: {},
    };
    next();
  },
  parseCookies: vi.fn(),
}));

import bcrypt from 'bcryptjs';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

describe('Auth Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('returns 400 when email or password is missing', async () => {
      const app = createApp();
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing fields');
    });

    it('returns 401 for invalid credentials', async () => {
      const app = createApp();
      (db.query.users.findMany as any).mockResolvedValue([{
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed',
      }]);
      (bcrypt.compare as any).mockResolvedValue(false);

      const res = await request(app).post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'wrongpassword',
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('returns 409 when duplicate emails exist', async () => {
      const app = createApp();
      (db.query.users.findMany as any).mockResolvedValue([
        { id: 'user-1', email: 'test@example.com' },
        { id: 'user-2', email: 'test@example.com' },
      ]);

      const res = await request(app).post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/Multiple accounts/);
    });

    it('returns user and sets cookie on successful login', async () => {
      const app = createApp();
      (db.query.users.findMany as any).mockResolvedValue([{
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        displayName: 'Test User',
        language: 'en',
        passwordHash: 'hashed',
      }]);
      (bcrypt.compare as any).mockResolvedValue(true);

      const res = await request(app).post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      expect(res.headers['set-cookie']).toBeDefined();
    });
  });

  describe('POST /api/auth/register', () => {
    it('returns 400 when fields are missing', async () => {
      const app = createApp();
      const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing fields');
    });

    it('returns 400 when password is too short', async () => {
      const app = createApp();
      const res = await request(app).post('/api/auth/register').send({
        email: 'a@b.com',
        password: '123',
        name: 'Test',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least 8 characters/);
    });

    it('returns 409 when user already exists', async () => {
      const app = createApp();
      (db.query.users.findFirst as any).mockResolvedValue({ id: 'existing' });

      const res = await request(app).post('/api/auth/register').send({
        email: 'existing@example.com',
        password: 'password123',
        name: 'Test',
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('User already exists');
    });

    it('creates user and sets cookie on success', async () => {
      const app = createApp();
      (db.query.users.findFirst as any).mockResolvedValue(null);

      const res = await request(app).post('/api/auth/register').send({
        email: 'new@example.com',
        password: 'password123',
        name: 'New User',
      });
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('new@example.com');
      expect(res.headers['set-cookie']).toBeDefined();
    });
  });

  describe('POST /api/auth/guest-login', () => {
    it('creates a guest user and sets cookie', async () => {
      const app = createApp();
      const res = await request(app).post('/api/auth/guest-login').send({ displayName: 'Guesty' });
      expect(res.status).toBe(200);
      expect(res.body.user.isGuest).toBe(true);
      expect(res.body.user.name).toBe('Guesty');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('uses default display name when not provided', async () => {
      const app = createApp();
      const res = await request(app).post('/api/auth/guest-login').send({});
      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Guest');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the auth cookie', async () => {
      const app = createApp();
      const res = await request(app).post('/api/auth/logout');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out');
      const cookie = res.headers['set-cookie']?.[0] as string;
      expect(cookie).toContain('auth_token=');
      expect(cookie).toMatch(/expires=.*1970|Max-Age=0/i);
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('returns 400 for invalid input (zod error)', async () => {
      const app = createApp();
      const res = await request(app).post('/api/auth/change-password').send({
        currentPassword: '',
        newPassword: 'short',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('returns 401 when current password is wrong', async () => {
      const app = createApp();
      (db.query.users.findFirst as any).mockResolvedValue({
        id: 'user-1',
        passwordHash: 'hashed-old',
      });
      (bcrypt.compare as any).mockResolvedValue(false);

      const res = await request(app).post('/api/auth/change-password').send({
        currentPassword: 'wrong-old',
        newPassword: 'newpassword123',
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid current password');
    });

    it('returns 404 when user not found', async () => {
      const app = createApp();
      (db.query.users.findFirst as any).mockResolvedValue(null);

      const res = await request(app).post('/api/auth/change-password').send({
        currentPassword: 'oldpassword123',
        newPassword: 'newpassword123',
      });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    });

    it('updates password and sets new cookie on success', async () => {
      const app = createApp();
      (db.query.users.findFirst as any).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test',
        language: 'en',
        passwordHash: 'hashed-old',
      });
      (bcrypt.compare as any).mockResolvedValue(true);

      const res = await request(app).post('/api/auth/change-password').send({
        currentPassword: 'oldpassword123',
        newPassword: 'newpassword123',
      });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Password updated');
      expect(res.headers['set-cookie']).toBeDefined();
    });
  });
});
