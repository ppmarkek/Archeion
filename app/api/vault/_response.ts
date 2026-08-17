import { VaultError } from "@/lib/vault";

export function vaultErrorResponse(error: unknown, context: string) {
  if (error instanceof VaultError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error(context, error);
  return Response.json({ error: "Не удалось выполнить операцию с Vault" }, { status: 500 });
}

export async function readJsonObject(request: Request) {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new VaultError(400, "Ожидался JSON-объект");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof VaultError) throw error;
    throw new VaultError(400, "Некорректное тело запроса");
  }
}
