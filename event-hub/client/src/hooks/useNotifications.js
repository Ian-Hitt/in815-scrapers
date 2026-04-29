import { useEffect, useRef, useCallback } from "react";
import { useNotificationStore } from "../context/NotificationContext.jsx";

/**
 * Request browser notification permission on mount, provide a notify() function
 * that sends both a browser notification AND adds to the in-app notification store.
 */
export function useNotifications() {
  const { addNotification } = useNotificationStore();

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const notify = useCallback((title, { body, type = "info", ...rest } = {}) => {
    // In-app notification
    addNotification({ title, body, type });

    // Browser notification
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification(title, {
        icon: "/pwa-192.png",
        badge: "/pwa-192.png",
        body,
        ...rest,
      });
      setTimeout(() => n.close(), 8000);
    }
  }, [addNotification]);

  return { notify };
}

/**
 * Track items by key and detect when any transition from a "running" status
 * to a terminal status. Calls `onComplete(item)` for each such transition.
 *
 * @param {Array} items - array of objects with a key field and a status field
 * @param {Object} opts
 * @param {Function} opts.getKey - extract unique key from item
 * @param {Function} opts.getStatus - extract status string from item
 * @param {string[]} opts.runningStatuses - statuses considered "in progress"
 * @param {Function} opts.onComplete - called with the item when it transitions to done
 */
export function useCompletionNotifier(items, { getKey, getStatus, runningStatuses, onComplete }) {
  const prevRef = useRef(new Map());

  useEffect(() => {
    if (!items) return;
    const prev = prevRef.current;
    const next = new Map();

    for (const item of items) {
      const key = getKey(item);
      const status = getStatus(item);
      next.set(key, status);

      const prevStatus = prev.get(key);
      if (prevStatus && runningStatuses.includes(prevStatus) && !runningStatuses.includes(status)) {
        onComplete(item);
      }
    }

    prevRef.current = next;
  }, [items, getKey, getStatus, runningStatuses, onComplete]);
}
