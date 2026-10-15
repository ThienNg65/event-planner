# Animation plans

Written by the `improve-animations` audit at commit `659a2c2`. Each plan is self-contained: hand one file to any agent. Source code was not changed by the audit.

| # | Plan | Severity | Status |
|---|---|---|---|
| 001 | [Give the stage swap one animation, not two](001-stage-swap-single-animation.md) | HIGH | DONE |
| 002 | [Make the `.rise` float-in fit the 300ms UI budget](002-faster-rise-entrance.md) | MEDIUM | DONE |
| 003 | [Make the stage swap snappier](003-snappier-stage-swap.md) | MEDIUM | DONE |
| 004 | [Reduced motion: drop the movement, keep the fades](004-reduced-motion-keeps-fades.md) | LOW | DONE |
| 005 | [Press feedback on buttons in aurora](005-aurora-button-press.md) | LOW | DONE |
| 006 | [Gate the scrapbook card hover to real pointers](006-scrapbook-hover-gate.md) | LOW | DONE |

## Order and dependencies

1. **001** first: it is the only real defect, and the rest of the motion section builds on it.
2. **002** next: it adds the `--motion-ease-out` token.
3. **003** needs 002's token.
4. **004** needs 001-003 (it overrides the rules they produce).
5. **005** and **006** are independent (`themes.css` only) and can run any time, in parallel with the rest.

001-004 all edit the motion section of `app/assets/css/main.css` (001 edits `app/pages/e/[id].vue`), so run them one at a time.

## Not planned

Possible additions from the audit, not selected:

- Vote bars on day tiles and venue rows (`app/components/EventPoll.vue:239, 318`) jump to their new width. They could grow over about 200ms with `scaleX` from the left.
- The check mark on a picked day tile appears instantly. It could scale in from 0.9 with a fade.
