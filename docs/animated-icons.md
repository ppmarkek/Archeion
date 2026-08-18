# Animated icons

Archeion uses the [Animated SVG collection](https://allsvgicons.com/collections/animated/) from All SVG Icons. The default family is **Material Line Icons (Line MD)**: a monochrome MIT-licensed 24px set that inherits `currentColor` and fits the restrained Graphite + Iris interface.

## Implementation

- Import an icon from `@iconify-react/line-md/<icon-name>` only inside the shared icon layer.
- Add product-facing aliases to `components/vault/vault-icons.tsx`; screens should import those aliases instead of package components.
- Render package icons through `components/icons/alive-icon.tsx`. It shows the finished glyph at rest. Motion is opt-in: an omitted `motion` prop is always static.
- Keep the primary icon implementation in the local bundle. Do not reference `i.allsvgicons.com` directly; the package may use its documented Iconify fallback only in browsers that cannot render the local SVG + CSS format.

```tsx
import FileDocumentPlusSvg from "@iconify-react/line-md/file-document-plus";
import { AliveIcon } from "@/components/icons/alive-icon";

<button aria-label="Создать заметку" type="button">
  <AliveIcon className="size-4" icon={FileDocumentPlusSvg} motion="hover" />
</button>
```

## Selection map

| Product meaning | Line MD icon | Motion |
| --- | --- | --- |
| Create a Markdown note | `file-document-plus` | once on hover/focus; the button may disappear while creating |
| Upload or import a file | `upload-outline` | once on hover/focus; pending state replaces it |
| Markdown note | `file-document` | static in tabs, lists, and trees |
| Attachment or linked source | `link` | static in tabs, lists, and trees |
| Folder or collection | `folder` | static in tabs, lists, and trees |
| Knowledge Atlas | `compass` | static when used as a tab or view marker |
| Find a note | `search` | hover/focus only on an isolated search action; static inside an input |
| Move the Vault panel | `arrow-align-left/right/top/bottom` | static inside the compact settings menu |
| Open outside Archeion | `external-link` | once on hover/focus before navigation |
| Saving, uploading, synchronizing | `loading-loop` | loop only while pending |
| Saved or completed | `confirm` | static after completion |

## Motion rules

1. At rest, every icon is complete and readable. Never leave a partially drawn glyph waiting for interaction.
2. Start with no motion. Omitting `motion` and writing `motion="none"` are equivalent; explicit `none` is useful for durable status and empty-state decoration.
3. Add `motion="hover"` only when all three conditions are true: the control is an isolated command, it is used deliberately rather than crossed repeatedly, and pre-action feedback makes its result clearer.
4. Good hover/focus candidates are create, import, close, collapse, preview, external navigation, and graph viewport controls. The nearest semantic control owns the trigger, so hovering its label or padding also plays the icon. Leaving that control stops and resets it.
5. Keep icons static in tabs, segmented controls, filters, file rows, folder trees, search results, menu rows, selection markers, metadata, and decorative contexts. These regions are dense or describe state; motion there becomes chatter.
6. Do not add click or press animation. A control uses hover/focus, genuine pending-state looping, or no icon motion.
7. Give a control at most one animated icon. Do not animate a neighbouring label or second glyph as an extra flourish.
8. Infinite `*-loop` icons are reserved for an active process. Stop or replace them as soon as the process finishes; there are no ambient loops.
9. Prefer 16px icons in compact controls, 20px in regular buttons, and 24–32px only in empty states. Icon-only hit areas stay at least 32×32px.
10. Use `currentColor`: muted controls stay neutral, active and selected controls may use Iris. Folder color remains data, not icon decoration.
11. Do not mix Line MD with a second visual family inside one control group. The Archeion logo is the intentional exception.
12. Icon-only controls need an `aria-label`; visible text remains the accessible name when present. Decorative icons are `aria-hidden`.
13. `prefers-reduced-motion` must produce the same final state without choreography. The shared component and Line MD CSS already enforce this; do not override it.

### Trigger decision

| Control context | Motion |
| --- | --- |
| Isolated, deliberate command with useful pre-action feedback | explicit `hover` |
| Tabs, filters, lists, trees, menus, or other dense regions | omitted / `none` |
| Navigates, submits, or disappears | explicit `hover` only when pre-action feedback is useful; otherwise `none` |
| Shows a process currently running | `loop`, replaced immediately on completion |
| Shows decoration or a durable status | `none` |

## Adding a new icon

1. Find the semantically exact glyph in the [Animated collection](https://allsvgicons.com/collections/animated/), preferring Line MD.
2. Check that its license is MIT and that its idle silhouette is clear at 16px.
3. Add a semantic alias in `vault-icons.tsx` instead of spreading package names through the product.
4. Decide whether the icon qualifies for opt-in hover motion. If it does, write `motion="hover"` at the call site; otherwise omit `motion`.
5. Test rest, full-control pointer hover, pointer-leave reset, keyboard focus, dark theme, and reduced motion.
6. If no precise animated glyph exists, use a static Line MD glyph. A correct static icon is better than a lively but misleading one.
