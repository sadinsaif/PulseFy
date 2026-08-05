import { drizzle } from "drizzle-orm/vercel-postgres";
import { sql } from "@vercel/postgres";
import * as schema from "./schema";

/**
 * Drizzle client backed by Vercel Postgres.
 * Import `db` anywhere you need to query the database.
 */
export const db = drizzle(sql, { schema });
