import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { store, type CoraStore } from '../store';
import type { PaymentObservation } from './toss';

/**
 * Credits, prices, plans and orders (F101-F105). Every balance change is one row in the append-only
 * billing_ledger (UPDATE/DELETE are blocked by triggers) inside a BEGIN IMMEDIATE transaction, so two
 * connections to one file cannot overdraw. Spending is idempotent per (user, key).
 * KRW prices and credit amounts below are placeholder defaults, 확인 필요 before real launch.
 */
const DAY = 86400000, TRIAL_DAYS = 14, PERIOD_DAYS = 30, TRIAL_CREDITS = 50;
export const LOCAL_RUN_LIMIT = 10; // mirrors the local 10 AI runs / 24h limit counted by CoraStore.generationCount
export const FEATURES = {
  card_ai: { label: '카드뉴스 AI 생성', credits: 10 }, blog_ai: { label: '블로그 글 AI 생성', credits: 8 }, script_ai: { label: '대본 AI 생성', credits: 6 },
  ideas_ai: { label: '아이디어 AI 생성', credits: 4 }, video_render: { label: '영상 렌더링', credits: 5 }, publish: { label: '게시 요청', credits: 1 },
} as const;
export type Feature = keyof typeof FEATURES;
export const PLANS = {
  free: { label: '무료', rank: 0, monthly: 0, yearly: 0, credits: 20 },
  starter: { label: '스타터', rank: 1, monthly: 9900, yearly: 99000, credits: 300 },
  pro: { label: '프로', rank: 2, monthly: 29900, yearly: 299000, credits: 1200 },
} as const;
export type Plan = keyof typeof PLANS;
export type Period = 'monthly' | 'yearly';
export const PACKS = [{ credits: 500, price: 5000 }, { credits: 1500, price: 13500 }, { credits: 5000, price: 42500 }] as const;

type Acc = { user_id: string; plan: Plan; period: Period; trial_start: number; trial_end: number; period_start: number; period_end: number; next_grant_at: number; pending_plan: string | null; pending_period: string | null; balance: number };
type LedgerRow = { id: string; kind: 'grant' | 'spend' | 'refund'; amount: number; delta: number; reason: string; feature: string | null; item_id: string | null; balance_after: number; created: string };
type OrderRow = { id: string; user_id: string; kind: 'plan' | 'pack'; ref: string; label: string; amount: number; status: 'created' | 'paid' | 'failed' | 'unknown'; payment_key: string | null; code: string | null; message: string | null; note: string; created: string; completed: string | null };
export type LedgerEntry = { id: string; kind: LedgerRow['kind']; amount: number; delta: number; reason: string; feature: string | null; itemId: string | null; balanceAfter: number; createdAt: string };
export type SpendResult = { ok: true; replay: boolean; entry: LedgerEntry; balance: number } | { ok: false; code: 'INSUFFICIENT_CREDITS'; needed: number; balance: number };
export type Order = { orderId: string; kind: 'plan' | 'pack'; ref: string; label: string; amount: number; status: OrderRow['status']; note: string; code: string | null; message: string | null; createdAt: string };
const entry = (r: LedgerRow): LedgerEntry => ({ id: r.id, kind: r.kind, amount: r.amount, delta: r.delta, reason: r.reason, feature: r.feature, itemId: r.item_id, balanceAfter: r.balance_after, createdAt: r.created });
const won = (n: number) => n.toLocaleString('ko-KR') + '원';
const isFeature = (f: unknown): f is Feature => typeof f === 'string' && Object.prototype.hasOwnProperty.call(FEATURES, f);
const cleanKey = (k: unknown) => { if (typeof k !== 'string' || !k.trim() || k.length > 128) throw new Error('중복 방지 키(idempotencyKey)는 1~128자 문자열이어야 합니다.'); return k; };

