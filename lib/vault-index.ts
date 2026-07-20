import "server-only";

import { notInArray } from "drizzle-orm";

import { getDb } from "@/db";
import { vaultItems } from "@/db/schema";
import type { VaultEntry } from "@/lib/vault";

type SyncOptions = {
  prune?: boolean;
};

export async function syncVaultIndex(items: VaultEntry[], options: SyncOptions = {}) {
  if (!process.env.DATABASE_URL) return;

  try {
    const db = getDb();
    const updatedAt = new Date();

    await db.transaction(async (transaction) => {
      for (const item of items) {
        await transaction
          .insert(vaultItems)
          .values({
            relativePath: item.path,
            name: item.name,
            kind: item.kind,
            mimeType: item.mimeType,
            byteSize: item.size,
            updatedAt,
          })
          .onConflictDoUpdate({
            target: vaultItems.relativePath,
            set: {
              name: item.name,
              kind: item.kind,
              mimeType: item.mimeType,
              byteSize: item.size,
              updatedAt,
            },
          });
      }

      if (options.prune) {
        if (items.length === 0) {
          await transaction.delete(vaultItems);
        } else {
          await transaction
            .delete(vaultItems)
            .where(notInArray(vaultItems.relativePath, items.map((item) => item.path)));
        }
      }
    });
  } catch (error) {
    console.warn("Vault index sync was skipped", error);
  }
}
