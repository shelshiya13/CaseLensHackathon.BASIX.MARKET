import React, { useState, useEffect } from 'react';
import { Bell, Check, Clock } from 'lucide-react';
import { apiRequest } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';

export const NotificationBell: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = async () => {
    try {
      const res = await apiRequest<{ notifications: any[]; unreadCount: number }>('/api/notifications');
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
      setError(null);
    } catch (err) {
      console.error('Failed to load notifications:', err);
      setError(err instanceof Error ? err.message : 'Notifications could not be loaded.');
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, []);

  const markAllRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      setUnreadCount(0);
      setNotifications(notifications.map(n => ({ ...n, read_at: new Date().toISOString() })));
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Unable to mark notifications as read.');
    }
  };

  const markOneRead = async (id: string) => {
    const target = notifications.find(notification => notification.id === id);
    if (!target || target.read_at) return;
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'POST' });
      setUnreadCount(Math.max(0, unreadCount - 1));
      setNotifications(notifications.map(n => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Unable to update this notification.');
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-white/80 hover:text-white rounded hover:bg-white/10 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 px-1.5 py-0.2 bg-[#9B2C2C] text-white text-[10px] font-bold rounded-full font-mono">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notification-popover absolute right-0 mt-2 w-80 sm:w-96 border z-50 overflow-hidden">
          <div className="px-4 py-2.5 bg-[#FAF7F0] border-b border-[#E4DFD3] flex items-center justify-between">
            <span className="font-medium text-xs text-[#2B2D33]">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] text-[#B08D57] hover:underline font-medium"
              >
                Mark all as read
              </button>
            )}
          </div>

          {error && <div role="alert" className="px-4 py-2 text-xs text-[#9B2C2C] bg-[#FDF2F2] border-b border-[#F8B4B4]">{error}</div>}

          <div className="max-h-80 overflow-y-auto divide-y divide-[#E4DFD3]">
            {notifications.length === 0 && !error ? (
              <div className="p-6 text-center text-xs text-[#5C5E66]">No notifications yet.</div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markOneRead(n.id)}
                  className={`w-full text-left p-3 text-xs hover:bg-[#FAF7F0] ${
                    !n.read_at ? 'bg-[#FDFBF7] font-medium' : 'text-[#5C5E66]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-[#5C5E66] mb-1">
                    <span className="font-mono text-[#14213D]">{n.case_ref || 'Case'}</span>
                    <span>{formatDateTime(n.created_at)}</span>
                  </div>
                  <div className="text-[#2B2D33] font-medium">{n.title}</div>
                  <div className="text-[#5C5E66] mt-0.5 text-[11px] line-clamp-2">{n.body}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
