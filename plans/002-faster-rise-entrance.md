# 002 — Make the `.rise` float-in fit the 300ms UI budget

- **Status**: DONE
- **Commit**: 659a2c2
- **Severity**: MEDIUM
- **Category**: Easing & duration / Cohesion & tokens
- **Estimated scope**: 1 file, about 10 lines

## Problem

`.rise` children float in one after another on the event page (3 containers, `app/pages/e/[id].vue:270, 383, 408`) and the home page grids (`app/pages/index.vue:90, 125`). These are the most visited pages. The animation takes 450ms, and the stagger delays reach 250ms, so the last block is still moving about 700ms after load. UI animations should stay under 300ms.

```css
/* app/assets/css/main.css:48-62 — current */
/* `translate` (not `transform`) and fill "backwards" so hover lifts and theme tilts still apply after the entrance. */
.rise > * {
  animation: rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
}
.rise > :nth-child(2) { animation-delay: 50ms; }
.rise > :nth-child(3) { animation-delay: 100ms; }
.rise > :nth-child(4) { animation-delay: 150ms; }
.rise > :nth-child(5) { animation-delay: 200ms; }
.rise > :nth-child(n + 6) { animation-delay: 250ms; }
@keyframes rise {
  from {
    opacity: 0;
    translate: 0 10px;
  }
}
```

The curve `cubic-bezier(0.2, 0.8, 0.2, 1)` is also typed out a second time in `.stage-enter-active` (line 38). The repo has no motion token yet.

## Target

```css
/* target, app/assets/css/main.css */
/* Strong ease-out for entrances (shared by .rise and .stage). Not named --ease-out: Tailwind's theme already defines that. */
:root {
  --motion-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
}

/* `translate` (not `transform`) and fill "backwards" so hover lifts and theme tilts still apply after the entrance. */
.rise > * {
  animation: rise 300ms var(--motion-ease-out) backwards;
}
.rise > :nth-child(2) { animation-delay: 50ms; }
.rise > :nth-child(3) { animation-delay: 100ms; }
.rise > :nth-child(n + 4) { animation-delay: 150ms; }
@keyframes rise {
  from {
    opacity: 0;
    translate: 0 10px;
  }
}
```

Last block settled at 150ms + 300ms = 450ms (was about 700ms). The stagger stays at 50ms, inside the 30-80ms range.

## Repo conventions to follow

- Motion lives in `app/assets/css/main.css` under the `/* Motion: ... */` comment (line 35). Put the `:root` token right after that comment, before `.stage-enter-active`.
- Do NOT put the token inside `@theme`: Tailwind 4 already defines `--ease-out` there (`cubic-bezier(0, 0, 0.2, 1)`), and Nuxt UI components use it. Use the name `--motion-ease-out` in a plain `:root` block.
- Durations: write new ones in `ms`.

## Steps

1. In `app/assets/css/main.css`, just after the `/* Motion: ... */` comment, add the `:root { --motion-ease-out: cubic-bezier(0.23, 1, 0.32, 1); }` block with its one-line comment, as in Target.
2. Replace `animation: rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;` with `animation: rise 300ms var(--motion-ease-out) backwards;`.
3. Replace the five `nth-child` delay rules with the three in Target (`2` → 50ms, `3` → 100ms, `n + 4` → 150ms).
4. Leave `@keyframes rise` as is.

## Boundaries

- Do NOT change the `.stage-*` rules (plan 003 switches them to the token).
- Do NOT change the reduced-motion block (plan 004).
- Do NOT touch any `.vue` file.
- If plan 001 is not done yet, this plan still applies unchanged. If the CSS does not match the excerpt, STOP and report.

## Verification

- **Mechanical**: `npm run typecheck` exits 0. `npm run dev` starts with no CSS errors in the terminal.
- **Feel check**: reload the home page and an event page:
  - Blocks still arrive in sequence, top first, but the page feels settled almost at once. Nothing is still sliding after about half a second.
  - Each block starts fast and eases into place, with no slow start.
  - DevTools > Animations at 10%: each `rise` animation is 300ms, and the delays are 0/50/100/150ms with no larger value.
  - Hover an event card after load: the lift (`hover:-translate-y-0.5`) still works.
- **Done when**: no `.rise` animation is longer than 300ms, no delay is above 150ms, and `--motion-ease-out` is defined once in `main.css`.
