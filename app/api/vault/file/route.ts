import { readVaultFile, VaultError } from "@/lib/vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const relativePath = new URL(request.url).searchParams.get("path");
    if (!relativePath) {
      return Response.json({ error: "A file path is required" }, { status: 400 });
    }

    const { entry, data } = await readVaultFile(relativePath);
    return new Response(data, {
      headers: {
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(entry.name)}`,
        "Content-Type": entry.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof VaultError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("Vault file request failed", error);
    return Response.json({ error: "Unable to access this file" }, { status: 500 });
  }
}