export class BillingStore {
  private depth = 0;
  constructor(private db: DatabaseSync, private now: () => number = () => Date.now()) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS billing_accounts(user_id TEXT PRIMARY KEY REFERENCES users(id), plan TEXT NOT NULL, period TEXT NOT NULL, trial_start INTEGER NOT NULL, trial_end INTEGER NOT NULL, period_start INTEGER NOT NULL, period_end INTEGER NOT NULL, next_grant_at INTEGER NOT NULL, pending_plan TEXT, pending_period TEXT, balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0));
      CREATE TABLE IF NOT EXISTS billing_ledger(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('grant','spend','refund')), amount INTEGER NOT NULL CHECK(amount>=0), delta INTEGER NOT NULL, reason TEXT NOT NULL, feature TEXT, item_id TEXT, idem_key TEXT, balance_after INTEGER NOT NULL CHECK(balance_after>=0), created TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS billing_ledger_idem ON billing_ledger(user_id,idem_key) WHERE idem_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS billing_ledger_user ON billing_ledger(user_id,seq);
      CREATE TRIGGER IF NOT EXISTS billing_ledger_no_update BEFORE UPDATE ON billing_ledger BEGIN SELECT RAISE(ABORT,'billing_ledger is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS billing_ledger_no_delete BEFORE DELETE ON billing_ledger BEGIN SELECT RAISE(ABORT,'billing_ledger is append-only'); END;
      CREATE TABLE IF NOT EXISTS billing_orders(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, ref TEXT NOT NULL, label TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL, payment_key TEXT, code TEXT, message TEXT, note TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, completed TEXT);
      CREATE INDEX IF NOT EXISTS billing_orders_user ON billing_orders(user_id,created);
      CREATE TABLE IF NOT EXISTS billing_prices(user_id TEXT NOT NULL REFERENCES users(id), feature TEXT NOT NULL, credits INTEGER NOT NULL CHECK(credits>=0), updated TEXT NOT NULL, PRIMARY KEY(user_id,feature));
    `);
  }
  private tx<T>(f: () => T): T {
    if (this.depth) return f();
    this.db.exec('BEGIN IMMEDIATE'); this.depth++;
    try { const r = f(); this.db.exec('COMMIT'); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; } finally { this.depth--; }
  }
  private row(userId: string) { return this.db.prepare('SELECT * FROM billing_accounts WHERE user_id=?').get(userId) as Acc | undefined; }
  private byKey(userId: string, key: string) { return this.db.prepare('SELECT * FROM billing_ledger WHERE user_id=? AND idem_key=?').get(userId, key) as LedgerRow | undefined; }
  /** Appends one ledger row and moves the balance. Must run inside tx(); the CHECK constraints refuse a negative balance. */
  private post(userId: string, kind: LedgerRow['kind'], amount: number, reason: string, o: { feature?: string; itemId?: string; idem?: string } = {}): LedgerEntry {
    const delta = kind === 'spend' ? -amount : amount, id = randomUUID(), at = new Date(this.now()).toISOString();
    const bal = (this.db.prepare('SELECT balance FROM billing_accounts WHERE user_id=?').get(userId) as { balance: number }).balance + delta;
    if (bal < 0) throw new Error('INSUFFICIENT_CREDITS');
    this.db.prepare('UPDATE billing_accounts SET balance=? WHERE user_id=?').run(bal, userId);
    this.db.prepare('INSERT INTO billing_ledger(id,user_id,kind,amount,delta,reason,feature,item_id,idem_key,balance_after,created) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id, userId, kind, amount, delta, reason, o.feature ?? null, o.itemId ?? null, o.idem ? `${kind}:${o.idem}` : null, bal, at);
    return { id, kind, amount, delta, reason, feature: o.feature ?? null, itemId: o.itemId ?? null, balanceAfter: bal, createdAt: at };
  }
  /** Creates the account (14-day trial + trial credits) on first use and applies due monthly grants or plan lapse. */
  private ensure(userId: string): Acc {
    return this.tx(() => {
      const t = this.now();
      let a = this.row(userId);
      if (!a) {
        this.db.prepare('INSERT INTO billing_accounts(user_id,plan,period,trial_start,trial_end,period_start,period_end,next_grant_at,balance) VALUES (?,?,?,?,?,?,?,?,0)').run(userId, 'free', 'monthly', t, t + TRIAL_DAYS * DAY, t, t + PERIOD_DAYS * DAY, t + PERIOD_DAYS * DAY);
        this.post(userId, 'grant', TRIAL_CREDITS, '체험 기간 시작 지급', { idem: 'trial' });
        return this.row(userId)!;
      }
      if (a.plan !== 'free' && t >= a.period_end) { // no recurring charge in this build: an unrenewed paid plan lapses to free
        this.db.prepare("UPDATE billing_accounts SET plan='free',period='monthly',period_start=?,period_end=?,next_grant_at=?,pending_plan=NULL,pending_period=NULL WHERE user_id=?").run(t, t + PERIOD_DAYS * DAY, t + PERIOD_DAYS * DAY, userId);
        a = this.row(userId)!;
      }
      if (a.plan === 'free' && t >= a.next_grant_at) {
        this.post(userId, 'grant', PLANS.free.credits, '무료 플랜 월간 지급', { idem: `monthly:free:${a.next_grant_at}` });
        this.db.prepare('UPDATE billing_accounts SET next_grant_at=? WHERE user_id=?').run(t + PERIOD_DAYS * DAY, userId);
      } else if (a.plan !== 'free') {
        let next = a.next_grant_at, n = 0;
        while (t >= next && next < a.period_end && n++ < 12) { this.post(userId, 'grant', PLANS[a.plan].credits, `${PLANS[a.plan].label} 플랜 월간 지급`, { idem: `monthly:${a.plan}:${next}` }); next += PERIOD_DAYS * DAY; }
        if (next !== a.next_grant_at) this.db.prepare('UPDATE billing_accounts SET next_grant_at=? WHERE user_id=?').run(next, userId);
      }
      return this.row(userId)!;
    });
  }
  /** F101: plan, trial, balance, and today's usage against the local limit. */
  account(userId: string) {
    const a = this.ensure(userId), t = this.now(), since = new Date(t - DAY).toISOString();
    let runs = 0; try { runs = Number((this.db.prepare("SELECT COUNT(*) as n FROM work_items WHERE user_id=? AND kind='run' AND created>=?").get(userId, since) as { n: number }).n); } catch { /* work_items missing outside CoraStore */ }
    const net = Number((this.db.prepare("SELECT COALESCE(SUM(CASE kind WHEN 'spend' THEN amount WHEN 'refund' THEN -amount ELSE 0 END),0) as n FROM billing_ledger WHERE user_id=? AND created>=?").get(userId, since) as { n: number }).n);
    return {
      plan: a.plan, planLabel: PLANS[a.plan].label, period: a.period, periodEnd: a.plan === 'free' ? null : new Date(a.period_end).toISOString(),
      trialStart: new Date(a.trial_start).toISOString(), trialEnd: new Date(a.trial_end).toISOString(), trialActive: t < a.trial_end, trialDaysLeft: Math.max(0, Math.ceil((a.trial_end - t) / DAY)),
      balance: a.balance, usage: { runs24h: runs, runLimit: LOCAL_RUN_LIMIT, runsLeft: Math.max(0, LOCAL_RUN_LIMIT - runs), creditsSpent24h: net },
      pending: a.pending_plan ? { plan: a.pending_plan, period: a.pending_period, effectiveAt: new Date(a.period_end).toISOString(), note: '기간이 끝나면 무료 플랜으로 바뀝니다. 낮은 유료 플랜은 그때 새로 결제해 시작합니다.' } : null,
    };
  }
  /** F104: price table for this workspace owner (defaults from code, overrides from billing_prices). */
  prices(userId: string) {
    const o = new Map((this.db.prepare('SELECT feature,credits FROM billing_prices WHERE user_id=?').all(userId) as { feature: string; credits: number }[]).map(r => [r.feature, r.credits]));
    return (Object.keys(FEATURES) as Feature[]).map(f => ({ feature: f, label: FEATURES[f].label, credits: o.get(f) ?? FEATURES[f].credits, default: FEATURES[f].credits, overridden: o.has(f) }));
  }
  quote(userId: string, feature: string): number {
    if (!isFeature(feature)) throw new Error('알 수 없는 기능입니다.');
    const r = this.db.prepare('SELECT credits FROM billing_prices WHERE user_id=? AND feature=?').get(userId, feature) as { credits: number } | undefined;
    return r ? r.credits : FEATURES[feature].credits;
  }
  /** Admin action (the route checks the admin email). credits=null removes the override. */
  setPrice(userId: string, feature: string, credits: number | null) {
    if (!isFeature(feature)) throw new Error('알 수 없는 기능입니다.');
    if (credits === null) this.db.prepare('DELETE FROM billing_prices WHERE user_id=? AND feature=?').run(userId, feature);
    else {
      if (!Number.isInteger(credits) || credits < 0 || credits > 1000) throw new Error('크레딧 단가는 0~1,000의 정수입니다.');
      this.db.prepare('INSERT INTO billing_prices(user_id,feature,credits,updated) VALUES (?,?,?,?) ON CONFLICT(user_id,feature) DO UPDATE SET credits=excluded.credits,updated=excluded.updated').run(userId, feature, credits, new Date(this.now()).toISOString());
    }
    return this.prices(userId);
  }
  grant(userId: string, amount: number, reason: string, o: { feature?: string; itemId?: string; idempotencyKey?: string } = {}) {
    if (!Number.isInteger(amount) || amount < 1 || amount > 1_000_000) throw new Error('지급 크레딧은 1 이상의 정수여야 합니다.');
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 200) throw new Error('지급 사유를 1~200자로 적어 주세요.');
    const key = o.idempotencyKey === undefined ? undefined : cleanKey(o.idempotencyKey);
    return this.tx(() => {
      this.ensure(userId);
      if (key) { const prior = this.byKey(userId, `grant:${key}`); if (prior) return { replay: true, entry: entry(prior) }; }
      return { replay: false, entry: this.post(userId, 'grant', amount, reason.trim(), { feature: o.feature, itemId: o.itemId, idem: key }) };
    });
  }
  /** F103/F105: atomic and idempotent. A repeated key returns the first ledger row and charges nothing. */
  spend(userId: string, feature: string, idempotencyKey: string, itemId?: string): SpendResult {
    if (!isFeature(feature)) throw new Error('알 수 없는 기능입니다.');
    const key = cleanKey(idempotencyKey);
    return this.tx(() => {
      const a = this.ensure(userId), prior = this.byKey(userId, `spend:${key}`);
      if (prior) { if (prior.feature !== feature) throw new Error('같은 중복 방지 키가 다른 기능에 이미 쓰였습니다.'); return { ok: true, replay: true, entry: entry(prior), balance: a.balance }; }
      const needed = this.quote(userId, feature);
      if (needed > a.balance) return { ok: false, code: 'INSUFFICIENT_CREDITS', needed, balance: a.balance };
      const e = this.post(userId, 'spend', needed, `${FEATURES[feature].label} 사용`, { feature, itemId, idem: key });
      return { ok: true, replay: false, entry: e, balance: e.balanceAfter };
    });
  }
  /** Returns the credits of one earlier spend, once. Refers to the spend by its idempotency key. */
  refund(userId: string, spendKey: string, reason: string) {
    const key = cleanKey(spendKey);
    return this.tx(() => {
      this.ensure(userId);
      const spent = this.byKey(userId, `spend:${key}`);
      if (!spent) throw new Error('환불할 사용 기록을 찾을 수 없습니다.');
      const prior = this.byKey(userId, `refund:${key}`);
      if (prior) return { replay: true, entry: entry(prior) };
      return { replay: false, entry: this.post(userId, 'refund', spent.amount, String(reason || '사용 취소 환불').slice(0, 200), { feature: spent.feature ?? undefined, itemId: spent.item_id ?? undefined, idem: key }) };
    });
  }
  history(userId: string, limit = 50) {
    this.ensure(userId);
    return (this.db.prepare('SELECT * FROM billing_ledger WHERE user_id=? ORDER BY seq DESC LIMIT ?').all(userId, Math.min(Math.max(1, limit | 0), 500)) as LedgerRow[]).map(entry);
  }
  private orderView(r: OrderRow): Order { return { orderId: r.id, kind: r.kind, ref: r.ref, label: r.label, amount: r.amount, status: r.status, note: r.note, code: r.code, message: r.message, createdAt: r.created }; }
  order(userId: string, orderId: string) { const r = this.db.prepare('SELECT * FROM billing_orders WHERE id=? AND user_id=?').get(String(orderId), userId) as OrderRow | undefined; return r ? this.orderView(r) : null; }
  orders(userId: string, limit = 20) { return (this.db.prepare('SELECT * FROM billing_orders WHERE user_id=? ORDER BY created DESC, rowid DESC LIMIT ?').all(userId, limit) as OrderRow[]).map(r => this.orderView(r)); }
  /** ref: 'starter:monthly' | 'pro:yearly' for plans, '500' | '1500' | '5000' for packs. The amount is always computed here, never taken from the client. */
  createOrder(userId: string, kind: 'plan' | 'pack', ref: string): Order {
    return this.tx(() => {
      const a = this.ensure(userId), t = this.now();
      let label: string, amount: number, note: string;
      if (kind === 'pack') {
        const p = PACKS.find(x => String(x.credits) === String(ref)); if (!p) throw new Error('알 수 없는 추가 크레딧 상품입니다.');
        label = `추가 크레딧 ${p.credits.toLocaleString('ko-KR')}개`; amount = p.price; note = '결제가 승인되면 크레딧이 바로 지급됩니다. 사용하지 않은 크레딧은 만료되지 않습니다.';
      } else if (kind === 'plan') {
        const [plan, period] = String(ref).split(':') as [Plan, Period];
        if (!(plan in PLANS) || plan === 'free' || (period !== 'monthly' && period !== 'yearly')) throw new Error('알 수 없는 플랜입니다.');
        const price = PLANS[plan][period]; label = `${PLANS[plan].label} 플랜 ${period === 'yearly' ? '연' : '월'} 결제`; amount = price;
        note = `결제 승인 즉시 적용되며 월 ${PLANS[plan].credits.toLocaleString('ko-KR')}크레딧이 지급됩니다.`;
        if (a.plan !== 'free' && t < a.period_end && (PLANS[plan].rank > PLANS[a.plan].rank || a.plan === plan)) {
          const credit = Math.floor(PLANS[a.plan][a.period] * (a.period_end - t) / Math.max(1, a.period_end - a.period_start));
          amount = Math.max(100, price - credit); note += ` 현재 ${PLANS[a.plan].label} 플랜의 남은 기간 ${won(credit)}을 차감했습니다(일할 계산, 확인 필요).`;
        }
      } else throw new Error('주문 종류는 plan 또는 pack입니다.');
      const id = `cora-${randomUUID()}`;
      this.db.prepare('INSERT INTO billing_orders(id,user_id,kind,ref,label,amount,status,note,created) VALUES (?,?,?,?,?,?,?,?,?)').run(id, userId, kind, String(ref), label, amount, 'created', note, new Date(t).toISOString());
      return this.order(userId, id)!;
    });
  }
  /** Upgrade -> order (applies on payment). Downgrade -> scheduled for period end. Same plan -> clears a scheduled change. */
  changePlan(userId: string, plan: string, period: string) {
    if (!(plan in PLANS) || (period !== 'monthly' && period !== 'yearly')) throw new Error('플랜과 결제 주기를 확인해 주세요.');
    return this.tx(() => {
      const a = this.ensure(userId), target = plan as Plan;
      const upgrade = PLANS[target].rank > PLANS[a.plan].rank || (target === a.plan && target !== 'free' && a.period === 'monthly' && period === 'yearly');
      if (upgrade) return { action: 'order' as const, order: this.createOrder(userId, 'plan', `${target}:${period}`) };
      if (target === a.plan && (target === 'free' || period === a.period)) { this.db.prepare('UPDATE billing_accounts SET pending_plan=NULL,pending_period=NULL WHERE user_id=?').run(userId); return { action: 'noop' as const, account: this.account(userId) }; }
      this.db.prepare('UPDATE billing_accounts SET pending_plan=?,pending_period=? WHERE user_id=?').run(target, period, userId);
      return { action: 'scheduled' as const, effectiveAt: new Date(a.period_end).toISOString(), account: this.account(userId) };
    });
  }
  /** Idempotent. Only a 'paid' observation grants credits or changes the plan; a paid amount that differs from the order is refused. */
  completeOrder(userId: string, orderId: string, obs: PaymentObservation) {
    return this.tx(() => {
      const o = this.db.prepare('SELECT * FROM billing_orders WHERE id=? AND user_id=?').get(String(orderId), userId) as OrderRow | undefined;
      if (!o) throw new Error('NOT_FOUND');
      if (o.status === 'paid' || (o.status === 'failed' && obs.status !== 'paid')) return { order: this.orderView(o), replay: true };
      const at = new Date(this.now()).toISOString();
      if (obs.status !== 'paid') {
        const st = obs.status === 'failed' ? 'failed' : 'unknown';
        this.db.prepare('UPDATE billing_orders SET status=?,code=?,message=?,completed=? WHERE id=?').run(st, obs.code ?? null, obs.message ?? null, st === 'failed' ? at : null, o.id);
        return { order: this.order(userId, o.id)!, replay: false };
      }
      if (obs.amount !== undefined && obs.amount !== o.amount) throw new Error('결제 금액이 주문 금액과 다릅니다. 지급하지 않았습니다.');
      this.ensure(userId); const t = this.now();
      if (o.kind === 'pack') this.post(userId, 'grant', Number(o.ref), `추가 크레딧 ${o.ref}개 구매`, { idem: `order:${o.id}` });
      else {
        const [plan, period] = o.ref.split(':') as [Plan, Period], end = t + (period === 'yearly' ? 365 : PERIOD_DAYS) * DAY;
        this.db.prepare('UPDATE billing_accounts SET plan=?,period=?,period_start=?,period_end=?,next_grant_at=?,pending_plan=NULL,pending_period=NULL WHERE user_id=?').run(plan, period, t, end, t + PERIOD_DAYS * DAY, userId);
        this.post(userId, 'grant', PLANS[plan].credits, `${PLANS[plan].label} 플랜 결제 첫 달 지급`, { idem: `order:${o.id}` });
      }
      this.db.prepare("UPDATE billing_orders SET status='paid',payment_key=?,code=NULL,message=NULL,completed=? WHERE id=?").run(obs.paymentKey ?? null, at, o.id);
      return { order: this.order(userId, o.id)!, replay: false };
    });
  }
}
/** Shared instance per connection: billing().spend(user.id, 'card_ai', key, itemId). */
export const billing = (s: CoraStore = store()) => s.module('billing', db => new BillingStore(db));
