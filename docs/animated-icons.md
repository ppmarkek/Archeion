# Animated icons

Archeion uses the [Animated SVG collection](https://allsvgicons.com/collections/animated/) from All SVG Icons. The default family is **Material Line Icons (Line MD)**: a monochrome MIT-licensed 24px set that inherits `currentColor` and fits the restrained Graphite + Iris interface.

## Implementation

- Import an icon from `@iconify-react/line-md/<icon-name>` only inside the shared icon layer.
- Add product-facing aliases to `components/vault/vault-icons.tsx`; screens should import those aliases instead of package components.
- Render package icons through `components/icons/alive-icon.tsx`. It shows the finished glyph at rest, then replays it from the nearest semantic control using the selected trigger mode.
- Keep the primary icon implementation in the local bundle. Do not reference `i.allsvgicons.com` directly; the package may use its documented Iconify fallback only in browsers that cannot render the local SVG + CSS format.

```tsx
import FileDocumentPlusSvg from "@iconify-react/line-md/file-document-plus";
import { AliveIcon } from "@/components/icons/alive-icon";

<button aria-label="Создать заметку" type="button">
  <AliveIcon className="size-4" icon={FileDocumentPlusSvg} />
</button>
```

## Selection map

| Product meaning | Line MD icon | Motion |
| --- | --- | --- |
| Create a Markdown note | `file-document-plus` | once on hover/focus; the button may disappear while creating |
| Upload or import a file | `upload-outline` | once on hover/focus; pending state replaces it |
| Markdown note | `file-document` | on row activation (`press`) |
| Attachment or linked source | `link` | on row activation (`press`) |
| Folder or collection | `folder` | on row activation (`press`) |
| Knowledge Atlas | `compass` | once on hover/focus |
| Find a note | `search` | once when the search field is engaged |
| Move the Vault panel | `arrow-align-left/right/top/bottom` | once on hover/focus |
| Open outside Archeion | `external-link` | once on hover/focus before navigation, never `press` |
| Saving, uploading, synchronizing | `loading-loop` | loop only while pending |
| Saved or completed | `confirm` | static after completion |

## Motion rules

1. At rest, every action icon is complete and readable. Never leave a partially drawn glyph waiting for interaction.
2. First ask whether the icon survives the action. If the control reloads the page, navigates away, opens an external link, submits a native form, or disappears immediately, do not use `press`: the animation would be cut off. Use hover/focus as pre-action feedback, or `none` in an already busy region.
3. If the same control remains mounted while content changes in place, choose by pointer frequency. Use the default hover/focus replay for deliberate controls that are not swept over repeatedly: theme, panel docking, fit-to-view, and similar actions.
4. Use `motion="press"` for persistent tabs, filters, toggles, folder trees, file selection, dense menus, or any stable region the cursor frequently crosses. It plays on click and keyboard activation without adding hover chatter.
5. Give an icon exactly one motion trigger. Do not animate the icon on both hover and press, do not animate a neighbouring label as a second flourish, and keep decorative or durable-status icons static.
6. Infinite `*-loop` icons are reserved for an active process. Stop or replace them as soon as the process finishes; there are no ambient loops.
7. Prefer 16px icons in compact controls, 20px in regular buttons, and 24–32px only in empty states. Icon-only hit areas stay at least 32×32px.
8. Use `currentColor`: muted controls stay neutral, active and selected controls may use Iris. Folder color remains data, not icon decoration.
9. Do not mix Line MD with a second visual family inside one control group. The Archeion logo is the intentional exception.
10. Icon-only controls need an `aria-label`; visible text remains the accessible name when present. Decorative icons are `aria-hidden`.
11. `prefers-reduced-motion` must produce the same final state without choreography. The shared component and Line MD CSS already enforce this; do not override it.

### Trigger decision

| Control behaviour | Trigger |
| --- | --- |
| Stays mounted and is crossed often | `press` |
| Stays mounted and is used deliberately | default hover/focus |
| Navigates, reloads, submits, or disappears | hover/focus before action, or `none` |
| Shows a process currently running | `loop`, replaced immediately on completion |
| Shows decoration or a durable status | `none` |

## Adding a new icon

1. Find the semantically exact glyph in the [Animated collection](https://allsvgicons.com/collections/animated/), preferring Line MD.
2. Check that its license is MIT and that its idle silhouette is clear at 16px.
3. Add a semantic alias in `vault-icons.tsx` instead of spreading package names through the product.
4. Test rest, pointer hover, keyboard focus, active press, dark theme, and reduced motion.
5. If no precise animated glyph exists, use a static Line MD glyph. A correct static icon is better than a lively but misleading one.
