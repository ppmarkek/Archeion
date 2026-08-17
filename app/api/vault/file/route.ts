import { readVaultFile } from "@/lib/vault";
import { vaultErrorResponse } from "@/app/api/vault/_response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function shouldDownload(mimeType: string) {
  return mimeType.startsWith("text/html")
    || mimeType.includes("svg")
    || mimeType.includes("javascript")
    || mimeType.includes("xml");
}

export async function GET(request: Request) {
  try {
    const relativePath = new URL(request.url).searchParams.get("path");
    if (!relativePath) {
      return Response.json({ error: "Укажите путь к файлу" }, { status: 400 });
    }

    const { entry, data } = await readVaultFile(relativePath);
    const download = shouldDownload(entry.mimeType);
    const headers = new Headers({
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(entry.name)}`,
      "Content-Type": entry.mimeType,
      "X-Content-Type-Options": "nosniff",
    });
    if (download) headers.set("Content-Security-Policy", "default-src 'none'; sandbox");

    return new Response(data, {
      headers,
    });
  } catch (error) {
    return vaultErrorResponse(error, "Vault file request failed");
  }
}
