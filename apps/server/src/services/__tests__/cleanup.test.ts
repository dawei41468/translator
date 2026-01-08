import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from "../../../../../packages/db/src/index.js";
import { sql } from "drizzle-orm";
import { logger } from "../../logger.js";
import { CleanupService } from "../cleanup.js";

vi.mock('../../../../../packages/db/src/index.js', () => ({
  db: {
    execute: vi.fn(),
  },
}));

vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

function extractSqlText(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.sql === 'string') return value.sql;
  if (Array.isArray(value.queryChunks)) {
    return value.queryChunks
      .map((chunk: any) => {
        if (typeof chunk === 'string') return chunk;
        if (typeof chunk?.value === 'string') return chunk.value;
        if (typeof chunk?.sql === 'string') return chunk.sql;
        return '';
      })
      .join('');
  }
  if (Array.isArray(value.sqlChunks)) {
    return value.sqlChunks
      .map((chunk: any) => (typeof chunk === 'string' ? chunk : ''))
      .join('');
  }
  if (typeof value.toString === 'function') return String(value);
  return '';
}

describe('CleanupService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute the cleanup query', async () => {
    (db.execute as any).mockResolvedValue({ rowCount: 1 });
    
    await CleanupService.cleanupExpiredRooms();
    
    expect(db.execute).toHaveBeenCalledWith(
      sql`delete from rooms where created_at < now() - interval '24 hours'`
    );
  });

  it('should throw and log error if cleanup fails', async () => {
    const error = new Error('DB Error');
    (db.execute as any).mockRejectedValue(error);
    
    await expect(CleanupService.cleanupExpiredRooms()).rejects.toThrow('DB Error');
  });
});
