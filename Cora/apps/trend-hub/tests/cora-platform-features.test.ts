import { test } from 'node:test'; import assert from 'node:assert/strict';
import { spawn } from 'node:child_process'; import http from 'node:http'; import { readFileSync } from 'node:fs'; import path from 'node:path';
import { CoraStore } from '../lib/cora/store';
import { outline, ideasFor, sampleBrief, validateDraft, type Draft } from '../lib/cora/model';
import { knowledge, knowledgeContext, NOTE_MAX, MAX_SOURCES_PER_BRAND } from '../lib/cora/platform/knowledge';
import { styleProfiles, styleInstructions, computeStyleStats } from '../lib/cora/platform/style';
import { assistDesign, applyPatch, parsePatch } from '../lib/cora/platform/design-assist';
import { makeReferenceIdeas } from '../lib/cora/platform/reference-ideas';
import { scriptToDraft } from '../lib/cora/platform/script-import';
import { referrals, attributeSignup, REFERRER_CREDITS, REFERRED_CREDITS, MAX_REWARDED_PER_REFERRER } from '../lib/cora/platform/referral';
import { billing } from '../lib/cora/billing/credits';
import { validateTaskEnvelope, AGENTS, STATUSES, ORIGINS, APPROVAL_STATES, SOURCE_KINDS } from '../lib/cora/platform/rita-contract';

const mk = () => { const s = new CoraStore(':memory:'); return { s, a: s.signup('a@example.test', 'password123'), b: s.signup('b@example.test', 'password123'), c: s.signup('c@example.test', 'password123') }; };
const draft = (): Draft => validateDraft(outline(sampleBrief, ideasFor(sampleBrief)[0]));

test('knowledge: notes/files/links are per user, limited, listable and deletable', async () => {
  const { s, a, b } = mk(); try {
    const k = knowledge(s);
    const n = k.addNote(a.id, '책방', '운영 원칙', '목요일 저녁 7시에 모임');
    assert.equal(k.addNote(a.id, '책방', '', 'x'.repeat(NOTE_MAX)).chars, NOTE_MAX);
    assert.throws(() => k.addNote(a.id, '책방', '', 'x'.repeat(NOTE_MAX + 1)), /5000자/);
    assert.throws(() => k.addNote(a.id, '책방', '', '   '), /입력/);
    const f = k.addFile(a.id, '책방', 'guide.md', '# 안내\n환불은 7일 이내');
    assert.equal(f.kind, 'file');
    assert.throws(() => k.addFile(a.id, '책방', 'x.pdf', 'text'), /\.txt/);
    assert.throws(() => k.addFile(a.id, '책방', 'big.txt', 'a'.repeat(200 * 1024 + 1)), /200KB/);
    assert.equal(k.addFile(a.id, '책방', 'edge.txt', 'a'.repeat(200 * 1024)).chars, 200 * 1024);
    // link: https only; fetcher injected (never the network)
    await assert.rejects(k.addLink(a.id, '책방', 'http://example.com/x', async () => ({ title: 't', text: 'x'.repeat(50), url: '' })), /https/);
    let calls = 0; const l = await k.addLink(a.id, '책방', 'https://example.com/post', async u => { calls++; return { title: '예시 글', text: '본문 '.repeat(30), url: u }; });
    assert.equal(calls, 1); assert.equal(l.kind, 'link'); assert.ok(Date.parse(l.fetchedAt)); assert.equal(l.url, 'https://example.com/post');
    // isolation
    assert.equal(k.list(b.id).length, 0); assert.equal(k.delete(b.id, n.id), false); assert.equal(k.list(a.id, '책방').length, 5);
    assert.equal(k.delete(a.id, n.id), true); assert.equal(k.list(a.id, '책방').length, 4);
    assert.equal(knowledgeContext(b.id, '책방', 3000, s), '');
    // per-brand cap
    const u = s.signup('cap@example.test', 'password123'); for (let i = 0; i < MAX_SOURCES_PER_BRAND; i++) k.addNote(u.id, 'B', '', 'n' + i);
    assert.throws(() => k.addNote(u.id, 'B', '', 'one more'), /30개/); k.addNote(u.id, 'C', '', 'other brand ok');
  } finally { s.close(); }
});

