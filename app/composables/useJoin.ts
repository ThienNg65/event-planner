// The action that opened the join sheet, replayed once the visitor has signed in. A function cannot live in useState (SSR payload).
let pending: (() => unknown) | null = null;

/** "Ask who you are, then continue": opens the join sheet for a visitor and replays `fn` after sign-in; runs it at once when signed in. */
export function useJoin() {
  const open = useState('joinOpen', () => false);
  const newOnly = useState('joinNewOnly', () => false);
  const { meId } = useMe();

  function ask(fn?: () => unknown, opts?: { newOnly?: boolean }) {
    if (meId.value) return fn?.();
    pending = fn ?? null;
    newOnly.value = !!opts?.newOnly;
    open.value = true;
  }
  async function done() {
    const fn = pending;
    pending = null;
    open.value = false;
    // Let the page see the new session before the action reads it.
    await nextTick();
    await fn?.();
  }
  /** The sheet was dismissed without signing in. */
  function cancel() {
    pending = null;
  }
  return { open, newOnly, ask, done, cancel };
}
