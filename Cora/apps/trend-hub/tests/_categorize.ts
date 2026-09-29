/**
 * 뉴스 주제에 갈래를 달아 스냅샷에 소급한다. **수집하지 않는다.** LLM 만 부른다.
 *
 * 회차가 이제 갈래를 직접 만들지만(2026-09-22), 그 전에 들어온 주제는 비어 있다.
 * 후보 행은 회차마다 덮어써지므로 주제마다 **마지막으로 나온 회차**의 스냅샷에만
 * 적는다 (`_lineage.ts` 와 같은 규칙). 앞 회차에 적으면 renormalize 가 덮어쓴다.
 *
 * **키를 직접 물려야 한다.** Next 를 거치지 않아 .env.local 이 저절로 안 읽힌다.
 *   npx tsx --env-file=.env.local tests/_categorize.ts --go
 */
import { listSnapshots, patchSnapshotRaw, renormalize, key } from '../lib/core/store';
import { newsDiscovery as d } from '../lib/discoveries/news';
import { verifyTopics, type TopicDraft } from '../lib/collect/topics';
import { classifyNews, type CategoryVerdict } from '../lib/collect/news-category';
import type { Article } from '../lib/collect/rss';

const GO = process.argv.includes('--go');

type NewsRawish = { articles?: Article[]; drafts?: TopicDraft[]; categories?: CategoryVerdict[] };

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === d.id);

  // 주제 → 마지막 회차.
  const last = new Map<string, string>();
  for (const s of snaps) {
    const raw = (s.raw ?? {}) as NewsRawish;
    for (const t of verifyTopics(raw.articles ?? [], raw.drafts ?? [])) last.set(key(t.topic), s.runId);
  }

  let total = { input: 0, output: 0 };
  const all: CategoryVerdict[] = [];

  for (const s of snaps) {
    const raw = (s.raw ?? {}) as NewsRawish;
    const had = new Set((raw.categories ?? []).map((c) => key(c.topic)));
    const mine = verifyTopics(raw.articles ?? [], raw.drafts ?? []).filter(
      (t) => last.get(key(t.topic)) === s.runId && !had.has(key(t.topic)),
    );
    if (!mine.length) continue;

    console.log(`${s.runId}  분류할 것 ${mine.length}건`);
    if (!GO) continue;

    const r = await classifyNews(
      mine.map((t) => ({
        topic: t.topic,
        why: t.why,
        evidence: t.articles.slice(0, 3).map((a) => `[${a.sourceName}] ${a.title}`),
      })),
    );
    await patchSnapshotRaw(s.runId, { categories: [...(raw.categories ?? []), ...r.verdicts] });
    total.input += r.usage.input;
    total.output += r.usage.output;
    all.push(...r.verdicts);
  }

  if (!GO) return console.log('\n견적만 냈습니다. 실제로 부르려면 --go');
  if (!all.length) return console.log('새로 분류할 것이 없습니다.');

  console.log(
    `\n토큰 입력 ${total.input.toLocaleString('ko-KR')} 출력 ${total.output.toLocaleString('ko-KR')}` +
      ` ≈ $${((total.input * 1) / 1e6 + (total.output * 5) / 1e6).toFixed(3)}`,
  );

  const by = new Map<string, string[]>();
  for (const v of all) by.set(v.category, [...(by.get(v.category) ?? []), v.topic]);
  console.log('\n■ 갈래별');
  for (const [cat, list] of [...by].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`   ${cat.padEnd(12)} ${String(list.length).padStart(2)}건  ${list.slice(0, 5).join(' · ')}${list.length > 5 ? ' …' : ''}`);
  }

  const rn = await renormalize(d.id, (raw, ctx) => d.normalize(raw, ctx));
  console.log(`\n다시 세움 — 후보 ${rn.before} → ${rn.after}`);
}
main();
