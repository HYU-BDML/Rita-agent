/**
 * 인스타·X 원본에서 이미지 URL 이 어느 칸으로 오는지 본다. 호출 2회(각 1회).
 *
 * _raw_tikhub.ts 와 같은 이유로 여기서 fetch 를 따로 갖는다 — call() 이 export 안 돼 있고,
 * lib 을 고치지 않기 위해서다. 수집기가 쓰는 바로 그 경로로 부른다.
 */
import { promises as fs } from 'node:fs';

const BASE = 'https://api.tikhub.io/api/v1';
const OUT = 'C:/Users/mooja/AppData/Local/Temp';

function walk(node: unknown, path: string, hits: string[], depth = 0): void {
  if (node == null || hits.length > 40 || depth > 8) return;
  if (typeof node === 'string') {
    if (/^https?:\/\//i.test(node) && /\.(jpe?g|png|webp|heic|avif)|\/img\/|thumbnail|image|cover|display|media|profile_pic/i.test(node)) {
      hits.push(`${path}\n        ${node.slice(0, 100)}`);
    }
    return;
  }
  if (typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.slice(0, 3).forEach((v, i) => walk(v, `${path}[${i}]`, hits, depth + 1));
    return;
  }
  for (const k of Object.keys(node as Record<string, unknown>)) {
    walk((node as Record<string, unknown>)[k], `${path}.${k}`, hits, depth + 1);
  }
}

async function probe(label: string, url: string, pick: (raw: any) => any, file: string) {
  const key = process.env.TIKHUB_KEY?.trim();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  const text = await res.text();
  console.log(`\n═══ ${label} — HTTP ${res.status} · ${text.length.toLocaleString('ko-KR')}자`);
  if (!res.ok) return console.log('  ' + text.slice(0, 200));

  const raw = JSON.parse(text);
  await fs.writeFile(`${OUT}/${file}`, JSON.stringify(raw, null, 2), 'utf8').catch(() => {});
  const first = pick(raw);
  if (!first) return console.log('  첫 건을 못 꺼냈습니다. data 키: ' + Object.keys(raw?.data ?? {}).join(' · '));

  console.log('  최상위 키: ' + Object.keys(first).slice(0, 24).join(' · '));
  const hits: string[] = [];
  walk(first, '', hits);
  console.log('  ── 이미지성 URL ──');
  console.log(hits.length ? hits.map((h) => '    ' + h).join('\n') : '    없음');
}

async function main() {
  if (!process.env.TIKHUB_KEY?.trim()) throw new Error('TIKHUB_KEY 없음');

  // 수집기가 쓰는 경로 그대로 (tikhub.ts:122)
  await probe(
    '인스타그램 search_reels',
    `${BASE}/instagram/v2/search_reels?${new URLSearchParams({ keyword: '치이카와', count: '5' })}`,
    (raw) => {
      const l = raw?.data?.data?.items ?? raw?.data?.items ?? raw?.data?.reels ?? [];
      const it = l?.[0];
      return it?.media ?? it?.node ?? it;
    },
    'ig-raw.json',
  );

  // tikhub.ts:150
  await probe(
    'X search_timeline',
    `${BASE}/twitter/web/fetch_search_timeline?${new URLSearchParams({ keyword: '치이카와', search_type: 'Top' })}`,
    (raw) => {
      const l = raw?.data?.timeline ?? raw?.data?.tweets ?? raw?.data ?? [];
      return (Array.isArray(l) ? l : []).find((t: any) => t?.type !== 'user' && (t?.tweet_id || t?.text));
    },
    'x-raw.json',
  );
}
main();
