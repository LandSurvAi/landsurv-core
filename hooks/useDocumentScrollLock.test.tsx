import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDocumentScrollLock } from './useDocumentScrollLock';

const LOCK_ATTRIBUTE = 'data-landsurv-scroll-locked';

describe('useDocumentScrollLock', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute(LOCK_ATTRIBUTE);
    document.body.removeAttribute(LOCK_ATTRIBUTE);

    const existingRoot = document.getElementById('root');
    existingRoot?.remove();

    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.documentElement.removeAttribute(LOCK_ATTRIBUTE);
    document.body.removeAttribute(LOCK_ATTRIBUTE);
    document.getElementById('root')?.removeAttribute(LOCK_ATTRIBUTE);
    document.getElementById('root')?.remove();
  });

  it('sets the lock attribute on html, body, and root while active', () => {
    const { unmount } = renderHook(() => useDocumentScrollLock(true));

    expect(document.documentElement.getAttribute(LOCK_ATTRIBUTE)).toBe('true');
    expect(document.body.getAttribute(LOCK_ATTRIBUTE)).toBe('true');
    expect(document.getElementById('root')?.getAttribute(LOCK_ATTRIBUTE)).toBe('true');

    unmount();

    expect(document.documentElement.hasAttribute(LOCK_ATTRIBUTE)).toBe(false);
    expect(document.body.hasAttribute(LOCK_ATTRIBUTE)).toBe(false);
    expect(document.getElementById('root')?.hasAttribute(LOCK_ATTRIBUTE)).toBe(false);
  });

  it('does not lock when disabled', () => {
    renderHook(() => useDocumentScrollLock(false));

    expect(document.documentElement.hasAttribute(LOCK_ATTRIBUTE)).toBe(false);
    expect(document.body.hasAttribute(LOCK_ATTRIBUTE)).toBe(false);
    expect(document.getElementById('root')?.hasAttribute(LOCK_ATTRIBUTE)).toBe(false);
  });

  it('keeps the document locked until the last consumer unmounts', () => {
    const first = renderHook(() => useDocumentScrollLock(true));
    const second = renderHook(() => useDocumentScrollLock(true));

    first.unmount();
    expect(document.body.getAttribute(LOCK_ATTRIBUTE)).toBe('true');

    second.unmount();
    expect(document.body.hasAttribute(LOCK_ATTRIBUTE)).toBe(false);
  });
});
