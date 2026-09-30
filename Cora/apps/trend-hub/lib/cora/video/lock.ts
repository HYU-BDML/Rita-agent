/** One FFmpeg job per user at a time across render, motion and clip routes (same rule the original render route had). */
const active = new Set<string>();
export class BusyError extends Error { constructor() { super('이미 영상 작업 중입니다. 끝난 뒤 다시 시도해 주세요.'); } }
export async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  if (active.has(userId)) throw new BusyError(); active.add(userId);
  try { return await fn(); } finally { active.delete(userId); }
}
