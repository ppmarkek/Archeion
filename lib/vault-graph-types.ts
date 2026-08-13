export type VaultGraphNode = {
  id: string;
  path: string;
  title: string;
  folder: string;
  updatedAt: string;
};

export type VaultGraphEdge = {
  source: string;
  target: string;
};

export type VaultGraphFolder = {
  path: string;
  name: string;
  count: number;
};

export type VaultGraphData = {
  nodes: VaultGraphNode[];
  edges: VaultGraphEdge[];
  folders: VaultGraphFolder[];
};
