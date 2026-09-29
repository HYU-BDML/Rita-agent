/**
 * 회차에서 나온 사운드를 세어 한 장으로 본다. **저장된 스냅샷만 읽는다 — 호출 없음.**
 *
 * 판단 기준: 이 목록이 밈으로 보이나, 아니면 캐릭터 영상 BGM 으로 보이나.
 * user_count 가 수백짜리 배경음뿐이면 밈 축은 접는다(2026-09-19 사용자와 정한 기준).
 */
import { listSnapshots } from '../lib/core/store';
import type { Post } from '../lib/collect/tikhub';

const TOP = Number(process.argv[2]) || 20;

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === 'character-native');
  const s = snaps[snaps.length - 1];
  const posts = ((s.raw as { posts?: Post[] }).posts ?? []);
  const tik = posts.filter((p) => p.platform === 'tiktok');
  const withSound = tik.filter((p) => p.sound?.id);
  const kr = (t: string) => /[가-힣]/.test(t);

  console.log(`${s.runId}`);
  console.log(`게시물 ${posts.length}건 · 틱톡 ${tik.length}건 · 사운드 붙은 것 ${withSound.length}건`);
  const krRatio = tik.filter((p) => kr(p.text + p.authorName)).length;
  console.log(`틱톡 한글 ${krRatio}/${tik.length} (${Math.round((krRatio / Math.max(1, tik.length)) * 100)}%)  ← region=KR 이전에는 42% 였다\n`);

  const by = new Map<string, { title: string; uc: number; orig: boolean; accounts: Set<string>; posts: Post[] }>();
  for (const p of withSound) {
    const sd = p.sound!;
    const at = by.get(sd.id) ?? { title: sd.title, uc: sd.userCount, orig: sd.isOriginal, accounts: new Set<string>(), posts: [] };
    at.accounts.add(p.authorId || p.authorName);
    at.posts.push(p);
    // 같은 사운드라도 회차 안에서 값이 다르면 큰 쪽을 쓴다(응답 시점 차이).
    at.uc = Math.max(at.uc, sd.userCount);
    by.set(sd.id, at);
  }

  const rows = [...by].sort((a, b) => b[1].uc - a[1].uc || b[1].accounts.size - a[1].accounts.size);
  console.log(`서로 다른 사운드 ${rows.length}개 · 우리 표본에서 2계정 이상이 쓴 것 ${rows.filter(([, v]) => v.accounts.size >= 2).length}개\n`);

  console.log(`■ user_count 상위 ${TOP}`);
  console.log(`   ${'user_count'.padStart(10)}  표본계정  원본?  제목 / 그 사운드를 쓴 게시물 예시`);
  for (const [id, v] of rows.slice(0, TOP)) {
    console.log(
      `   ${v.uc.toLocaleString('ko-KR').padStart(10)}  ${String(v.accounts.size).padStart(6)}  ${v.orig ? '본인 ' : '  -  '}  ${(v.title || '(제목없음)').slice(0, 34)}`,
    );
    console.log(`               id=${id}  ${(v.posts[0].text || '').replace(/\s+/g, ' ').slice(0, 52)}`);
  }

  const noise = rows.filter(([, v]) => v.uc <= 1).length;
  const big = rows.filter(([, v]) => v.uc >= 10_000).length;
  console.log(`\n요약: user_count 1 이하 ${noise}개 · 1만 이상 ${big}개 · 본인 오디오 ${rows.filter(([, v]) => v.orig).length}개`);
}
main();
