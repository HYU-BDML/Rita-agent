import { fetchAll, recent } from '../lib/collect/rss';
import { proposeTopics, verifyTopics } from '../lib/collect/topics';

async function main() {
  const r = await fetchAll();
  const arts = recent(r.articles, 7);
  console.log(`기사 ${arts.length}건 (매체 ${r.ok.length}곳)\n`);

  const t0 = Date.now();
  const p = await proposeTopics(arts);
  const topics = verifyTopics(p.articles, p.drafts);
  const usage = p.usage;
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`주제 ${topics.length}개 · ${secs}초 · 토큰 in ${usage.input} / out ${usage.output}`);
  console.log(`비용 약 $${(usage.input * 5e-6 + usage.output * 25e-6).toFixed(4)}\n`);

  for (const t of topics) {
    console.log(`■ ${t.topic}   [매체 ${t.sources.length} · 기사 ${t.articles.length}]`);
    console.log(`  ${t.why}`);
    console.log(`  ${t.sources.join(' · ')}`);
    for (const a of t.articles.slice(0, 2)) console.log(`    - ${a.title.slice(0, 62)}`);
    if (t.droppedIndexes.length) console.log(`  ⚠ 없는 기사번호 ${t.droppedIndexes.length}개 버림`);
    console.log();
  }
}
main();
