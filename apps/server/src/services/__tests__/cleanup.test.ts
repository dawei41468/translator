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

describe('CleanupService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute the cleanup query', async () => {
    (db.execute as any).mockResolvedValue({ rowCount: 1 });
    
    await CleanupService.cleanupExpiredRooms();
    
    expect(db.execute).toHaveBeenCalledWith(expect.anything());
    // Verify it contains the delete from rooms logic
    const calledSql = (db.execute as any).mock.calls[0][0];
    expect(calledSql.sqlChunks[0]).toContain('delete from rooms where created_at < now() - interval \'24 hours\'');
  });

  it('should throw and log error if cleanup fails', async () => {
    const error = new Error('DB Error');
    (db.execute as any).mockRejectedValue(error);
    
    await expect(CleanupService.cleanupExpiredRooms()).rejects.toThrow('DB Error');
  });
});
