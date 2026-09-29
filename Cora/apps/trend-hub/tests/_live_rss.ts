import { fetchAll, recent } from '../lib/collect/rss';

async function main() {
const r = await fetchAll();
console.log('== 수집 ==');
for (const o of r.ok) console.log(`  ${o.source.padEnd(14)} ${String(o.count).padStart(4)}건`);
for (const f of r.failed) console.log(`  ${f.source.padEnd(14)} 실패 — ${f.reason}`);
console.log(`  합계 ${r.articles.length}건 · 최근 7일 ${recent(r.articles, 7).length}건`);

console.log('\n== 제목 표본 (깨짐 확인) ==');
for (const a of r.articles.slice(0, 3)) console.log(`  [${a.sourceName}] ${a.title.slice(0, 60)}`);
const withDate = r.articles.filter((a) => a.publishedAt).length;
console.log(`\n  날짜 있는 항목 ${withDate}/${r.articles.length}`);
}
main();
