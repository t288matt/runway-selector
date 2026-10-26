// The shared popover's rules (src/v2/model/popover.ts): when it is shown for mouse,
// keyboard and touch, what closes it, and where it is placed. The component is a
// thin wrapper over this reducer, so reverting a rule here fails a test here.
import { describe, expect, it } from 'vitest';
import { isOpen, placePopover, popoverReducer, POPOVER_CLOSED, type PopoverEvent, type PopoverState } from '../../src/v2/model/popover';

const run = (...events: PopoverEvent[]): PopoverState => events.reduce(popoverReducer, POPOVER_CLOSED);

describe('when the popover is open', () => {
  it('is closed to begin with', () => {
    expect(isOpen(POPOVER_CLOSED)).toBe(false);
  });
  it('opens on hover and closes when the pointer leaves', () => {
    expect(isOpen(run('enter'))).toBe(true);
    expect(isOpen(run('enter', 'leave'))).toBe(false);
  });
  it('opens on keyboard focus and closes on blur', () => {
    expect(isOpen(run('focus'))).toBe(true);
    expect(isOpen(run('focus', 'blur'))).toBe(false);
  });
  it('stays open while either the pointer or the focus is there', () => {
    expect(isOpen(run('enter', 'focus', 'leave'))).toBe(true);
    expect(isOpen(run('enter', 'focus', 'blur'))).toBe(true);
    expect(isOpen(run('enter', 'focus', 'leave', 'blur'))).toBe(false);
  });
});

describe('Escape', () => {
  it('closes it even while the pointer is still over it or focus is still on it', () => {
    expect(isOpen(run('enter', 'focus', 'escape'))).toBe(false);
    expect(isOpen(run('focus', 'escape'))).toBe(false);
  });
  it('stays closed until the pointer or focus leaves and comes back', () => {
    expect(isOpen(run('focus', 'escape', 'enter'))).toBe(true);
    expect(isOpen(run('enter', 'escape', 'leave', 'enter'))).toBe(true);
    expect(isOpen(run('focus', 'escape', 'blur', 'focus'))).toBe(true);
  });
});

describe('touch and click', () => {
  it('a tap holds it open after the pointer or focus has gone', () => {
    // A touch tap arrives as enter, focus, then the click.
    const tapped = run('enter', 'focus', 'tap');
    expect(isOpen(tapped)).toBe(true);
    expect(isOpen(popoverReducer(popoverReducer(tapped, 'leave'), 'leave'))).toBe(true);
    expect(isOpen({ ...tapped, hover: false, focus: false })).toBe(true);
  });
  it('a second tap closes it', () => {
    expect(isOpen(run('enter', 'focus', 'tap', 'tap'))).toBe(false);
  });
  it('a tap elsewhere releases it', () => {
    expect(isOpen(run('enter', 'focus', 'tap', 'outside', 'blur'))).toBe(false);
    expect(run('enter', 'focus', 'tap', 'outside').pinned).toBe(false);
  });
  it('losing focus releases a held popover', () => {
    expect(run('focus', 'tap', 'blur').pinned).toBe(false);
  });
});

describe('placement', () => {
  const view = { width: 1000, height: 700 };
  const pop = { width: 260, height: 80 };
  it('goes below the trigger when there is room', () => {
    expect(placePopover({ left: 100, top: 100, bottom: 130 }, pop, view)).toEqual({ left: 100, top: 136 });
  });
  it('goes above when it would run off the bottom and there is room above', () => {
    expect(placePopover({ left: 100, top: 660, bottom: 690 }, pop, view)).toEqual({ left: 100, top: 660 - 6 - 80 });
  });
  it('stays inside the viewport sideways', () => {
    expect(placePopover({ left: 900, top: 100, bottom: 130 }, pop, view).left).toBe(1000 - 260 - 8);
    expect(placePopover({ left: -50, top: 100, bottom: 130 }, pop, view).left).toBe(8);
  });
});
