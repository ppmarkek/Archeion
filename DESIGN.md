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

- **Dockable library:** one panel combines folders and files. It opens on the right by default and can dock left, right, top, or bottom. A side-docked panel never jumps above the document at a narrow window width; its compact toggle reduces the rail while preserving creation, import, folder navigation, and file selection.
- **Inline folder tree:** the library keeps root files and sibling folders in one stable field. Clicking a folder expands or collapses its direct children beneath it without replacing the list; nested branches use restrained indentation, remember their state locally, and coexist with a separate explicit “all files” view.
- **Tabbed workspace:** files open in compact, softly rounded browser-style tabs at the very top of the workspace, with the document toolbar directly beneath them, and restore locally between sessions. The selected tab uses a quiet editor-colored surface and a restrained iris icon; opening, closing, and switching tabs animate in place while respecting reduced motion. Keep at most eight files open and at most four visible at once. An active tab can occupy the center, left, right, top, or bottom slot; inactive open tabs remain in the rail without consuming canvas space.
- **Source-first library:** notes and uploaded material are visibly separate. A `.md` is a note; every other uploaded file is a source attachment.
- **Document canvas:** headings and body text stay within a reading measure. The raw Markdown editor and readable preview are two modes of the same document, never separate copies; a quick split view can place the preview beside the source.
- **Selection toolbar:** selecting meaningful text in the Markdown editor reveals a compact, fixed-position formatting toolbar. Its familiar controls add Markdown syntax while preserving the selection for the next edit.
- **Hover preview:** hovering or focusing a Markdown file in the Vault panel opens a delayed, readable card in the working area. It previews without changing the active document and offers an explicit open action.
- **Document outline:** wide document canvases expose a sticky, nested table of contents for Markdown headings. The collapsed rail overlays the canvas edge without shifting the reading column, then expands left while following the active section in source and preview.
- **Atlas graph:** Markdown notes form a full-canvas constellation from wiki-links and local Markdown links. The global view shows the whole Vault; folder view keeps that folder vivid and its one-hop neighbours muted. Folder colors are assigned automatically, remain editable, and follow the application theme. Note labels appear only on hover or keyboard focus so dense graphs stay readable.
- **Quiet state feedback:** save state, file metadata, and item counts use low-contrast supporting text; iris only signals an actionable or selected state.
- **Living iconography:** compact controls use the MIT Material Line Icons set from [All SVG Icons](https://allsvgicons.com/collections/animated/) through local `@iconify-react/line-md` components. Icons are complete at rest and use one quiet trigger chosen from the control lifecycle: hover/focus for deliberate actions, press for persistent in-place UI, a loop only for genuine progress, or no motion.
- **System-respecting theme:** light, dark, and system choices are available in the workspace and remembered locally.

## Rules

- Use 1px separators and layered surfaces instead of floating cards and decorative shadows.
- Keep interface type in one system sans family; keep Markdown source in a monospace editor.
- Use 150–200ms state transitions only. Respect `prefers-reduced-motion`.
- Choose icons by action semantics before visual novelty: `file-document-plus` creates a note, `upload-outline` imports a file, `folder` represents collections, `compass` opens the Atlas, and directional alignment icons move the Vault panel. Keep one Line MD icon family per control group; never use an animated icon as decoration or repeat the same glyph for unrelated actions.
- Put interactive icons inside `AliveIcon` (or use an exported icon from `components/vault/vault-icons.tsx`). Choose in this order: meaning, control persistence, then pointer frequency. Default hover/focus suits deliberate, infrequent actions and gives navigation feedback before a route changes. Use `motion="press"` only when the control stays mounted and updates the interface in place—tabs, filters, toggles, folder selection, or file selection—and especially in dense targets crossed often. Never use press motion for a reload, external link, or control that immediately disappears. Use `motion="loop"` only for loading, upload, save, or synchronization in progress; use `motion="none"` for durable status. Animate at most one icon per control. Every icon-only control requires a Russian `aria-label` and a minimum 32px hit target.
- Keep graph navigation spatial and reversible: drag to pan, wheel or controls to zoom, drag individual nodes to untangle them, and always provide a fit-to-view action.
- Meet 4.5:1 contrast for normal text. Muted text is supporting information, never the only way to understand a state.
