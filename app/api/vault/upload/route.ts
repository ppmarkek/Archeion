import { addUploadedFile, VaultError } from "@/lib/vault";
import { syncVaultIndex } from "@/lib/vault-index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const value = formData.get("file");

    if (!value || typeof value === "string") {
      return Response.json({ error: "Select a file to add" }, { status: 400 });
    }

    const item = await addUploadedFile(value);
    await syncVaultIndex([item]);
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof VaultError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("Vault upload failed", error);
    return Response.json({ error: "Unable to add this file" }, { status: 500 });
  }
}
