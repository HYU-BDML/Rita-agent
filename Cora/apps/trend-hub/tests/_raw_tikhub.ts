/**
 * TikHub 원본 응답에 이미지 URL 이 오는지만 본다. 호출 1회(틱톡 검색).
 *
 * lib/collect/tikhub.ts 의 매핑은 Post 12칸만 꺼내고 나머지를 버린다. 스냅샷에 남은 것도
 * 그 Post[] 라 버려진 값은 소급으로 볼 수 없다. 그래서 응답을 한 번 더 받아 통째로 본다.
 * call() 이 export 되어 있지 않아 여기서 fetch 를 따로 갖는다 — lib 을 고치지 않기 위해서다.
 */
import { promises as fs } from 'node:fs';

const BASE = 'https://api.tikhub.io/api/v1';
// Windows node 는 WSL 의 /tmp 를 C:\tmp 로 본다. 기본값은 양쪽에서 보이는 자리로 둔다.
const OUT = process.argv[3] ?? 'C:/Users/mooja/AppData/Local/Temp/tikhub-raw.json';

function walk(node: unknown, path: string, hits: string[]): void {
  if (node == null || hits.length > 60) return;
  if (typeof node === 'string') {
    if (/^https?:\/\//i.test(node) && /\.(jpe?g|png|webp|heic|avif)|\/img\/|image|cover|avatar/i.test(node)) {
      hits.push(`${path}\n      ${node.slice(0, 110)}`);
    }
    return;
  }
  if (typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, hits));
    return;
  }
  for (const k of Object.keys(node as Record<string, unknown>)) {
    walk((node as Record<string, unknown>)[k], `${path}.${k}`, hits);
  }
}

async function main() {
  const key = process.env.TIKHUB_KEY?.trim();
  if (!key) throw new Error('TIKHUB_KEY 가 없습니다.');
  const keyword = process.argv[2] ?? '치이카와';

  const qs = new URLSearchParams({ keyword, count: '5' });
  // 수집기가 쓰는 바로 그 경로 (lib/collect/tikhub.ts:179)
  const res = await fetch(`${BASE}/tiktok/app/v3/fetch_video_search_result?${qs}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  console.log(`HTTP ${res.status} · 본문 ${text.length.toLocaleString('ko-KR')}자 · 검색어 "${keyword}"`);
  if (!res.ok) {
    console.log(text.slice(0, 300));
    return;
  }

  const raw = JSON.parse(text);

  // 수집기와 같은 자리에서 첫 건을 꺼낸다
  const items =
    raw?.data?.search_item_list ?? raw?.data?.aweme_list ?? raw?.data?.item_list ?? [];
  console.log(`목록 ${Array.isArray(items) ? items.length : 0}건 (경로: ${
    raw?.data?.search_item_list ? 'data.search_item_list' : raw?.data?.aweme_list ? 'data.aweme_list' : 'data.item_list'
  })`);
  const first = items?.[0]?.aweme_info ?? items?.[0]?.item ?? items?.[0];
  if (!first) {
    console.log('첫 건을 못 꺼냈습니다.');
    return;
  }
  console.log(`aweme 최상위 키: ${Object.keys(first).join(' · ')}`);
  if (first.video) console.log(`video 아래 키: ${Object.keys(first.video).join(' · ')}`);

  console.log('\n── 첫 건에서 찾은 이미지성 URL ──');
  const hits: string[] = [];
  walk(first, 'aweme', hits);
  console.log(hits.length ? hits.map((h) => '  ' + h).join('\n') : '  없음');

  // 저장은 마지막에. 실패해도 위 결과는 이미 찍혔으니 호출을 다시 쓸 일이 없다.
  try {
    await fs.writeFile(OUT, JSON.stringify(raw, null, 2), 'utf8');
    console.log(`\n원본 저장: ${OUT}`);
  } catch (e) {
    console.log(`\n원본 저장 실패(분석은 위에 다 나왔다): ${e instanceof Error ? e.message : e}`);
  }
}
main();
