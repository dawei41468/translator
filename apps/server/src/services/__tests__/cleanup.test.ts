import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from "../../../../../packages/db/src/index.js";
import { sql } from "drizzle-orm";
import { logger } from "../../logger.js";
import { CleanupService } from "../cleanup.js";
import fs from "fs/promises";
import path from "path";

vi.mock('../../../../../packages/db/src/index.js', () => ({
  db: {
    execute: vi.fn(),
  },
}));

vi.mock('../../logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    unlink: vi.fn(),
  },
}));

vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('path')>();
  return {
    ...actual,
    resolve: vi.fn((...args: string[]) => args.join('/')),
    join: actual.join,
  };
});

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

  describe('cleanupExpiredRooms', () => {
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

  describe('cleanupGuestAccounts', () => {
    it('should delete guest accounts older than 24 hours', async () => {
      (db.execute as any).mockResolvedValue([{ id: 1 }, { id: 2 }]);

      await CleanupService.cleanupGuestAccounts();

      expect(db.execute).toHaveBeenCalledWith(
        sql`delete from users where is_guest = true and created_at < now() - interval '24 hours'`
      );
      expect(logger.info).toHaveBeenCalledWith('Guest account cleanup: deleted 2 stale accounts');
    });

    it('should not log when no accounts were deleted', async () => {
      (db.execute as any).mockResolvedValue([]);

      await CleanupService.cleanupGuestAccounts();

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should log error and not throw if cleanup fails', async () => {
      const error = new Error('DB Error');
      (db.execute as any).mockRejectedValue(error);

      await CleanupService.cleanupGuestAccounts();

      expect(logger.error).toHaveBeenCalledWith('Error cleaning up guest accounts', error);
    });
  });

  describe('cleanupTtsCache', () => {
    it('should do nothing if cache dir does not exist', async () => {
      (fs.access as any).mockRejectedValue(new Error('ENOENT'));
      
      await CleanupService.cleanupTtsCache();
      
      expect(fs.readdir).not.toHaveBeenCalled();
    });

    it('should delete mp3 files older than 7 days', async () => {
      const now = Date.now();
      const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;
      const oneDayAgo = now - 1 * 24 * 60 * 60 * 1000;

      (fs.access as any).mockResolvedValue(undefined);
      (fs.readdir as any).mockResolvedValue(['old.mp3', 'new.mp3', 'not-mp3.txt']);
      (fs.stat as any).mockImplementation((filePath: string) => {
        if (filePath.includes('old')) {
          return Promise.resolve({ mtimeMs: eightDaysAgo });
        }
        return Promise.resolve({ mtimeMs: oneDayAgo });
      });
      (fs.unlink as any).mockResolvedValue(undefined);

      await CleanupService.cleanupTtsCache();

      expect(fs.unlink).toHaveBeenCalledTimes(1);
      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('old.mp3'));
      expect(fs.unlink).not.toHaveBeenCalledWith(expect.stringContaining('new.mp3'));
      expect(logger.info).toHaveBeenCalledWith('TTS cache cleanup: deleted 1 old files');
    });

    it('should handle errors for individual files gracefully', async () => {
      const now = Date.now();
      const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;

      (fs.access as any).mockResolvedValue(undefined);
      (fs.readdir as any).mockResolvedValue(['bad.mp3']);
      (fs.stat as any).mockResolvedValue({ mtimeMs: eightDaysAgo });
      (fs.unlink as any).mockRejectedValue(new Error('Permission denied'));

      await CleanupService.cleanupTtsCache();

      expect(fs.unlink).toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should log error if readdir fails', async () => {
      (fs.access as any).mockResolvedValue(undefined);
      (fs.readdir as any).mockRejectedValue(new Error('Disk error'));

      await CleanupService.cleanupTtsCache();

      expect(logger.error).toHaveBeenCalledWith('Error cleaning up TTS cache', expect.any(Error));
    });
  });
});
