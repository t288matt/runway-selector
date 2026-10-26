// The one popover for the chips, the tiles, the slim bar and the grid cells. It
// opens on hover, on keyboard focus and on a tap or click (which holds it open),
// and closes on Escape, on a second tap, on a tap elsewhere, and when the pointer
// or focus leaves. The popover text is plain text in the page and is the trigger's
// accessible description (aria-describedby), so a screen reader gets the same words
// as the eye. It is fixed to the viewport so a scrolling grid cannot clip it, and
// on a phone the stylesheet turns it into a strip at the bottom of the screen.
// Text nodes only (SEC-2).
import { useCallback, useEffect, useId, useLayoutEffect, useReducer, type HTMLAttributes, type ReactNode } from 'react';
import { isOpen, placePopover, popoverReducer, POPOVER_CLOSED } from '../model/popover';

export interface PopoverBinding {
  readonly id: string;
  readonly open: boolean;
  /** Handlers for the trigger. `onClick` (the tap) is left out for a trigger whose click already does something (a summary). */
  readonly handlers: {
    readonly onMouseEnter: () => void;
    readonly onMouseLeave: () => void;
    readonly onFocus: () => void;
    readonly onBlur: () => void;
    readonly onClick?: () => void;
    readonly onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  };
}

/**
 * The popover behaviour for one trigger. The popover element is the trigger's child (see PopoverText), so the
 * script finds both from the popover's id and no element is kept in React state or in a ref.
 */
export function usePopover(text: string, options: { tap?: boolean } = {}): PopoverBinding {
  const tap = options.tap ?? true;
  const [state, dispatch] = useReducer(popoverReducer, POPOVER_CLOSED);
  const id = useId();
  const open = isOpen(state);

  const place = useCallback((): void => {
    const p = document.getElementById(id);
    const t = p?.parentElement;
    if (p === null || t === null || t === undefined) return;
    const at = placePopover(t.getBoundingClientRect(), { width: p.offsetWidth, height: p.offsetHeight }, { width: window.innerWidth, height: window.innerHeight });
    // Placed on the element itself: the position follows the page as it scrolls and is not React state.
    p.style.left = `${at.left}px`;
    p.style.top = `${at.top}px`;
  }, [id]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, text, place]);

  useEffect(() => {
    if (!state.pinned) return undefined;
    const away = (e: Event): void => {
      const trigger = document.getElementById(id)?.parentElement;
      if (e.target instanceof Node && (trigger?.contains(e.target) ?? false)) return;
      dispatch('outside');
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [state.pinned, id]);

  return {
    id,
    open,
    handlers: {
      onMouseEnter: () => dispatch('enter'),
      onMouseLeave: () => dispatch('leave'),
      onFocus: () => dispatch('focus'),
      onBlur: () => dispatch('blur'),
      ...(tap ? { onClick: () => dispatch('tap') } : {}),
      // Escape closes the popover and nothing else; with no popover open the key goes on to whatever else listens for it.
      onKeyDown: (e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          dispatch('escape');
        }
      },
    },
  };
}

/** The popover itself. Always in the page (so it can describe its trigger), hidden until opened. */
export function PopoverText({ binding, text, rich }: { binding: PopoverBinding; text: string; rich?: ReactNode }) {
  return (
    <span id={binding.id} role="tooltip" className="tip-pop" hidden={!binding.open}>
      {rich ?? text}
    </span>
  );
}

type DataAttributes = { readonly [name: `data-${string}`]: string | undefined };

export interface TipProps extends Omit<HTMLAttributes<HTMLElement>, 'children'>, DataAttributes {
  /** The popover text, shown on hover, focus and tap. */
  readonly text: string;
  /** Coloured content for the popover (text nodes and spans only). `text` stays the plain-text form. */
  readonly rich?: ReactNode;
  readonly tag?: 'span' | 'div';
  /** Called with the trigger element, for a caller that has to move focus to it. */
  readonly elRef?: (el: HTMLElement | null) => void;
  readonly children?: ReactNode;
}

/** A focusable trigger with its popover inside. */
export function Tip({ text, rich, tag = 'span', elRef, children, onKeyDown, onMouseEnter, onMouseLeave, onFocus, onBlur, onClick, className, ...rest }: TipProps) {
  const p = usePopover(text);
  const Tag = tag;
  return (
    <Tag
      {...rest}
      ref={elRef}
      className={`${className ?? ''}${p.open ? ' tip-open' : ''}`.trim()}
      aria-describedby={p.id}
      onMouseEnter={(e) => {
        p.handlers.onMouseEnter();
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        p.handlers.onMouseLeave();
        onMouseLeave?.(e);
      }}
      onFocus={(e) => {
        p.handlers.onFocus();
        onFocus?.(e);
      }}
      onBlur={(e) => {
        p.handlers.onBlur();
        onBlur?.(e);
      }}
      onClick={(e) => {
        p.handlers.onClick?.();
        onClick?.(e);
      }}
      onKeyDown={(e) => {
        p.handlers.onKeyDown(e);
        if (!e.isPropagationStopped()) onKeyDown?.(e);
      }}
    >
      {children}
      <PopoverText binding={p} text={text} rich={rich} />
    </Tag>
  );
}
