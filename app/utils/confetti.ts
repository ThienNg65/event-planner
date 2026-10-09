const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#38bdf8'];

/** A short burst of falling confetti over the page; nothing under reduced motion. */
export function confetti() {
  if (import.meta.server || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
