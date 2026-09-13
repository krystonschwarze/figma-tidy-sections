# Tidy Sections

Figma plugin that arranges the children of a section into a clean layout and resizes the section
around them.

## What it does

Select a section, pick a direction, then hit Apply.

- **Horizontal** and **Vertical** place every child in a single line.
- **Grid** wraps children into rows. Columns and rows can be fixed or left on Auto.
- **Keep current rows** reads the rows you already arranged by hand and only normalises gap,
  padding and alignment.

The nine dot picker sets alignment on both axes. **Hug** resizes the section to fit its content, so
only the cross axis alignment is visible. **Fixed** keeps the section at its current size and aligns
the content inside it, which is when all nine positions matter.

Gap and padding presets are chips under each field. The plus chip stores a custom value in
`figma.clientStorage`, and the settings screen removes values you no longer need.

## Development

```sh
npm install
npm run dev      # rebuild dist/ on every change
npm test         # unit tests for the pure logic, via the Node test runner
npm run preview  # render every built plugin UI in Figma light and dark in the browser
npm run build    # minified production build
npm run verify   # typecheck, lint, format check, test, build
```

Import the plugin in Figma via **Plugins > Development > Import plugin from manifest** and pick
`manifest.json`. The manifest points at `dist/`, so run a build at least once before importing.

## Layout

| Path              | Role                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `src/code.ts`     | Sandbox side. Validates messages, talks to the Figma API.        |
| `src/layout.ts`   | Pure geometry. No Figma API, unit tested.                        |
| `src/messages.ts` | Message contract shared by both sides.                           |
| `src/ui/`         | Plugin window. `index.html` is a template, the build inlines it. |
| `ui-kit/`         | Shared design system for the sibling Figma plugin repos.         |

`scripts/preview.mjs` serves the built `dist/ui.html` of every sibling plugin side by side with
Figma's theme variables injected, so a UI change can be checked in both themes without importing
anything into Figma. Each plugin describes its window and its mock messages in `scripts/preview.json`.

`ui-kit/` is the canonical copy. The sibling repos pull it in with `npm run sync:ui-kit`, so edit the
design system here and sync outwards. See `ui-kit/README.md`.
