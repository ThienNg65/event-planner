# 006 — Gate the scrapbook card hover to real pointers

- **Status**: DONE
- **Commit**: 659a2c2
- **Severity**: LOW
- **Category**: Accessibility
- **Estimated scope**: 1 file, about 3 lines

## Problem

In the scrapbook theme, event cards sit slightly tilted and straighten and lift on hover:

```css
/* app/assets/css/themes.css:720-728 — current */
[data-theme='scrapbook'] a.themed-surface:nth-child(3n + 1) {
  transform: rotate(-0.6deg);
}
[data-theme='scrapbook'] a.themed-surface:nth-child(3n + 2) {
  transform: rotate(0.5deg);
}
[data-theme='scrapbook'] a.themed-surface:hover {
  transform: rotate(0deg) translateY(-2px);
}
```

The `:hover` rule is plain CSS with no hover-capability check. On touch screens a tap triggers `:hover`, and it stays until the user taps elsewhere. The tapped card then sits straight and lifted while the page navigates, or stays stuck after going back. Tailwind 4's own `hover:` classes (such as `hover:-translate-y-0.5` on `EventCard`) are already gated to hover-capable devices, so only this hand-written rule is affected.

## Target

```css
/* target */
@media (hover: hover) and (pointer: fine) {
  [data-theme='scrapbook'] a.themed-surface:hover {
    transform: rotate(0deg) translateY(-2px);
  }
}
```

The two tilt rules stay as they are.

## Repo conventions to follow

- `app/assets/css/main.css` already gates by input type with `@media (pointer: coarse) { ... }` (touch target sizes). Use the same style of media block, here in `themes.css`, in place.

## Steps

1. In `app/assets/css/themes.css`, wrap the `[data-theme='scrapbook'] a.themed-surface:hover { ... }` rule (line 726) in `@media (hover: hover) and (pointer: fine) { ... }` as in Target. Keep it in the same position in the file.

## Boundaries

- Do NOT change the tilt rules or other themes.
- Do NOT touch `EventCard.vue` (its Tailwind `hover:` lift is already gated).
- If the rule does not match the excerpt, STOP and report.

## Verification

- **Mechanical**: `npm run typecheck` exits 0.
- **Feel check**: set an event or the app theme to scrapbook and open the home page:
  - With a mouse: hovering a card still straightens and lifts it.
  - DevTools device toolbar (touch emulation, for example the iPhone preset), reload, tap a card and go back: the card is tilted again, not stuck straight and lifted.
- **Done when**: the scrapbook hover transform applies only inside `@media (hover: hover) and (pointer: fine)`.
