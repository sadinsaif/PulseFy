import { drizzle } from "drizzle-orm/vercel-postgres";
import { sql, createPool } from "@vercel/postgres";
import * as schema from "./schema";

/**
 * Drizzle client backed by Vercel Postgres / Neon.
 *
 * The default `sql` client only reads the POSTGRES_URL env var. The Neon
 * marketplace integration, however, may expose the connection string under a
 * different name (e.g. DATABASE_URL). To work with either, we fall back to a
 * pool built from whichever connection string is present.
 */
const connectionString =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

const client =
  process.env.POSTGRES_URL || !connectionString
    ? sql
    : createPool({ connectionString });

export const db = drizzle(client, { schema });
