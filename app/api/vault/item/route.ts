import {
  deleteVaultItem,
  listVaultItems,
  moveVaultItem,
  renameVaultItem,
} from "@/lib/vault";
import { syncVaultIndex } from "@/lib/vault-index";
import { readJsonObject, vaultErrorResponse } from "@/app/api/vault/_response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function syncWholeVaultIndex() {
  try {
    await syncVaultIndex(await listVaultItems(), { prune: true });
  } catch (error) {
    console.warn("Vault index refresh was skipped", error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await readJsonObject(request);
    if (typeof body.path !== "string") {
      return Response.json({ error: "Укажите путь файла или папки" }, { status: 400 });
    }

    if (body.name !== undefined && typeof body.name !== "string") {
      return Response.json({ error: "Новое имя должно быть строкой" }, { status: 400 });
    }

    if (body.destination !== undefined && typeof body.destination !== "string") {
      return Response.json({ error: "Некорректная папка назначения" }, { status: 400 });
    }

    const hasName = typeof body.name === "string";
    const hasDestination = typeof body.destination === "string";
    if (hasName === hasDestination) {
      return Response.json(
        { error: "Укажите новое имя или папку назначения" },
        { status: 400 },
      );
    }

    const result = hasName
      ? await renameVaultItem(body.path, body.name as string)
      : await moveVaultItem(body.path, body.destination as string);
    await syncWholeVaultIndex();
    return Response.json(result);
  } catch (error) {
    return vaultErrorResponse(error, "Vault item update failed");
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await readJsonObject(request);
    if (typeof body.path !== "string") {
      return Response.json({ error: "Укажите путь файла или папки" }, { status: 400 });
    }

    const result = await deleteVaultItem(body.path);
    await syncWholeVaultIndex();
    return Response.json(result);
  } catch (error) {
    return vaultErrorResponse(error, "Vault item delete failed");
  }
}
