import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCookies, authenticate } from '../auth.js';

vi.mock('../../services/auth-session.js', () => ({
  AUTH_COOKIE_NAME: 'auth_token',
  verifyAuthToken: vi.fn(),
}));

import { verifyAuthToken } from '../../services/auth-session.js';

describe('parseCookies', () => {
  it('returns empty object for undefined header', () => {
    expect(parseCookies(undefined)).toEqual({});
  });

  it('returns empty object for empty string', () => {
    expect(parseCookies('')).toEqual({});
  });

  it('parses a single cookie', () => {
    expect(parseCookies('auth_token=abc123')).toEqual({ auth_token: 'abc123' });
  });

  it('parses multiple cookies', () => {
    expect(parseCookies('a=1; b=2; c=3')).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('trims whitespace around keys and values', () => {
    expect(parseCookies('  a = 1  ;  b = 2  ')).toEqual({ a: '1', b: '2' });
  });

  it('decodes URL-encoded values', () => {
    expect(parseCookies('key=hello%20world')).toEqual({ key: 'hello world' });
  });

  it('ignores malformed parts without equals sign', () => {
    expect(parseCookies('a=1; malformed; b=2')).toEqual({ a: '1', b: '2' });
  });
});

describe('authenticate middleware', () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    vi.clearAllMocks();
    req = { headers: {} };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  it('returns 401 when no cookie header is present', async () => {
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not authenticated' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when auth_token cookie is missing', async () => {
    req.headers.cookie = 'other_cookie=value';
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not authenticated' });
  });

  it('returns 401 when session verification fails', async () => {
    req.headers.cookie = 'auth_token=badtoken';
    (verifyAuthToken as any).mockResolvedValue(null);
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
  });

  it('returns 401 when verifyAuthToken throws', async () => {
    req.headers.cookie = 'auth_token=badtoken';
    (verifyAuthToken as any).mockRejectedValue(new Error('db down'));
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
  });

  it('calls next and sets req.user when token and session are valid', async () => {
    req.headers.cookie = 'auth_token=validtoken';
    const user = { id: 'user-123', email: 'test@example.com' };
    (verifyAuthToken as any).mockResolvedValue({ user, sessionId: 'sid-1' });
    await authenticate(req, res, next);
    expect(req.user).toBe(user);
    expect(req.sessionId).toBe('sid-1');
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
