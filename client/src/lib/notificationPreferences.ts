export type NotificationPreferences = {
  sessionExpiry: boolean;
  stakingActivity: boolean;
  stakingExpiry: boolean;
};

export const defaultNotificationPreferences: NotificationPreferences = {
  sessionExpiry: true,
  stakingActivity: true,
  stakingExpiry: true,
};

const STORAGE_KEY = "agentbond.notification-preferences";
const EVENT_NAME = "agentbond:notification-preferences";

export function readNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") return defaultNotificationPreferences;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<NotificationPreferences> | null;
    return { ...defaultNotificationPreferences, ...parsed };
  } catch {
    return defaultNotificationPreferences;
  }
}

export function saveNotificationPreferences(preferences: NotificationPreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function subscribeToNotificationPreferences(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
