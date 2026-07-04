import { beforeAll, vi } from 'vitest';

// Mock environment variables
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

// Mock database
vi.mock('../../../packages/db/src/index.js', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
      rooms: {
        findFirst: vi.fn(),
      },
      roomParticipants: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{}]),
      }),
    }),
    $count: vi.fn().mockResolvedValue(0),
  },
}));