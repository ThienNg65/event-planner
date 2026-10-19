import type { InjectionKey, ShallowRef } from 'vue';

/** One secondary organizer move from the next-step card (close voting, preview the bill, complete...). */
export type HostMoreItem = { label: string; icon: string; onSelect: () => void };

/** Provided by the event page: EventNextStep fills it, EventHostMenu shows it first, so organizers have one menu. */
export const HOST_MORE: InjectionKey<ShallowRef<HostMoreItem[]>> = Symbol('hostMore');
