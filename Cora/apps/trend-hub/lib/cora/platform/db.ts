import type { DatabaseSync } from 'node:sqlite';
import { store, type CoraStore } from '../store';

/** Tables for the platform features (F090 knowledge, F014 style profile, F108 referral). One module per connection. */
export class PlatformDb {
  constructor(readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_sources(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), brand TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('note','link','file')), title TEXT NOT NULL, url TEXT NOT NULL DEFAULT '', fetched_at TEXT NOT NULL DEFAULT '', text TEXT NOT NULL, created TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS knowledge_user_brand ON knowledge_sources(user_id,brand);
      CREATE TABLE IF NOT EXISTS style_profiles(user_id TEXT NOT NULL REFERENCES users(id), brand TEXT NOT NULL, body TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY(user_id,brand));
      CREATE TABLE IF NOT EXISTS referral_codes(user_id TEXT PRIMARY KEY REFERENCES users(id), code TEXT NOT NULL UNIQUE, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS referrals(referred_id TEXT PRIMARY KEY REFERENCES users(id), referrer_id TEXT NOT NULL REFERENCES users(id), code TEXT NOT NULL, status TEXT NOT NULL, created TEXT NOT NULL, rewarded TEXT);
      CREATE INDEX IF NOT EXISTS referrals_referrer ON referrals(referrer_id);
    `);
  }
}
export const platformDb = (s: CoraStore = store()) => s.module('platform', db => new PlatformDb(db)).db;
