import { buildVaultGraph } from "@/lib/vault-graph";
import { VaultError } from "@/lib/vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await buildVaultGraph());
  } catch (error) {
    if (error instanceof VaultError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("Vault graph request failed", error);
    return Response.json({ error: "Unable to build the Vault graph" }, { status: 500 });
  }
}
