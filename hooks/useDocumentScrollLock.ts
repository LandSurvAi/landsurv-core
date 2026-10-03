import { useEffect, useRef } from 'react';

const SCROLL_LOCK_ATTRIBUTE = 'data-landsurv-scroll-locked';
const activeScrollLocks = new Set<string>();
let nextScrollLockId = 0;

function syncDocumentScrollLockState(): void {
  if (typeof document === 'undefined') return;

  const locked = activeScrollLocks.size > 0;
  const root = document.getElementById('root');
  const targets: HTMLElement[] = [document.documentElement, document.body];

  if (root) {
    targets.push(root);
  }

  for (const target of targets) {
    if (locked) {
      target.setAttribute(SCROLL_LOCK_ATTRIBUTE, 'true');
    } else {
      target.removeAttribute(SCROLL_LOCK_ATTRIBUTE);
    }
  }
}

function addScrollLock(lockId: string): void {
  activeScrollLocks.add(lockId);
  syncDocumentScrollLockState();
}

function removeScrollLock(lockId: string): void {
  activeScrollLocks.delete(lockId);
  syncDocumentScrollLockState();
}

export function useDocumentScrollLock(locked: boolean): void {
  const lockIdRef = useRef<string | null>(null);

  if (!lockIdRef.current) {
    nextScrollLockId += 1;
    lockIdRef.current = `landsurv-scroll-lock-${nextScrollLockId}`;
  }

  useEffect(() => {
    const lockId = lockIdRef.current!;

    if (locked) {
      addScrollLock(lockId);
    } else {
      removeScrollLock(lockId);
    }

    return () => {
      removeScrollLock(lockId);
    };
  }, [locked]);
}
