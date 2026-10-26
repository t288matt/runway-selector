// The "More" drawer. Dialog semantics, a close button, Escape closes, Tab stays
// inside it, and focus goes back to the button that opened it. What is inside
// (Why, Reports, Key, Settings) is DrawerContent.
import { useEffect, useRef, type ReactNode } from 'react';

export function Drawer({ open, onClose, returnFocusTo, children }: { open: boolean; onClose: () => void; returnFocusTo: React.RefObject<HTMLElement | null>; children?: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const back = returnFocusTo.current;
    closeButton.current?.focus();
    return () => back?.focus();
  }, [open, returnFocusTo]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || panel.current === null) return;
    // Only what can be reached now: not disabled, and not inside a closed details element.
    const focusable = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter((el) => el.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <aside ref={panel} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onKeyDown={onKeyDown}>
        <div className="dh">
          <h2 id="drawer-title">More</h2>
          <span className="sp" />
          <button ref={closeButton} type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="db">{children}</div>
      </aside>
    </>
  );
}
