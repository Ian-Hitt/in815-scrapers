import { createContext, useContext, useState, useCallback } from "react";

const STORAGE_KEY = "eventhub_notifications";
const MAX_NOTIFICATIONS = 50;

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function save(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_NOTIFICATIONS)));
}

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState(load);

  const addNotification = useCallback(({ title, body, type = "info" }) => {
    setNotifications((prev) => {
      const next = [
        { id: Date.now() + Math.random(), title, body, type, time: new Date().toISOString(), read: false },
        ...prev,
      ].slice(0, MAX_NOTIFICATIONS);
      save(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      save(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    save([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, addNotification, markAllRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationStore() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotificationStore must be inside NotificationProvider");
  return ctx;
}
