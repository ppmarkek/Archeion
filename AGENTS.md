<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Archeion interface rules

- Read `PRODUCT.md` and `DESIGN.md` before changing product UI.
- For icons, follow `docs/animated-icons.md`.
- Use Material Line Icons from the All SVG Icons animated collection through `@iconify-react/line-md` and the shared local wrappers. Do not add direct runtime icon CDN URLs.
- Pick icons by meaning, not by animation novelty. Then consider lifecycle: `motion="press"` is allowed only when the same control remains mounted while it changes local UI, such as a tab, filter, toggle, folder, or file selection. Never use press motion for a reload, external navigation, or an action that immediately removes the icon.
- Use hover/focus for deliberate low-frequency controls and pre-navigation feedback. In dense lists, trees, menus, and frequently crossed targets, prefer press when the persistence rule allows it; otherwise keep the icon static. Use one animated icon per control and infinite loops only for real pending work.
- Respect `prefers-reduced-motion`, preserve accessible names, and keep icon-only targets at least 32×32px.
