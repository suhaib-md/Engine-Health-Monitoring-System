import type { PartId } from './Engine';

/**
 * DOM marker registry. The viewport overlay registers its marker elements here via ref
 * callbacks; the 3D frame loop moves them onto their parts every frame and sets
 * `data-side` so labels always open away from the engine. Module scope keeps the per-frame
 * DOM writes out of React props and state.
 */
export const calloutEls: Record<PartId, HTMLDivElement | null> = { oilPump: null, radiator: null };

// stable ref callbacks, so React doesn't detach/re-attach them on every render
const setters = {} as Record<PartId, (el: HTMLDivElement | null) => void>;
export const registerCallout = (part: PartId) =>
  (setters[part] ??= (el) => {
    calloutEls[part] = el;
  });
