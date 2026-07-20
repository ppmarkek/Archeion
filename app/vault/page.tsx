import type { Metadata } from "next";

import { VaultWorkspace } from "@/components/vault/vault-workspace";

export const metadata: Metadata = {
  title: "Vault | Archeion",
  description: "Markdown notes and study files in your personal Archeion vault.",
};

export default function VaultPage() {
  return <VaultWorkspace />;
}
