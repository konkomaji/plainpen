# Plainpen design system

One rule for every decision: **a mark must mean the same thing everywhere, and nothing is decoration.**

## Idea: proofreader's marks

The product is about marking text, so the design language comes from proofreading. Each issue type has its own colour, line pattern and glyph. Meaning never depends on colour alone.

| Type | Colour role | Line | Glyph | Teacher's pen |
|---|---|---|---|---|
| Spelling | `--mark-spelling` (red) | wavy | `sp` | circled |
| Grammar | `--mark-grammar` (blue) | solid | `gr` | struck through, correction above |
| Punctuation | `--mark-punct` (amber) | double | pilcrow | double underline |
| Style | `--mark-style` (violet) | dotted | `st` | highlighter yellow |

## Tokens (`design/tokens.css`)

Nothing in `style.css` uses a raw colour. `tests/security.mjs` fails the build if a hex colour appears there.

- **Type:** Poppins, self hosted. Minor third scale (1.2) from 16px: 13, 14, 16, 19, 23, 28, and a fluid h1. Weights 400, 500, 600, 700. Caveat (handwriting) is used only in Teacher's pen.
- **Space:** a 4px grid: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- **Shape:** radius 6, 10, 16, pill.
- **Motion:** 120ms, 220ms, 400ms with one easing. All motion stops under `prefers-reduced-motion`.
- **Elevation:** three levels.
- **Colour:** one seed hue per writing mode. Surfaces, borders, text and accent are derived from that hue in OKLCH, with a hex fallback. Switching mode shifts the whole interface:

| Mode | Hue |
|---|---|
| Professional | 255 (blue) |
| Technical | 200 (teal) |
| Simplified | 70 (amber) |
| Friendly | 350 (rose) |
| Casual | 295 (violet) |

## Layout

- One container, 1200px, 20px gutters (16px on phones). Header, hero, workbench, content and footer share one left edge.
- Reading text is limited to 72 characters.
- The page order is: answer first (H1 and one sentence), the tool, then supporting content. This serves readers, search engines and answer engines alike.

## Two designs, not one

- **Desktop and tablet:** a sheet (the editor) with a margin panel of notes beside it. A two row toolbar: modes and English on the first row, tools and file actions on the second.
- **Phone:** a separate app style design. Compact header and hero, an editor that fills the screen edge to edge, and a bottom bar with Paste, Tools and Notes (with a count). Tools and Notes open as bottom sheets over a scrim. Targets are 44px, inputs are 16px so iOS does not zoom, and safe area insets are respected.

## Components

Button (ghost, primary, danger), segmented control, field, tab, note card (glyph, message, fixes, actions, trust bar), mascot (idle, think, happy, worry), score bar, toast, dialog (a bottom sheet on phones), menu, chip (a handwritten correction), footer social buttons.

Every interactive element has a visible focus state, a name for screen readers, and works with the keyboard.

## Content voice

Plain, direct, no hype. No em dashes in page copy. The test suite checks this.

## Adding to the system

1. Add a token first. 2. Use it in `style.css`. 3. Document it here. A value that is not a token is a bug.
