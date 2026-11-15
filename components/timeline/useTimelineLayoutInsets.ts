import { useEffect, useState } from 'react';
import {
  AGENT_SIDEBAR_LAYOUT_EVENT,
  QUICK_THOUGHT_LAYOUT_EVENT,
} from '../../utils/layoutEvents.ts';

export interface TimelineLayoutInsets {
  left: number;
  right: number;
}

const TIMELINE_GAP = 8;
const MIN_TIMELINE_WIDTH = 240;

function readTimelineLayoutInsets(
  toolShelfOpen: boolean,
  toolShelfWidth: number,
): TimelineLayoutInsets {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { left: 0, right: 0 };
  }

  const viewportWidth = window.innerWidth;
  const sidebar = document.querySelector<HTMLElement>('[data-testid="agent-sidebar"]');
  const sidebarRect = sidebar?.getBoundingClientRect();
  let left = sidebarRect && sidebarRect.width > 0
    ? Math.max(0, sidebarRect.right)
    : 0;

  // The Quick Thought card floats over the canvas from the agent socket. End
  // the timeline before it instead of letting the two panels overlap.
  const quickThought = document.querySelector<HTMLElement>('[data-testid="agent-thought-bubble"]');
  const quickThoughtRect = quickThought?.getBoundingClientRect();
  if (quickThoughtRect && quickThoughtRect.width > 0 && quickThoughtRect.height > 0) {
    left = Math.max(left, quickThoughtRect.right + TIMELINE_GAP);
  }

  // The desktop tool shelf is a right-edge sibling. Ignore it while it is
  // mounted for the slide-out animation, and use its live left edge otherwise
  // so drag-resizing the shelf moves the timeline with it.
  let right = 0;
  if (toolShelfOpen) {
    const toolShelf = document.querySelector<HTMLElement>('[data-testid="agent-tool-shelf"]');
    const toolShelfRect = toolShelf?.getBoundingClientRect();
    right = toolShelfRect && toolShelfRect.width > 0 && toolShelfRect.left > 0
      ? Math.max(0, viewportWidth - toolShelfRect.left)
      : Math.max(0, Math.min(viewportWidth, toolShelfWidth));
  }

  // Never let the two rails squeeze the strip below a usable size. If they do,
  // give priority to the right shelf and let the left edge move back under the
  // Quick Thought rather than producing a zero-width timeline.
  const maxCombinedInset = Math.max(0, viewportWidth - MIN_TIMELINE_WIDTH - TIMELINE_GAP * 2);
  if (left + right > maxCombinedInset) {
    left = Math.max(0, left - (left + right - maxCombinedInset));
    right = Math.min(right, Math.max(0, viewportWidth - MIN_TIMELINE_WIDTH - TIMELINE_GAP * 2 - left));
  }

  return {
    left: Math.round(left),
    right: Math.round(right),
  };
}

/**
 * Track the live canvas bounds around the timeline. The left edge follows the
 * agent rail and Quick Thought card; the right edge follows the tool shelf.
 */
export function useTimelineLayoutInsets(
  toolShelfOpen: boolean,
  toolShelfWidth: number,
): TimelineLayoutInsets {
  const [insets, setInsets] = useState<TimelineLayoutInsets>(
    () => readTimelineLayoutInsets(toolShelfOpen, toolShelfWidth),
  );

  useEffect(() => {
    let frame = 0;
    let disposed = false;

    const measure = () => {
      frame = 0;
      if (disposed) return;
      const next = readTimelineLayoutInsets(toolShelfOpen, toolShelfWidth);
      setInsets(current => (
        current.left === next.left && current.right === next.right ? current : next
      ));
    };

    const scheduleMeasure = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleMeasure)
      : null;

    const refreshObservedElements = () => {
      if (observer) {
        observer.disconnect();
        const selectors = [
          '[data-testid="agent-sidebar"]',
          '[data-testid="agent-thought-bubble"]',
          '[data-testid="agent-tool-shelf"]',
        ];
        for (const selector of selectors) {
          const element = document.querySelector<HTMLElement>(selector);
          if (element) observer.observe(element);
        }
      }
      scheduleMeasure();
    };

    refreshObservedElements();

    const handleLayoutChange = () => {
      refreshObservedElements();
      scheduleMeasure();
    };

    window.addEventListener('resize', handleLayoutChange);
    window.addEventListener(AGENT_SIDEBAR_LAYOUT_EVENT, handleLayoutChange);
    window.addEventListener(QUICK_THOUGHT_LAYOUT_EVENT, handleLayoutChange);

    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', handleLayoutChange);
      window.removeEventListener(AGENT_SIDEBAR_LAYOUT_EVENT, handleLayoutChange);
      window.removeEventListener(QUICK_THOUGHT_LAYOUT_EVENT, handleLayoutChange);
    };
  }, [toolShelfOpen, toolShelfWidth]);

  return insets;
}
