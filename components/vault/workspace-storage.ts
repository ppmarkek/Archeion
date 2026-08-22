const WORKSPACE_STORAGE_KEY = "archeion-workspace-v1";
const PANEL_POSITION_STORAGE_KEY = "archeion-panel-position";
const PANEL_MODE_STORAGE_KEY = "archeion-panel-mode-v2";
const PANEL_SIZE_STORAGE_KEY = "archeion-panel-size-v1";
const LEGACY_PANEL_COMPACT_STORAGE_KEY = "archeion-panel-compact";
const LIBRARY_STORAGE_KEY = "archeion-library-v1";

/** The small part of the Web Storage API needed by the workspace adapter. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type WorkspaceStateCandidate = Record<string, unknown>;

export interface PanelSizeCandidate {
  horizontal?: unknown;
  side?: unknown;
}

export interface PanelPreferencesCandidate {
  position: string | null;
  presentation: string | null;
  /** The pre-v2 compact flag, retained for migration by the workspace model. */
  compact: string | null;
  size: PanelSizeCandidate;
}

export interface PanelPreferencesInput {
  position: string;
  presentation: string;
  size: PanelSizeCandidate;
}

export type LibraryPreferencesCandidate = Record<string, unknown>;
export type LibraryPreferencesInput = Record<string, unknown>;

export interface WorkspaceStorage {
  readWorkspace(): WorkspaceStateCandidate;
  writeWorkspace(state: WorkspaceStateCandidate): void;
  readPanelPreferences(): PanelPreferencesCandidate;
  writePanelPreferences(preferences: PanelPreferencesInput): void;
  readLibraryPreferences(): LibraryPreferencesCandidate;
  writeLibraryPreferences(preferences: LibraryPreferencesInput): void;
}

const serverStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
};

function readJsonObject(storage: StorageLike, key: string): Record<string, unknown> {
  const raw = storage.getItem(key);
  if (raw === null) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function writeJson(storage: StorageLike, key: string, value: unknown): void {
  storage.setItem(key, JSON.stringify(value));
}

export function createWorkspaceStorage(storage: StorageLike =
  (typeof window === "undefined" ? serverStorage : window.localStorage)): WorkspaceStorage {
  return {
    readWorkspace: () => readJsonObject(storage, WORKSPACE_STORAGE_KEY),
    writeWorkspace: (state) => writeJson(storage, WORKSPACE_STORAGE_KEY, state),

    readPanelPreferences: () => ({
      position: storage.getItem(PANEL_POSITION_STORAGE_KEY),
      presentation: storage.getItem(PANEL_MODE_STORAGE_KEY),
      compact: storage.getItem(LEGACY_PANEL_COMPACT_STORAGE_KEY),
      size: readJsonObject(storage, PANEL_SIZE_STORAGE_KEY),
    }),
    writePanelPreferences: ({ position, presentation, size }) => {
      storage.setItem(PANEL_POSITION_STORAGE_KEY, position);
      storage.setItem(PANEL_MODE_STORAGE_KEY, presentation);
      writeJson(storage, PANEL_SIZE_STORAGE_KEY, size);
    },

    readLibraryPreferences: () => readJsonObject(storage, LIBRARY_STORAGE_KEY),
    writeLibraryPreferences: (preferences) => writeJson(storage, LIBRARY_STORAGE_KEY, preferences),
  };
}
