# z-pretty-pi

This global extension combines the styled editor, status footer, and animated welcome logo.
The footer shows the project, Git branch, MCP connections, extension status, context usage, then model, provider, and thinking level.
It does not show cost or subscription details.
The editor has a top separator but no left or bottom border. Input and footer text start at the separator's left edge.
A blank row separates the editor from the footer.
It keeps its existing keyboard, mouse, and autocomplete behavior.
The extension shows Pi's loaded resources in two columns below the logo. It preserves tool expansion state.
All customizations stay in this extension; do not modify Pi's installed files.

`index.ts` is the only extension entry point. It registers the logo helper in `logo.ts`.
This replaces the separate `pretty-status` and `rainbow-logo` extensions.

## Welcome logo

The welcome header shows the supplied block logo, centered horizontally with its captions.
The animation uses pink, purple, and soft blue sampled from the supplied color reference.
At Pi startup, TerminalTextEffects Expand moves the logo outward from its center once.
Expansion starts on the first animation tick after resource discovery, with no extra delay.
The header reserves blank space while waiting. Expansion advances one frame per tick so delayed callbacks cannot skip the entrance.
The expansion does not repeat on reload, session changes, or `/logo animate`.
It then combines TerminalTextEffects ColorShift with a diagonal Highlight sweep.
Both effects move from top-left to bottom-right.

Run `/reload`, then start a new session with `/new` to see the welcome animation.
The animation continues after prompts only while the welcome screen remains at the top of the visible viewport.
In regular mode, animation pauses when content exceeds the terminal height or enters scrollback.
In fullscreen mode, animation pauses when the viewport scrolls down or text is selected.
Both modes pause behind overlays. Hidden animations freeze their frames and do not request redraws.
They resume when the viewport permits safe animation again. Use `/logo pause` to stop them manually.

- `/logo animate`: Restart the animation.
- `/logo pause`: Keep the current frame.
- `/logo off`: Restore the built-in header for this session.

Set `PI_REDUCED_MOTION=1` before starting Pi to disable animation.
A nonempty `NO_COLOR` disables animation and colors and shows a compact Pi symbol.
Small terminals also show a compact Pi symbol.
The full logo uses colored cell backgrounds instead of font glyphs to prevent gaps between characters.
Commands do not change saved preferences.

## Resource lists

All welcome lists share a centered area, limited to 118 terminal columns. Entries stay left-aligned within their columns.
The area shrinks to fit narrow terminals.

The left column shows Context, Skills, and Prompts. The right column shows Extensions grouped as Local, Packages, and Source paths.
Skills and local extensions use two inner columns when space permits. Narrow terminals use one main column.
Long paths wrap. All resource list headings and extension group labels share the logo's pink, purple, and blue ColorShift and Highlight frames.
Additional expandable resource sections, including Themes, receive these heading colors automatically. List values keep their original, static colors.
The logo timer drives both color animations. `/logo pause` freezes both; reduced motion keeps their colors static.
`NO_COLOR` removes colors from both. Resource text stays in place while the logo expands at startup.
Additional sections remain below the main columns. Conflicts and load errors keep their original diagnostic colors.

`resources.ts` decorates the existing resource component through the TUI supplied to `setHeader`.
It uses Pi's loaded lists, not a second filesystem scan. No installed Pi files are changed.
Pi has no public resource-layout hook. This adapter checks the component shape and retains the normal listing if it cannot find it.
Recheck the adapter after Pi upgrades. `/logo off` and extension shutdown restore the original renderer.
Run `/reload` to apply the layout.

## Implementation

`generate.py` uses the actual TTE Expand, ColorShift, and Highlight iterators.
The expansion ends on the first color-loop frame, with fixed header dimensions throughout.
Highlight provides a grayscale mask. The generator blends this mask over each ColorShift frame.
Pi reads the compressed frames and draws them through `setHeader`.
The logo uses no background Python process or direct terminal output.
The extension does not modify Pi's installed renderer.
The bundled animation contains 282 frames and repeats approximately every 9.3 seconds.

Sources:

- [TerminalTextEffects](https://github.com/ChrisBuilds/terminaltexteffects), commit `c9a857bc3dc439a9fb1f7efdbe2928573a926dce`.
- User-supplied Pi logo reference: four-by-four pixel layout (`1110 / 1010 / 1101 / 1001`).

## Regenerate

Python and a checkout of the TTE commit above are required only for regeneration.
In Git Bash, set `PYTHONPATH` to that checkout:

```bash
PYTHONPATH=/path/to/terminaltexteffects python ~/.pi/agent/extensions/z-pretty-pi/generate.py
```

The generator checks the loop boundary and the highlight peak.

## Check

Use the existing Pi packages:

```bash
node ~/.pi/agent/extensions/z-pretty-pi/check.mjs
```

The check covers the combined header, open editor, blank buffer row, footer order, mouse handling, autocomplete, MCP updates, context usage, and cost removal.
It also runs `check-logo.mjs` for frame shapes, ANSI safety, narrow terminals, animation controls, reduced motion, run modes, and timer cleanup.
`check-resources.mjs` uses Pi's resource-section builder to check columns, source groups, wrapping, Unicode, diagnostic colors, reloads, and renderer restoration.
It also checks Themes, new resource headings, shared frame changes, and wrapped headings in collapsed and expanded lists.
`check-logo.mjs` also checks synchronized heading colors against the exact logo frame and shared pause and cleanup controls.
It runs Pi's actual regular and fullscreen renderers with a recording terminal to test scrolling, hidden frames, redraw counts, and visible resumption.
The checks require zero terminal writes while hidden and no history replay when new chat output arrives.
