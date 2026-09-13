# Tidy Sections

Figma plugin that arranges the children of a section into a clean layout and resizes the section
around them.

## What it does

Select a section, pick a direction, then hit Apply.

- **Horizontal** and **Vertical** place every child in a single line.
- **Grid** wraps children into rows, with fixed or automatic columns.
- **Keep current rows** normalises gap, padding and alignment of rows you arranged by hand.
- The nine dot picker sets alignment on both axes, **Hug** resizes the section to its content and
  **Fixed** keeps its size and aligns the content inside it.
- Gap and padding come from chips, the plus chip stores a custom value.

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

## Documentation

- [docs/reference.md](docs/reference.md): every option, the source layout and the preview setup.
- [ui-kit/README.md](ui-kit/README.md): the shared design system, canonical in this repo.
