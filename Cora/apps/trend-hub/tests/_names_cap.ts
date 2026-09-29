/**
 * 이름 추출 한도(`MAX_NAMES = 25`)가 산출을 묶고 있나. **저장된 스냅샷에만 다시 돌린다.**
 *
 * 수집(TikHub)은 하지 않는다 — 스냅샷의 게시물을 그대로 다시 넣는다.
 * 돈이 나가는 건 Anthropic 호출 1회뿐이고, 기본은 견적이다. 부르려면 `--go <한도>`.
 *
 *   npx tsx --env-file=.env.local tests/_names_cap.ts           # 견적
 *   npx tsx --env-file=.env.local tests/_names_cap.ts --go 50   # 한도 50 으로 한 번
 *
 * 스냅샷에 **쓰지 않는다.** 이건 실험이라 결과를 저장하면 회차가 거짓이 된다.
 */
import Anthropic from '@anthropic-ai/sdk';
import { listSnapshots } from '../lib/core/store';
import { proposeNames, verifyNames, MAX_NAMES, type NameDraft } from '../lib/collect/names';
import { dropAdult, isAdultName } from '../lib/collect/safety';
import { withinWindow, MAX_CANDIDATES } from '../lib/discoveries/character-native';
import type { Post } from '../lib/collect/tikhub';
import { cut } from '../lib/core/text';

const GO = process.argv.includes('--go');
const CAP = Number(process.argv[process.argv.indexOf('--go') + 1]) || 50;

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === 'character-native');
  const snap = snaps[snaps.length - 1];
  const raw = snap.raw as { posts?: Post[]; drafts?: NameDraft[] };
  const posts = dropAdult(withinWindow(raw.posts ?? [], snap.at)).kept;

  const before = raw.drafts ?? [];
  const beforeChar = before.filter((d) => d.entityType === 'character_candidate');
  const beforeVerified = verifyNames(posts, before, 1).filter((n) => !isAdultName(n.name));

  console.log(`스냅샷 ${snap.runId} · 게시물 ${posts.length}건`);
  console.log(
    `지금(한도 ${MAX_NAMES}): 제안 ${before.length} → 캐릭터 후보 ${beforeChar.length} → 대조 통과 ${beforeVerified.length} → 표에 오름 ${Math.min(beforeVerified.length, MAX_CANDIDATES)}\n`,
  );

  if (!GO) {
    const table = posts
      .map((p) => `${p.sourceId}\t${p.platform}\t계정명:${p.authorName || '-'}\t@${p.authorId || '-'}\t태그:${p.tags.join(',') || '-'}\t본문:${cut((p.text || '').replace(/\s+/g, ' '), 160)}`)
      .join('\n');
    const r = await new Anthropic().messages.countTokens({
      model: 'claude-opus-5',
      messages: [{ role: 'user', content: `## 수집 목록\n${table}` }],
    });
    // 출력은 09-18 회차 실측에서 이름 추출 몫을 뺀 값으로 잡는다(전체 14,661 − 판정·요약 4,434).
    const out = 10227;
    console.log(
      `견적: 입력 ${r.input_tokens.toLocaleString('ko-KR')} 토큰 · 출력 약 ${out.toLocaleString('ko-KR')} → ` +
        `약 $${((r.input_tokens * 5) / 1e6 + (out * 25) / 1e6).toFixed(2)} (한도를 올리면 출력이 더 는다)`,
    );
    console.log('실제로 돌리려면: --go 50');
    return;
  }

  console.log(`한도 ${CAP} 으로 다시 제안받는다…`);
  const r = await proposeNames(posts, { max: CAP });
  const after = r.drafts;
  const afterChar = after.filter((d) => d.entityType === 'character_candidate');
  const afterVerified = verifyNames(posts, after, 1).filter((n) => !isAdultName(n.name));

  console.log(
    `\n한도 ${CAP}: 제안 ${after.length} → 캐릭터 후보 ${afterChar.length} → 대조 통과 ${afterVerified.length} → 표에 오름 ${Math.min(afterVerified.length, MAX_CANDIDATES)}`,
  );
  console.log(`토큰 입력 ${r.usage.input.toLocaleString('ko-KR')} 출력 ${r.usage.output.toLocaleString('ko-KR')} · 약 $${((r.usage.input * 5) / 1e6 + (r.usage.output * 25) / 1e6).toFixed(2)}\n`);

  const had = new Set(beforeVerified.map((n) => n.name));
  const fresh = afterVerified.filter((n) => !had.has(n.name));
  const lost = beforeVerified.filter((n) => !afterVerified.some((m) => m.name === n.name));

  console.log(`■ 새로 나온 이름 ${fresh.length}건 — 쓸 만한가`);
  console.log('   이름              계정 플랫폼     조회   확인된자리');
  for (const n of fresh) {
    console.log(
      `   ${n.name.padEnd(17)} ${String(n.authors.length).padStart(3)} ${n.platforms.join(',').padEnd(10)} ${String(n.views).padStart(7)}  ${n.hits.join('·')}`,
    );
  }
  if (lost.length) console.log(`\n■ 이번엔 안 나온 이름 ${lost.length}건: ${lost.map((n) => n.name).join(', ')}`);
  console.log('\n※ 스냅샷에 저장하지 않았습니다. 실험입니다.');
}
main();
