/**
 * 본인 오디오 상위 N개를 깊게 판다 — 그 사운드를 쓴 영상 목록을 받아 눈으로 본다.
 *
 * 보려는 것 셋 (2026-09-19 사용자):
 *   1. 같은 포맷을 반복하나 — 그러면 밈이다. 인기 영상 하나의 오디오가 재생된 것뿐이면 아니다.
 *   2. 캡션을 그대로 — 사람이 판단할 자리다. 요약하지 않는다.
 *   3. 이름이 나오나 — 캡션들이 공통 주제를 가지면 그게 후보 이름이 된다.
 *      `오리지널 사운드 - 𝒦₊⊹` 로는 카드뉴스 주제를 못 쓴다.
 *
 * 사운드 하나에 1콜이다. 기본은 견적, 부르려면 --go.
 */
import { listSnapshots } from '../lib/core/store';
import { videosBySound, type Post } from '../lib/collect/tikhub';

const GO = process.argv.includes('--go');
const TOP = Number(process.argv[2]) || 10;

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === 'character-native');
  const posts = ((snaps[snaps.length - 1].raw as { posts?: Post[] }).posts ?? [])
    .filter((p) => p.platform === 'tiktok' && p.sound?.id);

  const by = new Map<string, { title: string; uc: number; seed: string }>();
  for (const p of posts) {
    const s = p.sound!;
    if (!s.isOriginal) continue; // 라이브러리 음원은 제외 — 상위가 스톡 BGM 이라 볼 게 없다
    const at = by.get(s.id);
    if (!at || s.userCount > at.uc) by.set(s.id, { title: s.title, uc: s.userCount, seed: p.text });
  }
  const top = [...by].sort((a, b) => b[1].uc - a[1].uc).slice(0, TOP);

  console.log(`본인 오디오 ${by.size}개 중 상위 ${top.length}개 · 호출 ${top.length}회 (약 $${(top.length * 0.03).toFixed(2)})\n`);
  if (!GO) {
    for (const [id, v] of top) console.log(`   ${v.uc.toLocaleString('ko-KR').padStart(9)}  ${v.title.slice(0, 30)}  id=${id}`);
    console.log('\n견적만 냈습니다. 실제로 부르려면 --go');
    return;
  }

  for (const [id, v] of top) {
    console.log('─'.repeat(92));
    console.log(`${v.title}  ·  user_count ${v.uc.toLocaleString('ko-KR')}  ·  id=${id}`);
    console.log(`씨앗 캡션: ${v.seed.replace(/\s+/g, ' ').slice(0, 76)}`);
    let vids: Post[] = [];
    try {
      vids = await videosBySound(id, 20);
    } catch (e) {
      console.log(`   ⚠ ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`);
      continue;
    }
    if (!vids.length) {
      console.log('   영상 0건 — 이 사운드로는 목록이 안 나온다');
      continue;
    }
    const accts = new Set(vids.map((x) => x.authorId || x.authorName));
    const kr = vids.filter((x) => /[가-힣]/.test(x.text + x.authorName)).length;
    // 공통 해시태그 — 이게 후보 이름의 재료다.
    const tagCount = new Map<string, number>();
    for (const x of vids) for (const t of new Set(x.tags)) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    const common = [...tagCount].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8);

    console.log(`   영상 ${vids.length}건 · 계정 ${accts.size}곳 · 한글 ${kr}건`);
    console.log(`   여러 영상이 함께 쓴 태그: ${common.length ? common.map(([t, n]) => `${t}(${n})`).join(' · ') : '없음'}`);
    console.log('   캡션 5개 (원문 그대로):');
    for (const x of vids.slice(0, 5)) {
      console.log(`     @${(x.authorId || '?').slice(0, 16).padEnd(17)} ${x.text.replace(/\s+/g, ' ').slice(0, 68) || '(캡션 없음)'}`);
    }
  }
}
main();
