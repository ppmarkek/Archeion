import {
  readMarkdownNote,
  saveMarkdownNote,
} from "@/lib/vault";
import { syncVaultIndex } from "@/lib/vault-index";
import { readJsonObject, vaultErrorResponse } from "@/app/api/vault/_response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const relativePath = new URL(request.url).searchParams.get("path");
    if (!relativePath) {
      return Response.json({ error: "Укажите путь к заметке" }, { status: 400 });
    }

    const content = await readMarkdownNote(relativePath);
    return Response.json({ content });
  } catch (error) {
    return vaultErrorResponse(error, "Vault note read failed");
  }
}

export async function PUT(request: Request) {
  try {
    const body = await readJsonObject(request);
    if (typeof body.path !== "string" || typeof body.content !== "string") {
      return Response.json({ error: "Укажите путь и Markdown-содержимое заметки" }, { status: 400 });
    }

    const item = await saveMarkdownNote(body.path, body.content);
    await syncVaultIndex([item]);
    return Response.json({ item });
  } catch (error) {
    return vaultErrorResponse(error, "Vault note save failed");
  }
}
