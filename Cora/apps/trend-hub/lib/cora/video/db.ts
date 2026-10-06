import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { store } from '../store';
import type { TemplateSettings } from './template';
import type { Segment } from './srt';

export class VersionConflict extends Error { constructor(public current: number) { super('다른 곳에서 먼저 수정되었습니다. 최신 내용을 불러온 뒤 다시 저장해 주세요.'); } }
export interface AudioRow { id: string; name: string; ext: string; bytes: number; license: string; source: string; duration: number; createdAt: string }
export interface TemplateRow { id: string; name: string; version: number; settings: TemplateSettings; fromItem: string | null; createdAt: string; updatedAt: string }
export interface SourceRow { id: string; name: string; ext: string; size: number; received: number; status: 'uploading' | 'ready'; duration: number; width: number; height: number; hasAudio: boolean; srt: Segment[] | null; createdAt: string }
export interface ClipRow { id: string; sourceId: string; start: number; end: number; burn: boolean; track: boolean; bytes: number; createdAt: string }

/** Tables owned by the video feature batch; every read and write is scoped by user_id. */
export class VideoStore {
  constructor(private db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS cora_video_audio(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, ext TEXT NOT NULL, bytes INTEGER NOT NULL, license TEXT NOT NULL, source TEXT NOT NULL, duration REAL NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cora_video_templates(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, version INTEGER NOT NULL, settings TEXT NOT NULL, from_item TEXT, created TEXT NOT NULL, updated TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cora_video_sources(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, ext TEXT NOT NULL, size INTEGER NOT NULL, received INTEGER NOT NULL, status TEXT NOT NULL, duration REAL NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, has_audio INTEGER NOT NULL, srt TEXT, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cora_video_clips(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, source_id TEXT NOT NULL, start REAL NOT NULL, end REAL NOT NULL, burn INTEGER NOT NULL, track INTEGER NOT NULL, bytes INTEGER NOT NULL, created TEXT NOT NULL);`);
  }
  private one<T>(sql: string, ...p: (string | number | null)[]) { return this.db.prepare(sql).get(...p) as T | undefined; }
  private all<T>(sql: string, ...p: (string | number | null)[]) { return this.db.prepare(sql).all(...p) as T[]; }
  // audio (F043)
  private audio = (r: { id: string; name: string; ext: string; bytes: number; license: string; source: string; duration: number; created: string }): AudioRow => ({ id: r.id, name: r.name, ext: r.ext, bytes: r.bytes, license: r.license, source: r.source, duration: r.duration, createdAt: r.created });
  addAudio(userId: string, a: Omit<AudioRow, 'id' | 'createdAt'>, id = randomUUID()) { const created = new Date().toISOString(); this.db.prepare('INSERT INTO cora_video_audio VALUES (?,?,?,?,?,?,?,?,?)').run(id, userId, a.name, a.ext, a.bytes, a.license, a.source, a.duration, created); return this.getAudio(userId, id)!; }
  getAudio(userId: string, id: string) { const r = this.one<Parameters<typeof this.audio>[0]>('SELECT * FROM cora_video_audio WHERE id=? AND user_id=?', id, userId); return r ? this.audio(r) : null; }
  listAudio(userId: string) { return this.all<Parameters<typeof this.audio>[0]>('SELECT * FROM cora_video_audio WHERE user_id=? ORDER BY created DESC', userId).map(this.audio); }
  deleteAudio(userId: string, id: string) { return this.db.prepare('DELETE FROM cora_video_audio WHERE id=? AND user_id=?').run(id, userId).changes === 1; }
  // templates (F045/F046/F052)
  private tpl = (r: { id: string; name: string; version: number; settings: string; from_item: string | null; created: string; updated: string }): TemplateRow => ({ id: r.id, name: r.name, version: r.version, settings: JSON.parse(r.settings), fromItem: r.from_item, createdAt: r.created, updatedAt: r.updated });
  addTemplate(userId: string, name: string, settings: TemplateSettings, fromItem: string | null = null) { const id = randomUUID(), now = new Date().toISOString(); this.db.prepare('INSERT INTO cora_video_templates VALUES (?,?,?,?,?,?,?,?)').run(id, userId, name, 1, JSON.stringify(settings), fromItem, now, now); return this.getTemplate(userId, id)!; }
  getTemplate(userId: string, id: string) { const r = this.one<Parameters<typeof this.tpl>[0]>('SELECT * FROM cora_video_templates WHERE id=? AND user_id=?', id, userId); return r ? this.tpl(r) : null; }
  listTemplates(userId: string) { return this.all<Parameters<typeof this.tpl>[0]>('SELECT * FROM cora_video_templates WHERE user_id=? ORDER BY updated DESC', userId).map(this.tpl); }
  /** Optimistic check: the UPDATE only matches when the stored version equals what the editor loaded. */
  updateTemplate(userId: string, id: string, expectedVersion: number, patch: { name?: string; settings?: TemplateSettings }) {
    const cur = this.getTemplate(userId, id); if (!cur) return null;
    const res = this.db.prepare('UPDATE cora_video_templates SET name=?, settings=?, version=version+1, updated=? WHERE id=? AND user_id=? AND version=?').run(patch.name ?? cur.name, JSON.stringify(patch.settings ?? cur.settings), new Date().toISOString(), id, userId, expectedVersion);
    if (res.changes !== 1) throw new VersionConflict(this.getTemplate(userId, id)!.version);
    return this.getTemplate(userId, id)!;
  }
  deleteTemplate(userId: string, id: string) { return this.db.prepare('DELETE FROM cora_video_templates WHERE id=? AND user_id=?').run(id, userId).changes === 1; }
  // sources (E207)
  private src = (r: { id: string; name: string; ext: string; size: number; received: number; status: string; duration: number; width: number; height: number; has_audio: number; srt: string | null; created: string }): SourceRow => ({ id: r.id, name: r.name, ext: r.ext, size: r.size, received: r.received, status: r.status as SourceRow['status'], duration: r.duration, width: r.width, height: r.height, hasAudio: !!r.has_audio, srt: r.srt ? JSON.parse(r.srt) : null, createdAt: r.created });
  addSource(userId: string, name: string, ext: string, size: number) { const id = randomUUID(); this.db.prepare("INSERT INTO cora_video_sources VALUES (?,?,?,?,?,0,'uploading',0,0,0,0,NULL,?)").run(id, userId, name, ext, size, new Date().toISOString()); return this.getSource(userId, id)!; }
  getSource(userId: string, id: string) { const r = this.one<Parameters<typeof this.src>[0]>('SELECT * FROM cora_video_sources WHERE id=? AND user_id=?', id, userId); return r ? this.src(r) : null; }
  listSources(userId: string) { return this.all<Parameters<typeof this.src>[0]>('SELECT * FROM cora_video_sources WHERE user_id=? ORDER BY created DESC', userId).map(this.src); }
  /** Advances the received counter only if the client's offset equals what is on disk (one writer per upload). */
  advanceSource(userId: string, id: string, offset: number, add: number) { return this.db.prepare("UPDATE cora_video_sources SET received=received+? WHERE id=? AND user_id=? AND received=? AND status='uploading'").run(add, id, userId, offset).changes === 1; }
  finishSource(userId: string, id: string, m: { duration: number; width: number; height: number; hasAudio: boolean }) { this.db.prepare("UPDATE cora_video_sources SET status='ready', duration=?, width=?, height=?, has_audio=? WHERE id=? AND user_id=?").run(m.duration, m.width, m.height, m.hasAudio ? 1 : 0, id, userId); }
  setSourceSrt(userId: string, id: string, segments: Segment[]) { this.db.prepare('UPDATE cora_video_sources SET srt=? WHERE id=? AND user_id=?').run(JSON.stringify(segments), id, userId); }
  deleteSource(userId: string, id: string) { this.db.prepare('DELETE FROM cora_video_clips WHERE source_id=? AND user_id=?').run(id, userId); return this.db.prepare('DELETE FROM cora_video_sources WHERE id=? AND user_id=?').run(id, userId).changes === 1; }
  // clips
  private clip = (r: { id: string; source_id: string; start: number; end: number; burn: number; track: number; bytes: number; created: string }): ClipRow => ({ id: r.id, sourceId: r.source_id, start: r.start, end: r.end, burn: !!r.burn, track: !!r.track, bytes: r.bytes, createdAt: r.created });
  addClip(userId: string, id: string, c: Omit<ClipRow, 'id' | 'createdAt'>) { this.db.prepare('INSERT INTO cora_video_clips VALUES (?,?,?,?,?,?,?,?,?)').run(id, userId, c.sourceId, c.start, c.end, c.burn ? 1 : 0, c.track ? 1 : 0, c.bytes, new Date().toISOString()); return this.getClip(userId, id)!; }
  getClip(userId: string, id: string) { const r = this.one<Parameters<typeof this.clip>[0]>('SELECT * FROM cora_video_clips WHERE id=? AND user_id=?', id, userId); return r ? this.clip(r) : null; }
  listClips(userId: string, sourceId?: string) { return (sourceId ? this.all<Parameters<typeof this.clip>[0]>('SELECT * FROM cora_video_clips WHERE user_id=? AND source_id=? ORDER BY created DESC', userId, sourceId) : this.all<Parameters<typeof this.clip>[0]>('SELECT * FROM cora_video_clips WHERE user_id=? ORDER BY created DESC', userId)).map(this.clip); }
  deleteClip(userId: string, id: string) { return this.db.prepare('DELETE FROM cora_video_clips WHERE id=? AND user_id=?').run(id, userId).changes === 1; }
  clipIdsForSource(userId: string, sourceId: string) { return this.listClips(userId, sourceId).map(c => c.id); }
}
export const videoStore = () => store().module('cora-video', db => new VideoStore(db));
