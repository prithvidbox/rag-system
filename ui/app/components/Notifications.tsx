'use client';

import { useEffect, useState } from 'react';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  createdAt: number;
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const handler = (event: CustomEvent<Notification>) => {
      setNotifications((prev) => [event.detail, ...prev].slice(0, 5));
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== event.detail.id));
      }, 5000);
    };

    window.addEventListener('rag-notify', handler as EventListener);
    return () => window.removeEventListener('rag-notify', handler as EventListener);
  }, []);

  return (
    <div className="notifications-container">
      {notifications.map((n) => (
        <div key={n.id} className={`notification-card ${n.type}`}>
          <div className="notification-message">{n.message}</div>
        </div>
      ))}
    </div>
  );
}
