# 004 — Reduced motion: drop the movement, keep the fades

- **Status**: DONE
- **Commit**: 659a2c2
- **Severity**: LOW
- **Category**: Accessibility
- **Estimated scope**: 1 file, about 15 lines
- **Depends on**: 001, 002, 003 (they reshape the rules this plan overrides)

## Problem

Under `prefers-reduced-motion: reduce` the app sets every transition and animation to 0.01ms:

```css
/* app/assets/css/main.css:64-71 — current */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

This removes the motion, which is right. But it also removes the opacity fades on the event page's `.rise` float-in and the `.stage` swap. Content then pops in instantly, and a stage swap becomes a hard cut. Reduced motion should mean fewer and gentler animations, not none: keep the opacity, remove the position change.

## Target

Keep the global rule, which also calms Nuxt UI's dialogs and popovers. After it, inside the same media query, add targeted overrides that bring back short fades without movement:

```css
/* target, app/assets/css/main.css */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
  /* Keep the fades (they help follow what changed), drop the movement and the stagger. */
  .rise > * {
    animation-name: fade-in;
    animation-duration: 200ms !important;
    animation-delay: 0ms !important;
  }
  .stage-enter-active,
  .stage-leave-active {
    transition-duration: 150ms !important;
  }
  .stage-enter-from,
  .stage-leave-to {
    translate: none;
  }
}
```

`fade-in` is **not** defined here. Nuxt UI already ships `@keyframes fade-in { 0% { opacity: 0 } to { opacity: 1 } }` (`node_modules/@nuxt/ui/dist/runtime/keyframes.css`, loaded by `@import "@nuxt/ui"` at the top of `main.css`). A second `fade-in` would silently replace Nuxt UI's (the later definition wins) and affect its modals and popovers.

Why it works: `.rise > *` and `.stage-enter-active` are more specific than `*`, so their `!important` durations beat the global `!important` rule. `animation-delay: 0ms !important` beats the `.rise > :nth-child(...)` delays.

## Repo conventions to follow

- All motion CSS is in `app/assets/css/main.css`. Reuse Nuxt UI's existing `fade-in` keyframes. Do not add a keyframe with that name, or any other name Nuxt UI uses (`fade-out`, `scale-in`, `scale-out`, `slide-*`).
- `app/utils/confetti.ts` already skips confetti under reduced motion. Leave it.

## Steps

1. Check that plans 001-003 are done (`--motion-ease-out` exists, the stage leave and enter rules are separate, and the stage `<Transition>` is wrapped in a `<div>` in `app/pages/e/[id].vue`). If not, STOP.
2. In `app/assets/css/main.css`, inside the existing `@media (prefers-reduced-motion: reduce)` block and after the `*` rule, add the comment and the three rules from Target.
3. Do NOT add any `@keyframes`. Confirm that `grep -n "keyframes fade-in" node_modules/@nuxt/ui/dist/runtime/keyframes.css` finds Nuxt UI's definition. If it does not (Nuxt UI changed), STOP and report.

## Boundaries

- Do NOT remove or weaken the global `*` rule. (Note for later, out of scope: Nuxt UI already switches its own keyframes to opacity-only under reduced motion, and this global rule cuts even those to 0.01ms.)
- Do NOT define `@keyframes fade-in` (Nuxt UI owns that name).
- Do NOT touch `.vue` files, `themes.css` or `confetti.ts`.
- If the reduced-motion block does not match the excerpt, STOP and report.

## Verification

- **Mechanical**: `npm run typecheck` exits 0.
- **Feel check**: in DevTools > Rendering, set "Emulate CSS media feature prefers-reduced-motion" to `reduce`:
  - Reload an event page: blocks fade in together over about 200ms, with no slide and no stagger.
  - Move the event to the next stage: the old section fades out and the new one fades in, with no vertical movement.
  - Open a dialog (for example Share): it still appears essentially instantly (global rule).
  - Turn emulation off: the normal slide and stagger from plans 002-003 are back.
- **Done when**: with reduced motion on, nothing on the event page changes position during an animation, and the `.rise` and `.stage` fades are still visible.
