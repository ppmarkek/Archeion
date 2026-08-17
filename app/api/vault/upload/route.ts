import { addUploadedFile } from "@/lib/vault";
import { syncVaultIndex } from "@/lib/vault-index";
import { vaultErrorResponse } from "@/app/api/vault/_response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const value = formData.get("file");
    const directoryValue = formData.get("directory");

    if (!value || typeof value === "string") {
      return Response.json({ error: "Выберите файл для добавления" }, { status: 400 });
    }

    if (directoryValue !== null && typeof directoryValue !== "string") {
      return Response.json({ error: "Некорректный путь папки" }, { status: 400 });
    }

    const item = await addUploadedFile(value, directoryValue ?? "");
    await syncVaultIndex([item]);
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return vaultErrorResponse(error, "Vault upload failed");
  }
}
