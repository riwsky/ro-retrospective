# CLAUDE.md

## Repo layout
- `index.html` — the prose retrospective (long-form). The user's authored prose is the source of truth for speaker-notes content.
- `retro.iapresenter/` — iA Presenter bundle. `text.md` inside is the source of truth for slides; iA hot-reloads on save.
- `assets/` AND `retro.iapresenter/assets/` — duplicate asset directories. The render script writes only to `assets/`; **manually `cp` updated PNGs into `retro.iapresenter/assets/`** or the slides won't pick up changes.
- `scripts/render-assets.js` — Playwright-based renderer that screenshots D3 + Mermaid figures from `index.html` into `assets/*.png`.

## Rendering assets
- No `package.json`. First-time setup: `npm install --no-save playwright pngjs && npx playwright install chromium`. Install both in one command — running a second `npm install --no-save` overwrites the first install.
- After editing `index.html` figures: `node scripts/render-assets.js && cp assets/<changed>.png retro.iapresenter/assets/<changed>.png`.

## Mermaid transparency
- Diagrams must composite cleanly on iA's slide background (transparent fills, no white panels).
- `flowchart: { htmlLabels: false }` is **required** in `mermaid.initialize` — otherwise chromium rasterizes `<foreignObject>` HTML labels as opaque white regardless of CSS, and no amount of override fixes it.
- Mermaid injects `#mermaid-XXXX .edgeLabel { … !important }` ID-scoped CSS that beats class-only selectors. The render script patches fills/backgrounds via inline `el.style.setProperty('fill', 'transparent', 'important')` after render — class-only stylesheet rules are insufficient.

## Verifying transparency
- The Read tool's image preview shows transparent pixels as white — **don't trust your eyes for alpha**. Either composite the PNG onto a colored bg via playwright, or sample alpha values with `pngjs`.

## Slide content rules
- Speaker notes are **verbatim excerpts from `index.html` prose**, not Claude-generated paraphrases. When asked to write or revise speaker notes, lift the matching paragraphs (with sidenotes inline as separate paragraphs) and convert HTML entities to characters.
- Anthropic's technical-discussion rubric (`anthropic_technical_discussion_description.txt`) defines the four section areas: Context and goals / Technical design / Execution / Outcomes and reflection. Slide titles should align where natural.
