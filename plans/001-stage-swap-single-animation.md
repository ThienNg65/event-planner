# 001 — Give the stage swap one animation, not two

- **Status**: DONE
- **Commit**: 659a2c2
- **Severity**: HIGH
- **Category**: Interruptibility / Cohesion
- **Estimated scope**: 1 file, about 3 lines

## Problem

On the event page the stage section (`EventPoll` / `EventRsvp` / `EventBill`) is swapped by a Vue `<Transition name="stage">`. That transition is a direct child of a `.rise` container:

```vue
<!-- app/pages/e/[id].vue:408-419 — current -->
<div class="rise min-w-0 space-y-6 lg:col-start-1">
  <p v-for="line in done" :key="line" class="flex items-center gap-2 text-sm text-muted">
    <UIcon name="i-lucide-circle-check" class="size-4 text-success" />{{ line }}
  </p>

  <Transition name="stage" mode="out-in">
    <EventPoll v-if="ev.stage === 'poll'" :data="data" :me="me" :manage-key="key" :role="role" @changed="refresh" />
    <EventRsvp v-else-if="ev.stage === 'rsvp'" :data="data" :me="me" :manage-key="key" @changed="refresh" />
    <EventBill v-else :data="data" :me="me" :manage-key="key" @changed="refresh" />
  </Transition>

  <EventPeople :data="data" :me="me" :manage-key="key" :role="role" @changed="refresh" />
</div>
```

`<Transition>` renders no element, so each stage component's root element is itself a `.rise > *` child. `app/assets/css/main.css` gives every such child a keyframe animation on insertion:

```css
/* app/assets/css/main.css:49-56 — current */
.rise > * {
  animation: rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
}
.rise > :nth-child(2) { animation-delay: 50ms; }
...
```

and the stage transition animates the same element:

```css
/* app/assets/css/main.css:36-47 — current */
.stage-enter-active,
.stage-leave-active {
  transition: opacity 0.25s ease, translate 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
```

So when a host locks the poll, enters the bill or completes the event, the new stage element runs **both** the `rise` keyframe and the `stage` transition. Both drive `opacity` and `translate` at the same time. The `nth-child` delay (0 to 150ms, depending on how many "done" lines sit above it) keeps the element invisible (`backwards` fill) before it moves. The swap looks unpredictable, and Vue waits for the longer of the two before it counts the enter as finished.

The `.rise` float-in is meant for the first page load only. The stage swap has its own transition.

## Target

Stage components are no longer direct children of `.rise`. A plain wrapper `<div>` is the `.rise` child. It floats in once on page load like its siblings. The stage components inside it animate only through the `stage` transition.

```vue
<!-- target -->
<div>
  <Transition name="stage" mode="out-in">
    <EventPoll v-if="ev.stage === 'poll'" ... />
    <EventRsvp v-else-if="ev.stage === 'rsvp'" ... />
    <EventBill v-else ... />
  </Transition>
</div>
```

No CSS changes.

## Repo conventions to follow

- Templates use Tailwind classes. The wrapper needs no class: the parent's `space-y-6` spaces direct children, and the wrapper takes the old position.
- Keep the existing HTML comment style (`<!-- ... -->`) if you add a comment. One line at most, for example: `<!-- A wrapper, so a stage swap is animated only by the stage transition, not by .rise. -->`

## Steps

1. In `app/pages/e/[id].vue`, wrap the `<Transition name="stage" mode="out-in"> ... </Transition>` block (lines 413-417 at the commit stamp) in a `<div>` with no classes. Add the one-line comment above the `<div>`. Change nothing else.

## Boundaries

- Do NOT touch `app/assets/css/main.css` (plans 002 to 004 do).
- Do NOT change the `.rise` class on the parent or on the other two `.rise` containers.
- Do NOT add `appear` to the Transition.
- Do NOT add new dependencies.
- If the template no longer matches the excerpt above, STOP and report instead of improvising.

## Verification

- **Mechanical**: `npm run typecheck` exits 0.
- **Feel check**: run `npm run dev`, open an event as its organizer, and move it to the next stage (Lock in poll, then Enter bill, then Complete):
  - The old stage fades up and out, then the new one fades and slides in once. It does not wait invisibly, then jump or double-slide.
  - On a fresh page load the stage section still floats in, in sequence with the "done" lines and the People list.
  - In DevTools > Animations, set playback to 10%. On a stage swap, only `stage-enter-*` transitions show for the new stage element, with no `rise` animation.
- **Done when**: the stage component's root element is no longer a direct child of a `.rise` element, and a swap shows one animation.
