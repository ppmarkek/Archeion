export type VaultItem = {
  path: string;
  name: string;
  kind: "note" | "attachment";
  mimeType: string;
  size: number;
  updatedAt: string;
};

export type VaultSearchMatch = "name" | "path" | "content";

export type VaultSearchResult = {
  item: VaultItem;
  match: VaultSearchMatch;
  snippet?: string;
};