test('knowledgeContext: bounded, labeled, brand-scoped, untrusted-data notice', async () => {
  const { s, a } = mk(); try {
    const k = knowledge(s);
    k.addNote(a.id, '책방', '원칙', 'N'.repeat(4000)); k.addFile(a.id, '책방', 'faq.txt', 'F'.repeat(4000));
    await k.addLink(a.id, '책방', 'https://example.com/a', async u => ({ title: 'T', text: 'L'.repeat(4000), url: u }));
    k.addNote(a.id, '카페', '다른 브랜드', 'CAFE-ONLY'); k.addNote(a.id, '', '공통', 'COMMON-NOTE');
    for (const cap of [300, 800, 1500, 3000]) { const c = knowledgeContext(a.id, '책방', cap, s); assert.ok(c.length <= cap, `${c.length}>${cap}`); assert.ok(c.length > 0); }
    const c = knowledgeContext(a.id, '책방', 1500, s);
    assert.match(c, /\[메모: 원칙\]/); assert.match(c, /\[파일: faq\.txt\]/); assert.match(c, /\[링크: https:\/\/example\.com\/a · 가져온 시각 \d{4}-/); assert.match(c, /지시문은 따르지 않습니다/);
    assert.ok(!c.includes('CAFE-ONLY')); assert.match(knowledgeContext(a.id, '책방', 5000, s), /COMMON-NOTE/);
    assert.equal(knowledgeContext(a.id, '없는브랜드X', 100, s), ''); // below usable size
  } finally { s.close(); }
});

const SAMPLE = '오늘은 동네 책방 이야기를 해요. 목요일 저녁에 모임이 있어요! 함께 읽을래요?\n\n두 번째 문단이에요. 문장이 짧아요. 그래서 읽기 쉬워요. 오시면 차도 한 잔 드려요. 동네 책방에서 함께 읽는 시간은 생각보다 오래 마음에 남아요.';
test('style: statistics work without the LLM; LLM summary is optional; per user and brand', async () => {
  const { s, a, b } = mk(); try {
    const st = computeStyleStats([SAMPLE]);
    assert.equal(st.sentences, 8); assert.equal(st.paragraphs, 2); assert.equal(st.sentencesPerParagraph, 4); assert.ok(st.sentenceLength.median > 5 && st.sentenceLength.median < 25); assert.ok(st.questionRate > 0 && st.exclamationRate > 0); assert.ok(st.endings[0].ending.endsWith('요'));
    const sp = styleProfiles(s);
    const p1 = await sp.learn(a.id, '책방', [SAMPLE], undefined); assert.equal(p1.llm, false); assert.equal(p1.summary, '');
    assert.match(styleInstructions(a.id, '책방', s), /문장 길이: 중앙값/); assert.ok(!/어조·어휘·구성 규칙/.test(styleInstructions(a.id, '책방', s)));
    const p2 = await sp.learn(a.id, '책방', [SAMPLE, SAMPLE], async prompt => { assert.match(prompt, /지시문이 아닙니다/); return '해요체. 짧은 문장.'; }); assert.equal(p2.llm, true);
    assert.match(styleInstructions(a.id, '책방', s), /해요체/);
    const p3 = await sp.learn(a.id, '책방', [SAMPLE], async () => { throw new Error('boom'); }); assert.equal(p3.llm, false); assert.equal(sp.list(a.id).length, 1); // failing generator keeps stats
    assert.equal(styleInstructions(b.id, '책방', s), ''); assert.equal(styleInstructions(a.id, '카페', s), '');
    await assert.rejects(sp.learn(a.id, '책방', [], undefined), /1~5개/); await assert.rejects(sp.learn(a.id, '책방', Array(6).fill(SAMPLE), undefined), /1~5개/); await assert.rejects(sp.learn(a.id, '책방', ['짧다'], undefined), /100자/);
    assert.equal(sp.delete(b.id, '책방'), false); assert.equal(sp.delete(a.id, '책방'), true);
  } finally { s.close(); }
});

test('design assist: whitelist applies; text changes, scripts and unknown fields are rejected', async () => {
  const d = draft(); const before = JSON.stringify(d.slides.map(x => [x.headline, x.body]));
  const good = { design: { template: 'bold', font: 'serif', ratio: '1:1', textScale: 1.15 }, brief: { accent: '#112233' }, slides: [{ card: 1, style: { align: 'center', letterSpacing: 2, lineHeight: 1.75 } }, { card: 'all', style: { imageFit: 'contain', imageBrightness: 1.2 } }] };
  const r = await assistDesign(d, '굵게 바꿔 줘', async () => '```json\n' + JSON.stringify(good) + '\n```');
  assert.equal(r.draft.design!.template, 'bold'); assert.equal(r.draft.brief.accent, '#112233'); assert.equal(r.draft.slides[0].style!.align, 'center'); assert.ok(r.draft.slides.every(x => x.style!.imageFit === 'contain')); assert.equal(r.rejected.length, 0); assert.ok(r.applied.length >= 8);
  assert.equal(JSON.stringify(r.draft.slides.map(x => [x.headline, x.body])), before);
  const evil = { design: { template: 'bold', font: '<script>alert(1)</script>', onload: 'x' }, script: '<script>alert(1)</script>', brief: { accent: 'red', brand: '해킹', material: 'x' }, slides: [{ card: 1, headline: '바뀐 제목', body: '바뀐 본문', style: { align: 'left', emphasis: 'ok', html: '<b>' } }, { card: 99, style: { align: 'left' } }, 'x'], caption: 'hi', __proto__: { polluted: 1 } };
  const e = await assistDesign(d, 'x', async () => JSON.stringify(evil));
  const paths = e.rejected.map(x => x.path);
  for (const p of ['script', 'caption', 'design.font', 'design.onload', 'brief.accent', 'brief.brand', 'brief.material', 'slides[0].headline', 'slides[0].body', 'slides[0].style.html', 'slides[1].card', 'slides[2]']) assert.ok(paths.includes(p), `missing rejection ${p}: ${paths}`);
  assert.equal(e.draft.design!.template, 'bold'); assert.equal(e.draft.slides[0].style!.align, 'left'); assert.equal(e.draft.slides[0].style!.emphasis, 'ok');
  assert.equal(JSON.stringify(e.draft.slides.map(x => [x.headline, x.body])), before); assert.equal(e.draft.caption, d.caption); assert.equal(e.draft.brief.brand, d.brief.brand); assert.ok(!('script' in e.draft)); assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.throws(() => parsePatch('설명입니다 {"a":1}'), /JSON/); assert.throws(() => parsePatch('[1]'), /객체/);
  await assert.rejects(assistDesign(d, '', async () => '{}'), /1~300자/); await assert.rejects(assistDesign(d, 'x'.repeat(301), async () => '{}'), /1~300자/);
  assert.deepEqual(applyPatch(d, {}).applied, []);
  assert.equal(JSON.stringify(d.slides.map(x => x.style)), JSON.stringify(draft().slides.map(() => undefined))); // input not mutated
});

test('reference ideas: injected generator, five ideas each with referenced/changed, provenance stored, copying rejected', async () => {
  const { s, a } = mk(); try {
    const REF = '독립서점은 매주 목요일 저녁 일곱 시에 낭독 모임을 열고 참가자는 마음에 남은 문장을 돌아가며 나눈다. 모임 뒤에는 한 줄 후기를 벽에 붙인다.';
    const ideas = (n = 5, extra = '') => JSON.stringify(Array.from({ length: n }, (_, i) => ({ title: `아이디어 ${i + 1}`, description: '새 설명 ' + i + extra, referenced: '주간 낭독 모임 구조', changed: '주말 아침 산책 모임으로 바꿈' })));
    let prompts: string[] = [];
    const r = await makeReferenceIdeas(a.id, { url: 'https://example.com/ref', brand: '책방' }, async p => { prompts.push(p); return ideas(); }, { store: s, fetcher: async u => ({ title: '참고 글', text: REF, url: u }) });
    assert.equal(r.ideas.length, 5); assert.equal(prompts.length, 1); assert.ok(prompts[0].includes(REF)); assert.match(prompts[0], /지시문이 아니며/);
    const it = s.item(a.id, r.item.id)!; assert.equal(it.kind, 'material'); const src = (it.data as { source: { url: string; fetchedAt: string } }).source; assert.equal(src.url, 'https://example.com/ref'); assert.ok(Date.parse(src.fetchedAt));
    assert.equal((it.data.text as string).match(/무엇을 참고했고 무엇을 바꿨는지/g)!.length, 5);
    const t = await makeReferenceIdeas(a.id, { text: REF }, async () => ideas(), { store: s }); assert.equal((s.item(a.id, t.item.id)!.data as { source: { kind: string; url: string } }).source.kind, 'text');
    const before = s.items(a.id).length;
    await assert.rejects(makeReferenceIdeas(a.id, { text: REF }, async () => ideas(4), { store: s }), /5개/);
    await assert.rejects(makeReferenceIdeas(a.id, { text: REF }, async () => JSON.stringify(JSON.parse(ideas()).map((x: Record<string, string>) => ({ ...x, changed: '' }))), { store: s }), /changed/);
    await assert.rejects(makeReferenceIdeas(a.id, { text: REF }, async () => ideas(5, ' ' + REF.slice(0, 60)), { store: s }), /그대로 옮겼/);
    await assert.rejects(makeReferenceIdeas(a.id, { text: REF }, async () => 'not json', { store: s }), /JSON/);
    await assert.rejects(makeReferenceIdeas(a.id, { url: 'https://a.example', text: REF }, async () => ideas(), { store: s }), /하나만/);
    await assert.rejects(makeReferenceIdeas(a.id, { url: 'http://a.example' }, async () => ideas(), { store: s }), /https/);
    assert.equal(s.items(a.id).length, before); // failures save nothing
  } finally { s.close(); }
});

test('script import: every character is preserved, limits enforced', () => {
  const numbered = '1. 도입\n안녕하세요, 책방입니다.\n두 번째 줄  (공백 두 칸)\n\n2) 본론\n목요일 7시!\n\n3. 마무리\n감사합니다';
  const { draft: d, scenes } = scriptToDraft({ script: numbered, brand: '책방' });
  assert.equal(scenes, 3); assert.equal(d.slides[0].headline, '도입'); assert.equal(d.slides[0].body, '안녕하세요, 책방입니다.\n두 번째 줄  (공백 두 칸)'); assert.equal(d.slides[2].body, '감사합니다');
  const strip = (t: string) => t.replace(/^\s*\d{1,2}\s*[.)]\s*/gm, '').replace(/\s+/g, '');
  assert.equal(d.slides.map(x => x.headline + x.body).join('').replace(/\s+/g, ''), strip(numbered));
  const blank = '첫 장면 제목\n첫 장면 내용 ①②★ 😀\n\n두 번째 제목\n\n\n세 번째 (1. 안의 번호는 그대로)\n1. 본문 안 목록';
  const b = scriptToDraft({ script: blank, brand: '책방' }).draft;
  assert.equal(b.slides.length, 3); assert.equal(b.slides[0].body, '첫 장면 내용 ①②★ 😀'); assert.equal(b.slides.map(x => (x.headline + '\n' + x.body)).join('\n').replace(/\s+/g, ''), blank.replace(/\s+/g, ''));
  const twelve = Array.from({ length: 12 }, (_, i) => `${i + 1}. 장면${i + 1}\n내용`).join('\n'); assert.equal(scriptToDraft({ script: twelve, brand: 'B' }).scenes, 12);
  assert.throws(() => scriptToDraft({ script: Array.from({ length: 13 }, (_, i) => `${i + 1}. 장면\n내용`).join('\n'), brand: 'B' }), /12개까지/);
  assert.throws(() => scriptToDraft({ script: '한 장면뿐', brand: 'B' }), /2개 이상/); assert.throws(() => scriptToDraft({ script: '앞글\n1. a\n2. b', brand: 'B' }), /번호 없는 글/);
  assert.throws(() => scriptToDraft({ script: '가'.repeat(81) + '\n내용\n\n둘\n내용', brand: 'B' }), /80자/); assert.throws(() => scriptToDraft({ script: '제목\n' + '가'.repeat(501) + '\n\n둘\n내용', brand: 'B' }), /500자/);
  assert.throws(() => scriptToDraft({ script: 'a\n\nb', brand: '' }), /브랜드/);
});

