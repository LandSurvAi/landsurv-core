import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Panel chrome shared by the canvas-toolbar dropdowns (Layers, Legend).
 * Keep these two strips visually identical so the toolbar reads as one row.
 */
export const TOOLBAR_DROPDOWN_PANEL_CLASS =
  'absolute left-0 top-full z-50 w-[320px] overflow-hidden rounded-b-md border-x border-b border-white/[0.07] bg-[#0a0f16] text-gray-200 shadow-[0_20px_38px_-18px_rgba(0,0,0,0.9)] light-theme:border-gray-300/60 light-theme:bg-white';

/**
 * Shared open/close behavior for a toolbar dropdown:
 * - dismiss on outside pointer-down
 * - dismiss on Escape in the capture phase, so a canvas tool listening for
 *   Escape does not also cancel, then return focus to the trigger
 * - expose refs for the container and trigger
 *
 * `onDismiss` runs whenever the panel closes (including Escape and outside
 * clicks), which lets each picker clear its own search text.
 */
export function useToolbarDropdown(onDismiss?: () => void) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const open = useCallback(() => setIsOpen(true), []);

  const close = useCallback(() => {
    setIsOpen(false);
    onDismissRef.current?.();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, close]);

  return { isOpen, open, close, containerRef, triggerRef };
}
