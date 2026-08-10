# Archeion design system

## Direction: Graphite + Iris

Archeion is used when someone is reading, connecting ideas, and writing for a long time. The interface should feel like a calm desk under focused light: dense enough to keep context visible, quiet enough that the writing stays central.

The product borrows familiar interaction patterns from note tools—persistent navigation, a document canvas, and a markdown preview—without copying Notion or Obsidian branding or layouts.

## Color strategy

Restrained product palette in OKLCH. Iris is reserved for focus, the active collection, and primary actions; neutrals carry the workspace.

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| Canvas | `oklch(0.978 0.005 270)` | `oklch(0.155 0.016 276)` | Application background |
| Ink | `oklch(0.255 0.02 276)` | `oklch(0.945 0.008 270)` | Reading and UI text |
| Rail | `oklch(0.954 0.011 270)` | `oklch(0.125 0.015 276)` | Navigation and library panels |
| Iris | `oklch(0.48 0.16 286)` | `oklch(0.735 0.15 286)` | Primary action, focus, selected content |
| Selected | `oklch(0.902 0.052 286)` | `oklch(0.295 0.06 286)` | Active row and contextual emphasis |

## Core patterns

- **Dockable library:** one panel combines folders and files. It opens on the right by default and can dock left, right, top, or bottom; compact layouts keep it reachable without obscuring the document.
- **Source-first library:** notes and uploaded material are visibly separate. A `.md` is a note; every other uploaded file is a source attachment.
- **Document canvas:** headings and body text stay within a reading measure. The raw Markdown editor and readable preview are two modes of the same document, never separate copies; a quick split view can place the preview beside the source.
- **Selection toolbar:** selecting meaningful text in the Markdown editor reveals a compact, fixed-position formatting toolbar. Its familiar controls add Markdown syntax while preserving the selection for the next edit.
- **Quiet state feedback:** save state, file metadata, and item counts use low-contrast supporting text; iris only signals an actionable or selected state.
- **System-respecting theme:** light, dark, and system choices are available in the workspace and remembered locally.

## Rules

- Use 1px separators and layered surfaces instead of floating cards and decorative shadows.
- Keep interface type in one system sans family; keep Markdown source in a monospace editor.
- Use 150–200ms state transitions only. Respect `prefers-reduced-motion`.
- Meet 4.5:1 contrast for normal text. Muted text is supporting information, never the only way to understand a state.
