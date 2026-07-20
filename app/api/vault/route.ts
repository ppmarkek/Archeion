import {
  createMarkdownNote,
  listVaultItems,
  VaultError,
} from "@/lib/vault";
import { syncVaultIndex } from "@/lib/vault-index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof VaultError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error("Vault request failed", error);
  return Response.json({ error: "Unable to access the Vault" }, { status: 500 });
}

export async function GET() {
  try {
    const items = await listVaultItems();
    await syncVaultIndex(items, { prune: true });
    return Response.json({ items });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { title?: unknown };
    const title = typeof body.title === "string" ? body.title : undefined;
    const item = await createMarkdownNote(title);
    await syncVaultIndex([item]);

    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