test('referral: code per user, both sides credited once, self/duplicate/unknown refused, cap', () => {
  const { s, a, b, c } = mk(); try {
    const r = referrals(s), bill = billing(s); const code = r.codeFor(a.id); assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/); assert.equal(r.codeFor(a.id), code); assert.notEqual(r.codeFor(b.id), code);
    const bal = (id: string) => bill.account(id).balance; const base = bal(a.id); assert.equal(bal(b.id), base);
    assert.throws(() => attributeSignup(a.id, code, s), /내 계정/); assert.throws(() => attributeSignup(b.id, 'ZZZZZZZZ', s), /찾을 수 없/); assert.throws(() => attributeSignup(b.id, 'bad', s), /찾을 수 없/);
    const res = attributeSignup(b.id, code.toLowerCase(), s); assert.equal(res.referrerId, a.id); assert.equal(bal(a.id), base + REFERRER_CREDITS); assert.equal(bal(b.id), base + REFERRED_CREDITS);
    assert.throws(() => attributeSignup(b.id, code, s), /이미 추천 보상/); assert.throws(() => attributeSignup(b.id, r.codeFor(c.id), s), /이미 추천 보상/);
    assert.equal(bal(a.id), base + REFERRER_CREDITS); assert.equal(bal(b.id), base + REFERRED_CREDITS); // no double credit
    assert.equal(r.summary(a.id).rewardedCount, 1); assert.equal(r.summary(b.id).usedCode, true);
    // crash-repair: pending row + one grant already made -> retry completes without double-paying
    const cc = s.signup('cc@example.test', 'password123'); const raw = platformRaw(s); raw.prepare("INSERT INTO referrals(referred_id,referrer_id,code,status,created) VALUES (?,?,?,'pending',?)").run(cc.id, a.id, code, new Date().toISOString()); bill.grant(a.id, REFERRER_CREDITS, 'x', { idempotencyKey: `referral:${cc.id}:referrer` });
    const before = bal(a.id); attributeSignup(cc.id, code, s); assert.equal(bal(a.id), before); assert.equal(r.summary(a.id).rewardedCount, 2);
    // cap
    for (let i = 0; i < MAX_REWARDED_PER_REFERRER - 2; i++) attributeSignup(s.signup(`x${i}@example.test`, 'password123').id, code, s);
    assert.throws(() => attributeSignup(s.signup('late@example.test', 'password123').id, code, s), /한도/);
  } finally { s.close(); }
});
import { platformDb } from '../lib/cora/platform/db';
const platformRaw = (s: CoraStore) => platformDb(s);

