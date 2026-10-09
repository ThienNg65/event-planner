import type { InternalApi } from 'nitropack/types';

/** GET /api/events/:id as the browser receives it (dates as strings). */
export type EventDetail = InternalApi['/api/events/:id']['get'];

/** Calls on one event's API, sending the organizer key when this browser has it. */
export function useEventApi(eventId: () => number, manageKey: () => string | null | undefined) {
  const toast = useToast();
  const busy = ref(false);

  async function call(path: string, method: 'PUT' | 'POST' | 'PATCH' | 'DELETE', body?: object) {
    busy.value = true;
    try {
      const key = manageKey();
      const url: string = `/api/events/${eventId()}${path}`;
      await $fetch(url, { method, body, headers: key ? { 'x-manage-key': key } : {} });
      return true;
    } catch (e) {
      toast.add({ color: 'error', title: errMsg(e) });
      return false;
    } finally {
      busy.value = false;
    }
  }

  return { busy, call };
}
