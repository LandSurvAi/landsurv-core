// NotificationCenter.tsx
// Header-mounted notification bell with a popover list. Generic over
// AppNotification kinds — new sources just append entries to the
// `notifications` prop in App.tsx. The component itself owns no state about
// what the notifications mean.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AppNotification, NotificationSeverity } from '../types.ts';
import { ExclamationTriangleIcon, XMarkIcon } from './icons.tsx';

interface NotificationCenterProps {
    notifications: AppNotification[];
    onDismiss?: (id: string) => void;
    onClearAll?: () => void;
}

const severityStyles: Record<NotificationSeverity, { dot: string; ring: string; text: string }> = {
    info:    { dot: 'bg-sky-400',     ring: 'ring-sky-500/30',     text: 'text-sky-200' },
    success: { dot: 'bg-emerald-400', ring: 'ring-emerald-500/30', text: 'text-emerald-200' },
    warning: { dot: 'bg-amber-400',   ring: 'ring-amber-500/40',   text: 'text-amber-200' },
    error:   { dot: 'bg-rose-400',    ring: 'ring-rose-500/40',    text: 'text-rose-200' },
};

// Compact HH:MM timestamp for the notification row.
function formatTime(iso: string): string | null {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ notifications, onDismiss, onClearAll }) => {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [popoverPos, setPopoverPos] = useState<{ top: number; right: number } | null>(null);

    // Position the portal-rendered popover under the bell button.
    useLayoutEffect(() => {
        if (!open || !buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        setPopoverPos({
            top: rect.bottom + 8,
            right: Math.max(8, window.innerWidth - rect.right),
        });
    }, [open]);

    // Close on outside click (button + popover are both "inside").
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            const inButton = wrapperRef.current?.contains(target);
            const inPopover = popoverRef.current?.contains(target);
            if (!inButton && !inPopover) {
                setOpen(false);
            }
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [open]);

    const badge = notifications.reduce((sum, n) => sum + (n.count ?? 1), 0);
    const hasAny = notifications.length > 0;
    const topSeverity: NotificationSeverity = notifications.some(n => n.severity === 'error')
        ? 'error'
        : notifications.some(n => n.severity === 'warning')
            ? 'warning'
            : notifications.some(n => n.severity === 'success')
                ? 'success'
                : 'info';

    const bellColor = hasAny
        ? (topSeverity === 'error' ? 'text-rose-400' : topSeverity === 'warning' ? 'text-amber-400' : topSeverity === 'success' ? 'text-emerald-400' : 'text-sky-400')
        : 'text-gray-500';

    return (
        <div ref={wrapperRef} className="relative">
            <button
                ref={buttonRef}
                onClick={() => setOpen(o => !o)}
                className={`p-2 rounded-full hover:bg-gray-700 transition-colors relative ${hasAny ? 'animate-pulse' : ''}`}
                title={hasAny ? `${badge} notification${badge === 1 ? '' : 's'}` : 'No notifications'}
            >
                <ExclamationTriangleIcon className={`w-6 h-6 ${bellColor}`} />
                {hasAny && (
                    <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ${severityStyles[topSeverity].ring} ${
                        topSeverity === 'error' ? 'bg-rose-600 text-white'
                        : topSeverity === 'warning' ? 'bg-amber-500 text-gray-900'
                        : 'bg-sky-600 text-white'
                    }`}>
                        {badge > 99 ? '99+' : badge}
                    </span>
                )}
            </button>

            {open && popoverPos && createPortal(
                <div
                    ref={popoverRef}
                    className="fixed w-80 max-h-96 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-2xl"
                    style={{ top: popoverPos.top, right: popoverPos.right, zIndex: 9999 }}
                >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
                        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Notifications</span>
                        <div className="flex items-center gap-1">
                            {notifications.length > 0 && onClearAll && (
                                <button
                                    onClick={() => onClearAll()}
                                    className="px-2 py-0.5 rounded text-[10px] font-semibold text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                                    title="Clear all notifications"
                                >
                                    Clear all
                                </button>
                            )}
                            <button
                                onClick={() => setOpen(false)}
                                className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200"
                                title="Close"
                            >
                                <XMarkIcon className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                    {notifications.length === 0 ? (
                        <p className="px-3 py-6 text-center text-xs text-gray-500">All clear.</p>
                    ) : (
                        <ul className="divide-y divide-gray-800">
                            {notifications.map(n => {
                                const sev = (n?.severity && severityStyles[n.severity]) || severityStyles.info;
                                const clickable = !!n.onActivate;
                                const time = n.createdAt ? formatTime(n.createdAt) : null;
                                return (
                                    <li key={n.id} className="relative flex items-stretch">
                                        <button
                                            type="button"
                                            disabled={!clickable}
                                            onClick={() => {
                                                n.onActivate?.();
                                                setOpen(false);
                                            }}
                                            className={`flex-1 min-w-0 text-left ${onDismiss ? 'pl-3 pr-7' : 'px-3'} py-2.5 transition-colors flex items-start gap-2 ${clickable ? 'hover:bg-gray-800/70 cursor-pointer' : 'cursor-default'}`}
                                        >
                                            <span className={`mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${sev.dot}`} />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className={`text-xs font-semibold ${sev.text} truncate`}>{n.title || n.message || 'Notification'}</p>
                                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                                        {typeof n.count === 'number' && n.count > 0 && (
                                                            <span className="text-[10px] font-mono text-gray-400">×{n.count}</span>
                                                        )}
                                                        {time && (
                                                            <span className="text-[10px] font-mono text-gray-500">{time}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                {n.message && (
                                                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{n.message}</p>
                                                )}
                                                {clickable && (
                                                    <p className="text-[10px] text-sky-400 mt-1 font-medium">Open →</p>
                                                )}
                                            </div>
                                        </button>
                                        {onDismiss && (
                                            <button
                                                type="button"
                                                onClick={() => onDismiss(n.id)}
                                                title="Dismiss"
                                                className="absolute top-1.5 right-1.5 p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800"
                                            >
                                                <XMarkIcon className="w-3 h-3" />
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};

export default NotificationCenter;
