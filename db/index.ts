import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Configure a D1 database binding named `DB` for this environment before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