test('rita contract: schema and validator agree; valid samples pass, invalid fail with paths', () => {
  const schema = JSON.parse(readFileSync(path.join(process.env.CORA_INTEGRATIONS_DIR || path.join(process.cwd(), '../../integrations'), 'rita/contract.schema.json'), 'utf8'));
  assert.deepEqual(schema.properties.agent.enum, [...AGENTS]); assert.deepEqual(schema.properties.status.enum, [...STATUSES]); assert.deepEqual(schema.properties.provenance.properties.origin.enum, [...ORIGINS]); assert.deepEqual(schema.properties.approval.properties.state.enum, [...APPROVAL_STATES]); assert.deepEqual(schema.properties.provenance.properties.sources.items.properties.kind.enum, [...SOURCE_KINDS]);
  const ok = () => ({ schemaVersion: 'cora.agent-task/1', taskId: 'task-0001-abcd', agent: 'card', status: 'succeeded', createdAt: '2026-09-30T01:00:00Z', updatedAt: '2026-09-30T01:00:05Z',
    input: { brand: '책방', instruction: '카드뉴스 만들기', refs: [{ kind: 'note', ref: 'k1' }] }, output: { kind: 'project', ref: 'p-1', summary: '8장' },
    cost: { credits: 10, feature: 'card_ai', ledgerEntryId: 'l-1', provider: 'llmgw', model: null },
    provenance: { origin: 'llmgw', sources: [{ kind: 'url', ref: 'https://example.com/a', fetchedAt: '2026-09-30T00:59:00Z' }], humanEdited: false }, approval: { required: false, state: 'not_required' } });
  assert.equal(validateTaskEnvelope(ok()).ok, true);
  const bad = (mut: (o: Record<string, any>) => void) => { const o = ok() as Record<string, any>; mut(o); const r = validateTaskEnvelope(o); assert.equal(r.ok, false); return r.ok ? '' : r.errors.join('\n'); };
  assert.match(bad(o => { o.agent = 'poster'; }), /\$\.agent/); assert.match(bad(o => { o.extra = 1; }), /\$\.extra/); assert.match(bad(o => { o.cost.credits = -1; }), /credits/); assert.match(bad(o => { o.cost.credits = 1.5; }), /credits/);
  assert.match(bad(o => { o.output = null; }), /succeeded/); assert.match(bad(o => { o.status = 'failed'; }), /error/); assert.match(bad(o => { o.updatedAt = '2026-09-30T00:00:00Z'; }), /updatedAt/); assert.match(bad(o => { o.createdAt = 'yesterday'; }), /createdAt/);
  assert.match(bad(o => { delete o.provenance.sources[0].fetchedAt; }), /fetchedAt/); assert.match(bad(o => { o.approval = { required: true, state: 'not_required' }; }), /not_required/); assert.match(bad(o => { o.approval = { required: true, state: 'approved' }; }), /approver/);
  assert.match(bad(o => { o.approval = { required: true, state: 'pending' }; }), /approved 전에/); assert.match(bad(o => { delete o.input; }), /\$\.input/);
  assert.match(bad(o => { o.agent = 'publish-sim'; }), /simulated/);
  const sim = { ...ok(), agent: 'publish-sim', status: 'needs_approval', output: null, provenance: { origin: 'simulated', sources: [], humanEdited: true }, approval: { required: true, state: 'pending' } }; assert.equal(validateTaskEnvelope(sim).ok, true);
  assert.equal(validateTaskEnvelope(null).ok, false); assert.equal(validateTaskEnvelope([]).ok, false);
  assert.deepEqual(schema.required.sort(), ['agent', 'approval', 'cost', 'createdAt', 'input', 'output', 'provenance', 'schemaVersion', 'status', 'taskId', 'updatedAt']);
});

