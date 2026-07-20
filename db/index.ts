import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "./schema";
import { getDatabaseUrl } from "@/lib/env";

let client: ReturnType<typeof postgres> | undefined;
let database: PostgresJsDatabase<typeof schema> | undefined;

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!database) {
    client = postgres(getDatabaseUrl(), {
      max: 10,
      prepare: false,
    });
    database = drizzle(client, { schema });
  }

  return database;
}
