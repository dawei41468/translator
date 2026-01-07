import cron from "node-cron";
import { sql } from "drizzle-orm";
import { db } from "../../../../packages/db/src/index.js";
import { logger } from "../logger.js";

/**
 * Cleanup service for managing room lifecycles.
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
}
