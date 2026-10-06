import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { platformDb } from './db';
import { store, type CoraStore } from '../store';
import { billing } from '../billing/credits';

/** F108: referral codes and a one-time two-sided credit reward. Reward amounts are placeholders (확인 필요 before launch). */
export const REFERRER_CREDITS = 30, REFERRED_CREDITS = 30, MAX_REWARDED_PER_REFERRER = 20;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export type Grant = (userId: string, amount: number, reason: string, o: { idempotencyKey: string }) => unknown;
export class Referrals {
  constructor(private db: DatabaseSync, private grant: Grant) {}
  private newCode() { const b = randomBytes(8); return Array.from(b, x => ALPHABET[x % ALPHABET.length]).join(''); }
  /** The user's code; created on first use. */
  codeFor(userId: string): string {
    const r = this.db.prepare('SELECT code FROM referral_codes WHERE user_id=?').get(userId) as { code: string } | undefined; if (r) return r.code;
    for (let i = 0; i < 5; i++) { const code = this.newCode(); try { this.db.prepare('INSERT INTO referral_codes VALUES (?,?,?)').run(userId, code, new Date().toISOString()); return code; } catch { const again = this.db.prepare('SELECT code FROM referral_codes WHERE user_id=?').get(userId) as { code: string } | undefined; if (again) return again.code; } }
    throw new Error('추천 코드를 만들 수 없습니다. 다시 시도해 주세요.');
  }
  referrerOf(code: unknown): string | null { if (typeof code !== 'string' || !/^[A-Z2-9]{8}$/.test(code.trim().toUpperCase())) return null; return (this.db.prepare('SELECT user_id FROM referral_codes WHERE code=?').get(code.trim().toUpperCase()) as { user_id: string } | undefined)?.user_id ?? null; }
  /**
   * Called after signup by the new account. Attributes the code and grants credits to both sides once per referred account.
   * Refuses: unknown code, self-referral, an account that is already attributed, and referrers past the reward cap.
   * The referred row is inserted before granting; grants use idempotency keys, so a crash between the two is repaired by a retry.
   */
  attribute(referredId: string, code: unknown): { status: 'rewarded'; referrerId: string; credits: { referrer: number; referred: number } } {
    const referrerId = this.referrerOf(code); if (!referrerId) throw new Error('추천 코드를 찾을 수 없습니다.');
    if (referrerId === referredId) throw new Error('내 추천 코드는 내 계정에 쓸 수 없습니다.');
    const prior = this.db.prepare('SELECT referrer_id,status FROM referrals WHERE referred_id=?').get(referredId) as { referrer_id: string; status: string } | undefined;
    if (prior && prior.status === 'rewarded') throw new Error('이 계정은 이미 추천 보상을 받았습니다.');
    if (!prior) {
      const n = Number((this.db.prepare("SELECT COUNT(*) n FROM referrals WHERE referrer_id=?").get(referrerId) as { n: number }).n);
      if (n >= MAX_REWARDED_PER_REFERRER) throw new Error('이 추천 코드는 보상 한도에 도달했습니다.');
      try { this.db.prepare("INSERT INTO referrals(referred_id,referrer_id,code,status,created) VALUES (?,?,?,'pending',?)").run(referredId, referrerId, String(code).trim().toUpperCase(), new Date().toISOString()); }
      catch { throw new Error('이 계정은 이미 추천 코드를 사용했습니다.'); }
    } else if (prior.referrer_id !== referrerId) throw new Error('이 계정은 이미 다른 추천 코드를 사용했습니다.');
    this.grant(referrerId, REFERRER_CREDITS, '친구 추천 보상(추천한 사람)', { idempotencyKey: `referral:${referredId}:referrer` });
    this.grant(referredId, REFERRED_CREDITS, '친구 추천 보상(가입한 사람)', { idempotencyKey: `referral:${referredId}:referred` });
    this.db.prepare("UPDATE referrals SET status='rewarded',rewarded=? WHERE referred_id=?").run(new Date().toISOString(), referredId);
    return { status: 'rewarded', referrerId, credits: { referrer: REFERRER_CREDITS, referred: REFERRED_CREDITS } };
  }
  summary(userId: string) {
    const rows = this.db.prepare("SELECT r.status,r.rewarded,r.created FROM referrals r WHERE r.referrer_id=? ORDER BY r.created DESC").all(userId) as { status: string; rewarded: string | null; created: string }[];
    const mine = this.db.prepare('SELECT status FROM referrals WHERE referred_id=?').get(userId) as { status: string } | undefined;
    return { code: this.codeFor(userId), rewardedCount: rows.filter(r => r.status === 'rewarded').length, creditsEarned: rows.filter(r => r.status === 'rewarded').length * REFERRER_CREDITS, cap: MAX_REWARDED_PER_REFERRER, referrerCredits: REFERRER_CREDITS, referredCredits: REFERRED_CREDITS, usedCode: !!mine };
  }
}
export const referrals = (s: CoraStore = store()) => s.module('platform-referrals', () => new Referrals(platformDb(s), (u, a, r, o) => billing(s).grant(u, a, r, o)));
/** Lead: call this from the signup flow (or the client after signup) with the new account id and the code from ?ref=. */
export function attributeSignup(newUserId: string, code: unknown, s: CoraStore = store()) { return referrals(s).attribute(newUserId, code); }
