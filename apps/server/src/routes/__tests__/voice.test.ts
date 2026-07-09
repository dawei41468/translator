import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { voiceRouter } from '../voice.js';

vi.mock('../../middleware/auth.js', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'test@example.com' };
    next();
  },
}));

vi.mock('../../logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/voice', voiceRouter);
  return app;
}

describe('Voice Routes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('POST /api/voice/ephemeral', () => {
    it('returns 500 when GROK_API_KEY is not set', async () => {
      delete process.env.GROK_API_KEY;

      const app = createApp();
      const res = await request(app).post('/api/voice/ephemeral').send({});
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('GROK_API_KEY is not configured');
    });

    it('returns ephemeral token on success', async () => {
      process.env.GROK_API_KEY = 'test-key';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          client_secret: {
            value: 'ephemeral-token-123',
            expires_at: '2026-01-01T00:00:00Z',
          },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const app = createApp();
      const res = await request(app).post('/api/voice/ephemeral').send({});
      expect(res.status).toBe(200);
      expect(res.body.value).toBe('ephemeral-token-123');
      expect(res.body.expires_at).toBe('2026-01-01T00:00:00Z');
    });

    it('clamps expires_after to max 300 seconds', async () => {
      process.env.GROK_API_KEY = 'test-key';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ client_secret: { value: 'token', expires_at: null } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const app = createApp();
      await request(app).post('/api/voice/ephemeral').send({ expires_after: { seconds: 600 } });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.expires_after.seconds).toBe(300);
    });

    it('passes allowed expires_after values through', async () => {
      process.env.GROK_API_KEY = 'test-key';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ client_secret: { value: 'token', expires_at: null } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const app = createApp();
      await request(app).post('/api/voice/ephemeral').send({ expires_after: { seconds: 120 } });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.expires_after.seconds).toBe(120);
    });

    it('uses default 300s when expires_after not provided', async () => {
      process.env.GROK_API_KEY = 'test-key';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ client_secret: { value: 'token', expires_at: null } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const app = createApp();
      await request(app).post('/api/voice/ephemeral').send({});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.expires_after.seconds).toBe(300);
    });

    it('returns Grok API error status when request fails', async () => {
      process.env.GROK_API_KEY = 'test-key';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('rate limited'),
      });
      vi.stubGlobal('fetch', mockFetch);

      const app = createApp();
      const res = await request(app).post('/api/voice/ephemeral').send({});
      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Failed to create voice session token');
    });

    it('returns 500 when fetch throws', async () => {
      process.env.GROK_API_KEY = 'test-key';

      const mockFetch = vi.fn().mockRejectedValue(new Error('network error'));
      vi.stubGlobal('fetch', mockFetch);

      const app = createApp();
      const res = await request(app).post('/api/voice/ephemeral').send({});
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to create voice session');
    });

    it('uses custom GROK_API_BASE_URL when set', async () => {
      process.env.GROK_API_KEY = 'test-key';
      process.env.GROK_API_BASE_URL = 'https://custom.api.example.com/v1/';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ client_secret: { value: 'token', expires_at: null } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const app = createApp();
      await request(app).post('/api/voice/ephemeral').send({});

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.api.example.com/v1/realtime/client_secrets',
        expect.any(Object)
      );
    });
  });
});