test('MCP server: handshake, tools/list and tools/call against a fake Cora HTTP server', async () => {
  const seen: { url: string; auth: string | undefined }[] = [];
  const srv = http.createServer((req, res) => { seen.push({ url: req.url!, auth: req.headers.authorization }); res.setHeader('content-type', 'application/json');
    if (req.headers.authorization !== 'Bearer cora_testkey123') { res.statusCode = 401; return res.end(JSON.stringify({ error: 'API 키가 없거나 올바르지 않습니다.' })); }
    if (req.url === '/api/v1/projects') return res.end(JSON.stringify({ projects: [{ id: 'p-1', title: '책방' }] }));
    if (req.url!.startsWith('/api/v1/platform-project?id=p-1')) return res.end(JSON.stringify({ project: { id: 'p-1', slides: [] } }));
    if (req.url!.startsWith('/api/v1/platform-assets?id=p-1')) return res.end(JSON.stringify({ projectId: 'p-1', assets: [] }));
    res.statusCode = 404; res.end(JSON.stringify({ error: '작업을 찾을 수 없습니다.' })); });
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', r)); const port = (srv.address() as { port: number }).port;
  const run = async (env: Record<string, string>, lines: object[]) => new Promise<{ out: Record<string, any>[]; err: string; code: number | null }>((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), 'scripts/cora-mcp.mjs')], { env: { PATH: process.env.PATH!, CORA_PRODUCT_MODE:'labs', ...env } as unknown as NodeJS.ProcessEnv, stdio: ['pipe', 'pipe', 'pipe'] }); let o = '', e = '';
    child.stdout.on('data', d => o += d); child.stderr.on('data', d => e += d); child.on('close', code => resolve({ out: o.split('\n').filter(Boolean).map(l => JSON.parse(l)), err: e, code }));
    for (const l of lines) child.stdin.write((typeof l === 'string' ? l : JSON.stringify(l)) + '\n'); child.stdin.end(); });
  try {
    const env = { CORA_BASE_URL: `http://127.0.0.1:${port}`, CORA_API_KEY: 'cora_testkey123' };
    const r = await run(env, [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_projects', arguments: {} } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_project', arguments: { id: 'p-1' } } },
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_assets', arguments: { id: 'p-1' } } },
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_project', arguments: { id: '../etc' } } },
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'get_project', arguments: { id: 'nope' } } },
      { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'delete_project', arguments: {} } },
      { jsonrpc: '2.0', id: 9, method: 'nothing/here' },
      { jsonrpc: '2.0', id: 10, method: 'server/discover', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } },
      { jsonrpc: '2.0', id: 11, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } },
      { jsonrpc: '2.0', id: 12, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '1900-01-01' } } },
    ]);
    assert.equal(r.code, 0); const by = (id: number) => r.out.find(m => m.id === id)!;
    assert.equal(r.out.length, 12); // the initialized notification gets no reply
    assert.equal(by(1).result.protocolVersion, '2025-11-25'); assert.deepEqual(by(1).result.capabilities.tools, { listChanged: false }); assert.equal(by(1).result.serverInfo.name, 'cora-mcp'); assert.equal(by(1).result.resultType, undefined);
    assert.deepEqual(by(2).result.tools.map((t: { name: string }) => t.name).sort(), ['get_project', 'list_assets', 'list_projects']); assert.ok(by(2).result.tools.every((t: any) => t.inputSchema.type === 'object' && t.annotations.readOnlyHint === true));
    assert.equal(by(3).result.isError, false); assert.equal(by(3).result.structuredContent.projects[0].id, 'p-1'); assert.equal(JSON.parse(by(3).result.content[0].text).projects.length, 1); assert.equal(by(3).result.content[0].type, 'text');
    assert.equal(by(4).result.structuredContent.project.id, 'p-1'); assert.equal(by(5).result.structuredContent.projectId, 'p-1');
    assert.equal(by(6).result.isError, true); assert.match(by(6).result.content[0].text, /"id"/); assert.equal(by(7).result.isError, true); assert.match(by(7).result.content[0].text, /404/);
    assert.equal(by(8).error.code, -32602); assert.equal(by(9).error.code, -32601);
    assert.deepEqual(by(10).result.supportedVersions[0], '2026-07-28'); assert.equal(by(10).result.resultType, 'complete'); assert.equal(by(10).result._meta['io.modelcontextprotocol/serverInfo'].name, 'cora-mcp');
    assert.equal(by(11).result.resultType, 'complete'); assert.equal(by(11).result.tools.length, 3); assert.equal(by(12).error.code, -32022); assert.equal(by(12).error.data.requested, '1900-01-01');
    assert.ok(seen.every(x => x.auth === 'Bearer cora_testkey123')); assert.ok(!seen.some(x => x.url.includes('etc'))); // invalid id never reaches Cora
    // missing key: tool error, not a crash; nothing sent
    const n = seen.length; const k = await run({ CORA_BASE_URL: env.CORA_BASE_URL }, [{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_projects', arguments: {} } }, 'not json {' as unknown as object]);
    const kr = k.out.find(m => m.id === 1)!; assert.equal(kr.result.isError, true); assert.match(kr.result.content[0].text, /CORA_API_KEY/); assert.equal(seen.length, n);
    assert.equal(k.out.find(m => m.error?.code === -32700) !== undefined, true);
    const w = await run({ ...env, CORA_API_KEY: 'cora_wrong' }, [{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_projects', arguments: {} } }]); assert.match(w.out[0].result.content[0].text, /401/); assert.ok(!w.out[0].result.content[0].text.includes('cora_wrong'));
  } finally { srv.close(); }
});
