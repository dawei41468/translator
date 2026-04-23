import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Load .env file with robust path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try multiple possible locations for .env file
const possibleEnvPaths = [
  path.join(__dirname, '../../../.env'), // From packages/db/src (development)
  path.join(__dirname, '../../.env'),    // From packages/db/dist (built)
  path.join(process.cwd(), '.env'),     // From current working directory
  path.join(process.cwd(), '../.env'),  // From parent directory
];

// Find the first existing .env file
let envPath = null;
for (const envPathCandidate of possibleEnvPaths) {
  if (fs.existsSync(envPathCandidate)) {
    envPath = envPathCandidate;
    break;
  }
}

if (envPath) {
  config({ path: envPath });
} else {
  throw new Error(`CRITICAL: .env file not found. Attempted locations: ${possibleEnvPaths.join(', ')}. Please ensure the .env file exists in the root directory.`);
}

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

const sql = postgres(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
