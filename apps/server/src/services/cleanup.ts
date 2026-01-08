import cron from "node-cron";
import { sql } from "drizzle-orm";
import { db } from "../../../../packages/db/src/index.js";
import { logger } from "../logger.js";
import fs from "fs/promises";
import path from "path";

/**
 * Cleanup service for managing room lifecycles and file caches.
 */
export class CleanupService {
  /**
   * Initializes the scheduled cleanup tasks.
   */
  static init() {
    // Schedule room cleanup every hour
    cron.schedule('0 * * * *', async () => {
      await this.cleanupExpiredRooms();
    });

    // Schedule TTS cache cleanup daily at 3:00 AM
    cron.schedule('0 3 * * *', async () => {
      await this.cleanupTtsCache();
    });
    
    logger.info('Cleanup service initialized');
  }

  /**
   * Performs the actual cleanup of rooms older than 24 hours.
   */
  static async cleanupExpiredRooms() {
    try {
      const result = await db.execute(sql`delete from rooms where created_at < now() - interval '24 hours'`);
      logger.info('Expired room cleanup completed');
      return result;
    } catch (error) {
      logger.error('Error cleaning up expired rooms', error);
      throw error;
    }
  }

  /**
   * Deletes TTS cache files older than 7 days.
   */
  static async cleanupTtsCache() {
    const CACHE_DIR = path.resolve(process.cwd(), 'cache/tts');
    const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    try {
      // Check if directory exists first
      try {
        await fs.access(CACHE_DIR);
      } catch {
        return; // Cache dir doesn't exist yet, nothing to clean
      }

      const files = await fs.readdir(CACHE_DIR);
      const now = Date.now();
      let deletedCount = 0;

      for (const file of files) {
        if (!file.endsWith('.mp3')) continue;
        
        const filePath = path.join(CACHE_DIR, file);
        try {
          const stats = await fs.stat(filePath);
          
          if (now - stats.mtimeMs > MAX_AGE_MS) {
            await fs.unlink(filePath);
            deletedCount++;
          }
        } catch (err) {
          // Ignore errors for individual files (e.g. race conditions)
        }
      }
      
      if (deletedCount > 0) {
        logger.info(`TTS cache cleanup: deleted ${deletedCount} old files`);
      }
    } catch (error) {
      logger.error('Error cleaning up TTS cache', error);
    }
  }
}
