import { fetchAll, recent } from '../lib/collect/rss';
import { extractTerms } from '../lib/collect/terms';

async function main() {
  const r = await fetchAll();
  const arts = recent(r.articles, 7);
  const hits = extractTerms(arts, { minSources: 2, limit: 25 });
  console.log(`기사 ${arts.length}건 → 후보 낱말 ${hits.length}개\n`);
  console.log('매체수  성격  언급  트렌드  낱말');
  for (const h of hits) {
    console.log(
      `  ${String(h.sources.length).padStart(2)}    ${h.kinds.length}    ${String(h.mentions).padStart(3)}    ${h.onTrends ? '●' : ' '}    ${h.term}   ${h.sources.slice(0, 4).join('·')}`,
    );
  }
}
main();
