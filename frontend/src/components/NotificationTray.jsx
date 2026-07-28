import React, { useContext, useEffect } from 'react';
import { Bell, X, CheckCheck } from 'lucide-react';
import { NotifContext } from '../App';
import { useAuth } from '../App';
import { markNotificationRead } from '../api';
import { format } from 'date-fns';

export default function NotificationTray() {
    const { role } = useAuth();
    const { notifications, setNotifications, trayOpen, setTrayOpen, loadNotifs } = useContext(NotifContext);

    useEffect(() => {
        if (trayOpen) loadNotifs(role);
    }, [trayOpen, role]);

    const handleRead = async (id) => {
        await markNotificationRead(id);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    };

    const handleReadAll = async () => {
        const unread = notifications.filter(n => !n.is_read);
        for (const n of unread) await markNotificationRead(n.id);
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    };

    if (!trayOpen) return null;

    const unread = notifications.filter(n => !n.is_read).length;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/40 z-40"
                onClick={() => setTrayOpen(false)}
            />

            {/* Tray */}
            <div className="fixed right-0 top-0 h-full w-96 z-50 flex flex-col glass border-l border-gray-700/50 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                    <div className="flex items-center gap-2">
                        <Bell size={16} className="text-indigo-400" />
                        <span className="font-semibold text-white text-sm">Notifications</span>
                        {unread > 0 && (
                            <span className="badge badge-red text-xs">{unread}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {unread > 0 && (
                            <button onClick={handleReadAll} className="text-xs text-gray-500 hover:text-gray-200 flex items-center gap-1">
                                <CheckCheck size={12} /> Mark all read
                            </button>
                        )}
                        <button onClick={() => setTrayOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors">
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3">
                            <Bell size={32} className="opacity-30" />
                            <p className="text-sm">No notifications</p>
                        </div>
                    ) : (
                        notifications.map(n => {
                            // Determine dot & badge color from tier
                            const tierDot = n.tier === 'Green' ? '#4ade80'
                                : n.tier === 'Amber' ? '#fbbf24'
                                    : n.tier === 'Red' ? '#f87171'
                                        : n.is_read ? '#374151' : '#818cf8';

                            const tierBadgeClass = n.tier === 'Green' ? 'badge-green'
                                : n.tier === 'Amber' ? 'badge-amber'
                                    : n.tier === 'Red' ? 'badge-red'
                                        : 'badge';

                            const tierBgClass = n.tier === 'Green' ? (!n.is_read ? 'bg-green-950/20' : '')
                                : n.tier === 'Amber' ? (!n.is_read ? 'bg-amber-950/20' : '')
                                    : n.tier === 'Red' ? (!n.is_read ? 'bg-red-950/20' : '')
                                        : (!n.is_read ? 'bg-indigo-950/20' : '');

                            return (
                                <div
                                    key={n.id}
                                    onClick={() => handleRead(n.id)}
                                    className={`px-5 py-4 cursor-pointer transition-colors hover:bg-gray-800/40 ${tierBgClass}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                                            style={{ background: tierDot }} />
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm leading-snug ${!n.is_read ? 'text-gray-200' : 'text-gray-400'}`}>
                                                {n.message}
                                            </p>
                                            <p className="text-xs text-gray-600 mt-1.5">
                                                {n.contract_id && <span className="text-gray-500 mr-2">Contract #{n.contract_id}</span>}
                                                {format(new Date(n.created_at + 'Z'), 'MMM dd, HH:mm')}
                                            </p>
                                            <div className="flex items-center gap-1.5 mt-1.5">
                                                {n.tier && (
                                                    <span className={`badge text-xs ${tierBadgeClass}`}>
                                                        {n.tier}
                                                    </span>
                                                )}
                                                <span className="badge text-xs" style={{ color: '#9ca3af', background: '#1f2937' }}>
                                                    {n.target_role === 'manager' ? 'Manager' : 'Auditor'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </>
    );
}
