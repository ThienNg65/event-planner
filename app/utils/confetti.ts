const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#38bdf8'];

// Where the visitor last pressed: the celebration follows a click that may have awaited a save first.
let last: { x: number; y: number } | null = null;
if (import.meta.client) window.addEventListener('pointerdown', (e: PointerEvent) => (last = { x: e.clientX, y: e.clientY }), { capture: true, passive: true });

/** Ticket's celebration: a coral and pear star that pops out of the point you clicked (the page centre without one). */
function starBurst() {
  const s = document.createElement('span');
  s.className = 'star-burst';
  s.setAttribute('aria-hidden', 'true');
  s.style.left = `${last?.x ?? innerWidth / 2}px`;
  s.style.top = `${last?.y ?? innerHeight / 2}px`;
  document.body.append(s);
  setTimeout(() => s.remove(), 600);
}

/** A short celebration: falling confetti over the page (a star burst in the Ticket theme); nothing under reduced motion. */
export function confetti() {
  if (import.meta.server || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.documentElement.dataset.theme === 'ticket') return starBurst();
  const box = document.createElement('div');
  box.className = 'confetti';
  box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 40; i++) {
    const s = document.createElement('span');
    s.style.left = `${Math.random() * 100}%`;
    s.style.background = COLORS[i % COLORS.length]!;
    s.style.animationDelay = `${Math.random() * 0.3}s`;
    s.style.setProperty('--dx', `${(Math.random() - 0.5) * 240}px`);
    s.style.setProperty('--r', `${Math.random() * 720}deg`);
    box.append(s);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 1900);
}
