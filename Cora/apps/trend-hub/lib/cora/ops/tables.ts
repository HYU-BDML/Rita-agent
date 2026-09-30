import type{DatabaseSync}from'node:sqlite';
import type{CoraStore}from'../store';
/** Tables owned by the operations features. Created once per connection through store().module. */
export class OpsTables{
 constructor(readonly db:DatabaseSync){db.exec(`
  CREATE TABLE IF NOT EXISTS ops_plans(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),draft_id TEXT NOT NULL UNIQUE REFERENCES publication_drafts(id) ON DELETE CASCADE,calendar_id TEXT NOT NULL,queue_id TEXT,job_id TEXT,note TEXT NOT NULL DEFAULT '',created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS ops_republish(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),from_queue_id TEXT NOT NULL,from_draft_id TEXT,to_draft_id TEXT NOT NULL,created TEXT NOT NULL,UNIQUE(from_queue_id,to_draft_id));
  CREATE TABLE IF NOT EXISTS ops_threads(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,platform TEXT NOT NULL,posts TEXT NOT NULL,attach_date TEXT,created TEXT NOT NULL,updated TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS ops_threads_user ON ops_threads(user_id,attach_date);`);}
}
export const opsTables=(s:CoraStore)=>s.module('ops',db=>new OpsTables(db));
