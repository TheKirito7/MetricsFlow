import { useEffect, type RefObject } from 'react';

export function useFocusPanel(
  open: boolean,
  setOpen: (value: boolean) => void,
  panel: RefObject<HTMLElement | null>,
  trigger: RefObject<HTMLButtonElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const container = panel.current;
    if (!container) return;
    const opener = trigger.current;
    const focusable = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]',
        ),
      ).filter((element) => element.getClientRects().length > 0);
    (focusable()[0] ?? container).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key === 'Tab') {
        const items = focusable();
        const first = items[0];
        const last = items.at(-1);
        if (!first) {
          event.preventDefault();
          container.focus();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first || !container.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !container.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      opener?.focus();
    };
  }, [open, setOpen, panel, trigger]);
}
