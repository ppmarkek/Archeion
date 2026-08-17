import { searchVault } from "@/lib/vault";
import { vaultErrorResponse } from "@/app/api/vault/_response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const query = searchParams.get("q") ?? "";
    const limitValue = searchParams.get("limit");
    const limit = limitValue === null ? 50 : Number(limitValue);

    if (!Number.isFinite(limit) || limit <= 0) {
      return Response.json({ error: "Некорректный лимит результатов" }, { status: 400 });
    }

    const results = await searchVault(query, limit);
    return Response.json({ query: query.trim(), results });
  } catch (error) {
    return vaultErrorResponse(error, "Vault search failed");
  }
}
