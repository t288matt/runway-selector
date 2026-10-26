// When the shared popover is shown. One small state machine for the chips, the
// tiles, the slim bar and the grid cells, so mouse, keyboard and touch all behave
// the same and the rules can be tested without a browser.
//
//   hover   the pointer is over the trigger
//   focus   the trigger has keyboard focus
//   pinned  a click or tap holds it open until the next tap, Escape, or a tap elsewhere
//   dismissed  Escape (or a second tap) closed it; it stays closed until the pointer
//              leaves, focus leaves, or the trigger is entered again
export interface PopoverState {
  readonly hover: boolean;
  readonly focus: boolean;
  readonly pinned: boolean;
  readonly dismissed: boolean;
}

export type PopoverEvent = 'enter' | 'leave' | 'focus' | 'blur' | 'tap' | 'escape' | 'outside';

export const POPOVER_CLOSED: PopoverState = { hover: false, focus: false, pinned: false, dismissed: false };

export function isOpen(s: PopoverState): boolean {
  return !s.dismissed && (s.hover || s.focus || s.pinned);
}

export function popoverReducer(s: PopoverState, e: PopoverEvent): PopoverState {
  switch (e) {
    case 'enter':
      return { ...s, hover: true, dismissed: false };
    case 'leave':
      return { ...s, hover: false, dismissed: false };
    case 'focus':
      return { ...s, focus: true, dismissed: false };
    case 'blur':
      return { hover: s.hover, focus: false, pinned: false, dismissed: false };
    // A touch tap arrives as enter, focus and then tap, so the tap pins what hover has already shown; a second tap closes it.
    case 'tap':
      return s.pinned ? { ...s, pinned: false, dismissed: true } : { ...s, pinned: true, dismissed: false };
    case 'escape':
      return { ...s, pinned: false, dismissed: true };
    case 'outside':
      return { ...s, hover: false, pinned: false, dismissed: false };
  }
}

/** Where the popover goes: below the trigger unless it would run off the bottom and there is room above; kept inside the viewport sideways. */
export function placePopover(trigger: { left: number; top: number; bottom: number }, pop: { width: number; height: number }, viewport: { width: number; height: number }, gap = 6, edge = 8): { left: number; top: number } {
  const fitsBelow = trigger.bottom + gap + pop.height <= viewport.height - edge;
  const fitsAbove = trigger.top - gap - pop.height >= edge;
  const top = fitsBelow || !fitsAbove ? trigger.bottom + gap : trigger.top - gap - pop.height;
  const left = Math.max(edge, Math.min(trigger.left, viewport.width - pop.width - edge));
  return { left, top: Math.max(edge, top) };
}
