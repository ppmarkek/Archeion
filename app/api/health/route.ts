import { sql } from "drizzle-orm";

import { getDb } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);

    return Response.json({ status: "ok", database: "up" });
  } catch (error) {
    console.error("Database health check failed", error);

    return Response.json(
      { status: "error", database: "down" },
      { status: 503 },
    );
  }
}
