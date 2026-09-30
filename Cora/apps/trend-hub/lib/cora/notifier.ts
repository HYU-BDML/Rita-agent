import { store, type CoraStore } from './store';
import { WorkspaceSettings } from './workspace-settings';
/** Fire-and-forget notification for product events. Never throws into the caller (notify itself never rejects). */
export function settings(s: CoraStore = store()) { return s.module('workspace-settings', db => new WorkspaceSettings(db)); }
export function notifyUser(userId: string | null | undefined, kind: string, payload: { title: string; body?: string; link?: string }, s?: CoraStore) {
  if (!userId) return; try { void settings(s).notify(userId, kind, payload).catch(() => {}); } catch { /* notification must never break the main action */ }
}
