# Brand colour docs describe what the themes actually render

Written against: 659a2c2

## Evidence chain

- Surface: every page. `app/app.vue:15` always sets `<html data-theme>` from `useAppTheme()` (default `aurora`, `DEFAULT_THEME` in `shared/utils/theme.ts`), and event pages replace it through `useEventTheme` (`app/pages/e/[id].vue:51`, `app/pages/new.vue:32`). So no page renders without a theme.
- Problem: three documents say the brand is "indigo, with amber for celebratory states". No themed page renders that:
  - `docs/09-frontend-map.md:68`: "Brand colours come from the logo (indigo; amber for celebratory states)."
  - `README.md:99`: "colors from the logo: indigo brand, amber for "celebrate" moments (top pick, paid, settled), neutral zinc surfaces, and the Inter font."
  - `app/app.config.ts:1` comment: "indigo brand, amber "celebrate" accent, on neutral zinc."
- Design evidence (runtime):
  - `app/app.config.ts:4` sets `colors: { primary: 'indigo', secondary: 'amber', neutral: 'zinc' }`. These only seed Nuxt UI's shade scales.
  - Every theme in `app/assets/css/themes.css` overrides `--ui-primary` and `--ui-secondary`. In aurora (default) they are `--ui-primary: #6d4aff` (violet) and `--ui-secondary: #e11d74` (pink). In dark aurora they are `#8f7bff` and `#f472b6`. The other themes set their own (for example liquid `#5e5ce6`, brutal `#3aa0ff`, acid `#d61f8c`, scrapbook `#1f6fd0`). Candy's `#f5b700` happens to look amber, but it is candy's own choice, not the brand default.
  - The three "celebrate moments" README names: **settled** uses `STAGE_COLOR.settled = 'secondary'` (`app/utils/format.ts:42`), so it renders pink in aurora. **Top pick** uses `color="warning"` (`app/components/EventPoll.vue:211, 298`), which is Nuxt UI's default yellow (not overridden anywhere). **Paid** uses `text-success` (`app/components/EventOverview.vue:137`), which is green.
  - The aurora section header in `themes.css` already says "Violet is kept for primary actions and selected states only."
- Owner: `docs/09-frontend-map.md` ("Look and feel"), `README.md` (product sheet), and the comment in `app/app.config.ts`.
- Scope and affected surfaces: documentation and one code comment. No rendered change.
- Uncertainty: none about what renders. Whether the team *wants* amber back is a product decision outside this plan. The repo rule in `CLAUDE.md` is "The code wins. If a doc and the code disagree, fix the doc."

## Design decision

Bring the three descriptions in line with the rendered system: brand colours are set per theme. Aurora, the default, is violet for primary actions and pink as the accent. The status colours are the stage/status colours, not "amber for celebrate". Do not change any colour value.

## Reuse

- Wording source: the aurora section header in `app/assets/css/themes.css` ("Violet is kept for primary actions and selected states only") and the theme list in `docs/09-frontend-map.md` ("Look and feel", first bullet).
- Exemplar: `docs/09-frontend-map.md` "Look and feel" bullets: short, factual, one line each, with paths in backticks.

No new primitive.

## Changes

1. `docs/09-frontend-map.md:68`
   - Change: replace the line with:
     `- Colours are set per theme (\`--ui-primary\` / \`--ui-secondary\` in \`themes.css\`); \`app.config.ts\` (indigo / amber / zinc) only seeds Nuxt UI's shade scales. Aurora, the default: violet \`#6d4aff\` for primary actions and selected states, pink \`#e11d74\` as the accent (the Settled stage). Light and dark mode via the sidebar toggle.`
   - Preserve: the "Light and dark mode via the sidebar toggle" fact. All other bullets.
   - Verify: the phrase "amber for celebratory states" is gone from `docs/09-frontend-map.md`. The new line names amber only as the `app.config.ts` seed palette.
2. `README.md:99`
   - Change: replace the text before "The logo is two overlapping circles" with:
     `- colours are set per theme; the default (aurora) uses violet for actions and selected states and pink as the accent, on neutral surfaces, with the Inter font.`
     Then keep the rest of the line from "The logo is two overlapping circles ..." unchanged.
   - Preserve: the logo and icon export sentence, word for word.
   - Verify: the line no longer claims amber for top pick, paid or settled.
3. `app/app.config.ts:1`
   - Change: replace the comment with:
     `// Nuxt UI base palettes (seed the shade scales). Each theme in app/assets/css/themes.css sets the real --ui-primary / --ui-secondary.`
   - Preserve: the `colors` values on line 4, unchanged. Everything else in the file.
   - Verify: `git diff app/app.config.ts` shows only line 1 changed.

## Scope

- Inherit: anyone reading the docs or README for the visual system.
- Verify: `docs/README.md` index and `CLAUDE.md` do not repeat the "indigo / amber" claim (`grep -rn "amber" docs README.md CLAUDE.md`). If another doc does, apply the same correction there and report it.
- Exclude: changing any colour, theme token, `STAGE_COLOR`, or the crown badge's `warning` colour. Those are product decisions, not documentation drift. `CHANGELOG.md` and `VERSION`: docs-only change, no user-visible effect.

## Validation

- Product: a reader of `docs/09-frontend-map.md` and `README.md` can predict the colour of the primary button and the Settled badge on a default page (violet, pink).
- Interface: none changes. Optionally open `/` in aurora and an event in Settled stage to confirm violet buttons and a pink Settled badge.
- System: the docs now point to `themes.css` as the owner of colour, not `app.config.ts`. No second copy of the rule is added.
- Repository: `npm run typecheck` → exits 0. `grep -rn "amber" docs/09-frontend-map.md README.md app/app.config.ts` → only `secondary: 'amber'` on `app.config.ts:4` and the new comment's "indigo / amber / zinc" in docs/09.

## Stop conditions

- Stop if `themes.css` aurora no longer sets `--ui-primary: #6d4aff` / `--ui-secondary: #e11d74` (the values moved), or if `app.vue` no longer always sets `data-theme`. In either case the evidence changed, so report instead of editing.
- Stop if the team says amber should come back: that becomes a theme change, not this plan.

## Design documentation

- After acceptance and validation: this plan *is* the documentation change (`docs/09-frontend-map.md` "Look and feel"). Nothing further to record.
