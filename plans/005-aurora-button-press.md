# 005 — Press feedback on buttons in the default aurora theme

- **Status**: DONE
- **Commit**: 659a2c2
- **Severity**: LOW
- **Category**: Physicality
- **Estimated scope**: 1 file, about 8 lines

## Problem

Buttons get press feedback from a per-theme token:

```css
/* app/assets/css/themes.css:153-156 — current */
.tb-solid:active,
.tb-outline:active {
  transform: var(--tb-press, none);
}
```

Only brutal (`--tb-press: translate(2px, 2px)`, line 483), scrapbook (`translateY(2px)`, line 668) and candy (`translateY(3px)`, line 782) set it. **Aurora**, the default theme every page uses unless an event picks another one (`DEFAULT_THEME` in `shared/utils/theme.ts`), falls back to `none`. Pressing a solid or outline button there gives no physical response, only Nuxt UI's colour change.

The `tb-solid` / `tb-outline` classes are added to every `UButton` by `app/app.config.ts` (`button.variants.variant`).

## Target

In aurora, a pressed solid or outline button scales to 0.97 over 160ms with ease-out, and returns the same way when released:

```css
/* target, in the AURORA section of app/assets/css/themes.css */
[data-theme='aurora'] {
  /* ...existing tokens... */
  --tb-press: scale(0.97);
}

/* Aurora's press scales, so it needs a transition; the colour list matches Nuxt UI's transition-colors. */
[data-theme='aurora'] .tb-solid,
[data-theme='aurora'] .tb-outline {
  transition:
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    background-color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 160ms ease-out;
}
```

Why the colour list: Nuxt UI's button already has Tailwind's `transition-colors` class, which sets `transition-property` to the colour properties with 150ms and `cubic-bezier(0.4, 0, 0.2, 1)`. `themes.css` is unlayered, so it beats that utility. A bare `transition: transform ...` would drop the colour transitions, so they are restated.

## Repo conventions to follow

- Theme tokens are custom properties inside each theme's `[data-theme='<name>'] { ... }` block. The aurora block starts at `themes.css:177`. Add `--tb-press` right after `--tb-border-soft: 1px solid #e4e4e7;` (about line 217), the last `--tb-*` token in that block.
- Theme-specific component rules follow the theme's token blocks, like `[data-theme='aurora'] .themed-side { ... }` at line 258. Put the new transition rule right after that one.
- The dark aurora block (`.dark[data-theme='aurora']`, line 225) needs nothing: `[data-theme='aurora']` matches in dark mode too.

## Steps

1. In `app/assets/css/themes.css`, in the `[data-theme='aurora'] { ... }` block (line 177), add `--tb-press: scale(0.97);`.
2. After the `[data-theme='aurora'] .themed-side { ... }` rule (line 258), add the commented transition rule from Target.

## Boundaries

- Aurora only. Do NOT add press feedback to liquid, bento or acid, and do NOT change the `none` fallback in `.tb-solid:active`. Those themes' look is a separate decision.
- Do NOT touch `app.config.ts` or any `.vue` file.
- Do NOT add `:active` scaling to ghost, soft or subtle buttons.
- Known limit, accept it: custom properties inherit. A theme preview of liquid, bento or acid (`ThemePicker.vue:60`, an element with its own `data-theme` inside an aurora page) inherits aurora's `--tb-press`, so its buttons will scale too. Brutal's and candy's press already leak the same way today. Do not add `--tb-press: none` to other themes to fix it.
- If the aurora block or line 153-156 does not match, STOP and report.

## Verification

- **Mechanical**: `npm run typecheck` exits 0.
- **Feel check**: with the aurora theme (default), press and hold a solid button (for example "New event") and an outline button:
  - The button shrinks slightly (to 97%) while held and springs back on release. It feels like a key, not a wobble.
  - Hover colour changes still fade, they do not snap.
  - Switch to the brutal theme: its offset press still works as before. Switch to liquid: no press scale (out of scope).
  - DevTools > Animations at 10%: `transform` transitions over 160ms with `ease-out`.
- **Done when**: aurora solid and outline buttons scale on `:active` with a 160ms ease-out transition, and colour transitions still run.
