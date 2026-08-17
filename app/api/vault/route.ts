import {
  createMarkdownNote,
  createVaultFolder,
  listVault,
} from "@/lib/vault";
import { syncVaultIndex } from "@/lib/vault-index";
import { readJsonObject, vaultErrorResponse } from "@/app/api/vault/_response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { items, folders } = await listVault();
    await syncVaultIndex(items, { prune: true });
    return Response.json({ items, folders });
  } catch (error) {
    return vaultErrorResponse(error, "Vault list request failed");
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    if (body.directory !== undefined && typeof body.directory !== "string") {
      return Response.json({ error: "Некорректный путь папки" }, { status: 400 });
    }
    const directory = typeof body.directory === "string" ? body.directory : "";

    if (body.type === "folder") {
      if (typeof body.name !== "string") {
        return Response.json({ error: "Введите имя папки" }, { status: 400 });
      }

      const folder = await createVaultFolder(body.name, directory);
      return Response.json({ folder }, { status: 201 });
    }

    if (body.type !== undefined && body.type !== "note") {
      return Response.json({ error: "Неизвестный тип создаваемого объекта" }, { status: 400 });
    }

    if (body.title !== undefined && typeof body.title !== "string") {
      return Response.json({ error: "Название заметки должно быть строкой" }, { status: 400 });
    }

    const item = await createMarkdownNote(body.title, directory);
    await syncVaultIndex([item]);

    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return vaultErrorResponse(error, "Vault create request failed");
  }
}
