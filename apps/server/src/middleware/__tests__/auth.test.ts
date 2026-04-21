import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { db } from '../../../../../packages/db/src/index.js';
import { parseCookies, authenticate } from '../auth.js';

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
    sign: vi.fn(),
  },
}));

vi.mock('../../../../../packages/db/src/index.js', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
    },
  },
}));

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

  it('returns 401 when token verification throws', async () => {
    req.headers.cookie = 'auth_token=badtoken';
    (jwt.verify as any).mockImplementation(() => {
      throw new Error('invalid token');
    });
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
  });

  it('returns 401 when verified payload has no userId', async () => {
    req.headers.cookie = 'auth_token=validtoken';
    (jwt.verify as any).mockReturnValue({});
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
  });

  it('returns 401 when user is not found in database', async () => {
    req.headers.cookie = 'auth_token=validtoken';
    (jwt.verify as any).mockReturnValue({ userId: 'user-123' });
    (db.query.users.findFirst as any).mockResolvedValue(null);
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
  });

  it('calls next and sets req.user when token and user are valid', async () => {
    req.headers.cookie = 'auth_token=validtoken';
    (jwt.verify as any).mockReturnValue({ userId: 'user-123' });
    const user = { id: 'user-123', email: 'test@example.com' };
    (db.query.users.findFirst as any).mockResolvedValue(user);
    await authenticate(req, res, next);
    expect(req.user).toBe(user);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
