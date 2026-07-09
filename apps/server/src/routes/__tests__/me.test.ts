import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { db } from '../../../../../packages/db/src/index.js';
import { meRouter } from '../me.js';

vi.mock('../../services/auth-session.js', () => ({
  AUTH_COOKIE_NAME: 'auth_token',
  verifyAuthToken: vi.fn(),
}));

vi.mock('../../../../../packages/db/src/index.js', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
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
      preferences: {},
    };
    next();
  },
  parseCookies: vi.fn(),
}));

import { verifyAuthToken } from '../../services/auth-session.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/me', meRouter);
  return app;
}

describe('Me Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/me', () => {
    it('returns null user when no cookie is present', async () => {
      const { parseCookies } = await import('../../middleware/auth.js');
      (parseCookies as any).mockReturnValue({});

      const app = createApp();
      const res = await request(app).get('/api/me');
      expect(res.status).toBe(200);
      expect(res.body.user).toBeNull();
    });

    it('returns null user when token is invalid', async () => {
      const { parseCookies } = await import('../../middleware/auth.js');
      (parseCookies as any).mockReturnValue({ auth_token: 'bad-token' });
      (verifyAuthToken as any).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app).get('/api/me');
      expect(res.status).toBe(200);
      expect(res.body.user).toBeNull();
    });

    it('returns null user when session verification fails', async () => {
      const { parseCookies } = await import('../../middleware/auth.js');
      (parseCookies as any).mockReturnValue({ auth_token: 'valid-token' });
      (verifyAuthToken as any).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app).get('/api/me');
      expect(res.status).toBe(200);
      expect(res.body.user).toBeNull();
    });

    it('returns user data when authenticated', async () => {
      const { parseCookies } = await import('../../middleware/auth.js');
      (parseCookies as any).mockReturnValue({ auth_token: 'valid-token' });
      (verifyAuthToken as any).mockResolvedValue({
        sessionId: 'sid-1',
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test',
          displayName: 'Test',
          language: 'en',
          isGuest: false,
          preferences: { sttEngine: 'grok-stt' },
        },
      });

      const app = createApp();
      const res = await request(app).get('/api/me');
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({
        id: 'user-1',
        email: 'test@example.com',
        language: 'en',
        isGuest: false,
      });
    });

    it('normalizes legacy web-speech-api preferences', async () => {
      const { parseCookies } = await import('../../middleware/auth.js');
      (parseCookies as any).mockReturnValue({ auth_token: 'valid-token' });
      (verifyAuthToken as any).mockResolvedValue({
        sessionId: 'sid-1',
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test',
          displayName: 'Test',
          language: 'en',
          isGuest: false,
          preferences: { sttEngine: 'web-speech-api', ttsEngine: 'web-speech-api' },
        },
      });

      const app = createApp();
      const res = await request(app).get('/api/me');
      expect(res.body.user.preferences.sttEngine).toBe('grok-stt');
      expect(res.body.user.preferences.ttsEngine).toBe('grok-tts');
    });
  });

  describe('PUT /api/me/language', () => {
    it('returns 400 for invalid language', async () => {
      const app = createApp();
      const res = await request(app).put('/api/me/language').send({ language: 'xx' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid language');
    });

    it('returns 400 when language is missing', async () => {
      const app = createApp();
      const res = await request(app).put('/api/me/language').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid language');
    });

    it('updates language successfully', async () => {
      const app = createApp();
      const res = await request(app).put('/api/me/language').send({ language: 'zh' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Language updated');
    });
  });

  describe('PATCH /api/me', () => {
    it('returns 400 when no valid fields provided', async () => {
      const app = createApp();
      const res = await request(app).patch('/api/me').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No valid fields to update');
    });

    it('returns 400 for invalid displayName', async () => {
      const app = createApp();
      const res = await request(app).patch('/api/me').send({ displayName: 123 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid display name');
    });

    it('returns 400 for displayName exceeding 255 chars', async () => {
      const app = createApp();
      const res = await request(app).patch('/api/me').send({ displayName: 'a'.repeat(256) });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid display name');
    });

    it('returns 400 for invalid language', async () => {
      const app = createApp();
      const res = await request(app).patch('/api/me').send({ language: 'xx' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid language');
    });

    it('returns 400 for invalid preferences format', async () => {
      const app = createApp();
      const res = await request(app).patch('/api/me').send({ preferences: 'bad' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid preferences format');
    });

    it('returns 400 for invalid STT engine', async () => {
      const app = createApp();
      const res = await request(app).patch('/api/me').send({ preferences: { sttEngine: 'invalid' } });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid STT engine');
    });

    it('returns 400 for invalid TTS engine', async () => {
      const app = createApp();
      const res = await request(app).patch('/api/me').send({ preferences: { ttsEngine: 'invalid' } });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid TTS engine');
    });

    it('returns 400 for invalid translation engine', async () => {
      const app = createApp();
      const res = await request(app).patch('/api/me').send({ preferences: { translationEngine: 'invalid' } });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid translation engine');
    });

    it('updates displayName successfully', async () => {
      const app = createApp();
      const res = await request(app).patch('/api/me').send({ displayName: 'New Name' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Profile updated');
    });

    it('updates preferences successfully', async () => {
      const app = createApp();
      const res = await request(app).patch('/api/me').send({ preferences: { sttEngine: 'grok-stt' } });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Profile updated');
    });

    it('normalizes legacy web-speech-api preferences on update', async () => {
      const app = createApp();
      const res = await request(app).patch('/api/me').send({
        preferences: { sttEngine: 'web-speech-api', ttsEngine: 'web-speech-api' },
      });
      expect(res.status).toBe(200);
    });
  });
});
