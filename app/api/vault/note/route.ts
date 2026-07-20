import {
  readMarkdownNote,
  saveMarkdownNote,
  VaultError,
} from "@/lib/vault";
import { syncVaultIndex } from "@/lib/vault-index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof VaultError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error("Vault note request failed", error);
  return Response.json({ error: "Unable to access this note" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const relativePath = new URL(request.url).searchParams.get("path");
    if (!relativePath) {
      return Response.json({ error: "A note path is required" }, { status: 400 });
    }

    const content = await readMarkdownNote(relativePath);
    return Response.json({ content });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { path?: unknown; content?: unknown };
    if (typeof body.path !== "string" || typeof body.content !== "string") {
      return Response.json({ error: "A note path and Markdown content are required" }, { status: 400 });
    }

    const item = await saveMarkdownNote(body.path, body.content);
    await syncVaultIndex([item]);
    return Response.json({ item });
  } catch (error) {
    return errorResponse(error);
  }
}
