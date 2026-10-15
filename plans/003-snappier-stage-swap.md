# 003 — Make the stage swap snappier: fast exit, ease-out enter

- **Status**: DONE
- **Commit**: 659a2c2
- **Severity**: MEDIUM
- **Category**: Easing & duration
- **Estimated scope**: 1 file, about 6 lines
- **Depends on**: 002 (defines `--motion-ease-out`)

## Problem

The event page swaps stage sections with `<Transition name="stage" mode="out-in">` (`app/pages/e/[id].vue:413`). `out-in` runs the leave, then the enter, so the two durations add up. Both are 250ms, so a swap takes 500ms. The fade uses plain `ease`, which is too weak for an entrance:

```css
/* app/assets/css/main.css:36-47 — current */
.stage-enter-active,
.stage-leave-active {
  transition: opacity 0.25s ease, translate 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.stage-enter-from {
  opacity: 0;
  translate: 0 12px;
}
.stage-leave-to {
  opacity: 0;
  translate: 0 -8px;
}
```

The old stage is the content the host just acted on. It should get out of the way fast, and the new stage should arrive with a strong ease-out.

## Target

```css
/* target */
.stage-enter-active {
  transition: opacity 250ms var(--motion-ease-out), translate 250ms var(--motion-ease-out);
}
.stage-leave-active {
  transition: opacity 150ms var(--motion-ease-out), translate 150ms var(--motion-ease-out);
}
.stage-enter-from {
  opacity: 0;
  translate: 0 12px;
}
.stage-leave-to {
  opacity: 0;
  translate: 0 -8px;
}
```

Total swap time: 150ms + 250ms = 400ms (was 500ms). `--motion-ease-out` is `cubic-bezier(0.23, 1, 0.32, 1)`.

## Repo conventions to follow

- The token `--motion-ease-out` is defined in a `:root` block near the top of the motion section of `app/assets/css/main.css` (added by plan 002). Use `var(--motion-ease-out)`. Do not paste the raw cubic-bezier.
- Durations are written in `ms`.

## Steps

1. Check that `app/assets/css/main.css` defines `--motion-ease-out`. If it does not, STOP: plan 002 must run first.
2. Replace the combined `.stage-enter-active, .stage-leave-active { ... }` rule with the two separate rules in Target.
3. Leave `.stage-enter-from` and `.stage-leave-to` unchanged.
4. Update the `/* Motion: ... */` comment only if it now says something untrue. It does not mention durations, so normally leave it.

## Boundaries

- Do NOT change `mode="out-in"` or any `.vue` file.
- Do NOT touch `.rise` or the reduced-motion block.
- If the CSS does not match the excerpt, STOP and report.

## Verification

- **Mechanical**: `npm run typecheck` exits 0.
- **Feel check**: as organizer, move an event through stages (Lock, Enter bill, Complete):
  - The old section leaves quickly. The new one arrives fast and settles gently, and the swap feels like one quick step, not a pause.
  - DevTools > Animations at 10%: leave transitions are 150ms and enter transitions are 250ms, both with `cubic-bezier(0.23, 1, 0.32, 1)`.
  - Run this after plan 001: the new stage shows only the `stage-enter` transition, no `rise`.
- **Done when**: no `ease` keyword remains in the `.stage-*` rules, leave is 150ms, and enter is 250ms.
