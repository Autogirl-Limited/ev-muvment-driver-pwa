const QUEUE_KEY = "muvment.driver.offlineQueue";

export type QueuedDriverAction = {
  body?: unknown;
  createdAt: string;
  id: string;
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  title: string;
};

export function loadQueuedActions(): QueuedDriverAction[] {
  if (typeof window === "undefined") {
    return [];
  }

  const value = window.localStorage.getItem(QUEUE_KEY);
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as QueuedDriverAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    window.localStorage.removeItem(QUEUE_KEY);
    return [];
  }
}

export function saveQueuedActions(actions: QueuedDriverAction[]) {
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(actions));
}

export function queueDriverAction(
  action: Omit<QueuedDriverAction, "createdAt" | "id">,
) {
  const nextAction: QueuedDriverAction = {
    ...action,
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
  };

  const actions = [...loadQueuedActions(), nextAction];
  saveQueuedActions(actions);
  window.dispatchEvent(new Event("muvment-offline-queue-change"));
  return nextAction;
}

export function removeQueuedAction(actionId: string) {
  const actions = loadQueuedActions().filter((action) => action.id !== actionId);
  saveQueuedActions(actions);
  window.dispatchEvent(new Event("muvment-offline-queue-change"));
  return actions;
}
