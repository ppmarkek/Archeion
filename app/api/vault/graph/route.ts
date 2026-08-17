import { buildVaultGraph } from "@/lib/vault-graph";
import { vaultErrorResponse } from "@/app/api/vault/_response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await buildVaultGraph());
  } catch (error) {
    return vaultErrorResponse(error, "Vault graph request failed");
  }
}
