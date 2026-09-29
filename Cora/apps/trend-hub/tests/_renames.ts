/**
 * 저장된 회차에 이름 추출을 다시 돌린다 (한도 MAX_NAMES). **수집하지 않는다.**
 *
 * 왜 소급하나. 한도를 올린 채 새 회차만 돌리면 날마다 기준이 달라져 회차 간 비교가
 * 깨진다 — 어제는 25칸, 오늘은 50칸으로 본 것을 같은 표에 놓을 수 없다.
 *
 * **합치지 않고 갈아 끼운다.** 옛 제안과 새 제안을 합치면 이름이 중복되고,
 * `verifyNames` 의 목록 게시물 판정(`namesPerPost`)이 한 게시물에 달린 이름 수를
 * 세는 구조라 합집합을 넣으면 그 수가 부풀어 멀쩡한 이름이 조용히 걸러진다.
 *
 * 기본은 견적. 부르려면 `--go`.
 */
import Anthropic from '@anthropic-ai/sdk';
import { listSnapshots, patchSnapshotRaw, renormalize } from '../lib/core/store';
import { proposeNames, verifyNames, MAX_NAMES, type NameDraft } from '../lib/collect/names';
import { dropAdult, isAdultName } from '../lib/collect/safety';
import { characterNativeDiscovery as d, withinWindow, MAX_CANDIDATES } from '../lib/discoveries/character-native';
import { cut } from '../lib/core/text';
import type { Post } from '../lib/collect/tikhub';

const GO = process.argv.includes('--go');

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === d.id);
  const client = new Anthropic();
  let spentIn = 0;
  let spentOut = 0;

  console.log(`이름 추출 한도 ${MAX_NAMES} 로 다시 돌린다. 스냅샷 ${snaps.length}개\n`);

  for (const s of snaps) {
    const raw = s.raw as { posts?: Post[]; drafts?: NameDraft[] };
    const posts = dropAdult(withinWindow(raw.posts ?? [], s.at)).kept;
    const before = verifyNames(posts, raw.drafts ?? [], 1).filter((n) => !isAdultName(n.name));
    const head = `${s.runId}  게시물 ${String(posts.length).padStart(3)} · 지금 제안 ${String((raw.drafts ?? []).length).padStart(2)} → 통과 ${String(before.length).padStart(2)}`;

    if (!posts.length) {
      console.log(`${head}  → 게시물이 없다, 건너뜀`);
      continue;
    }

    if (!GO) {
      const table = posts
        .map((p) => `${p.sourceId}\t${p.platform}\t계정명:${p.authorName || '-'}\t@${p.authorId || '-'}\t태그:${p.tags.join(',') || '-'}\t본문:${cut((p.text || '').replace(/\s+/g, ' '), 160)}`)
        .join('\n');
      const r = await client.messages.countTokens({
        model: 'claude-opus-5',
        messages: [{ role: 'user', content: `## 수집 목록\n${table}` }],
      });
      // 출력은 09-18 실측(한도 50 에서 13,623)을 게시물 수로 비례해 잡는다.
      const out = Math.round((13623 / 106) * posts.length);
      console.log(`${head}  → 입력 ${r.input_tokens.toLocaleString('ko-KR')} · 출력 약 ${out.toLocaleString('ko-KR')} · 약 $${((r.input_tokens * 5) / 1e6 + (out * 25) / 1e6).toFixed(2)}`);
      spentIn += r.input_tokens;
      spentOut += out;
      continue;
    }

    const r = await proposeNames(posts, { max: MAX_NAMES });
    const after = verifyNames(posts, r.drafts, 1).filter((n) => !isAdultName(n.name));
    await patchSnapshotRaw(s.runId, { drafts: r.drafts });
    spentIn += r.usage.input;
    spentOut += r.usage.output;
    const fresh = after.filter((n) => !before.some((m) => m.name === n.name)).map((n) => n.name);
    console.log(
      `${head}  → 제안 ${r.drafts.length} · 통과 ${after.length} (표에 ${Math.min(after.length, MAX_CANDIDATES)})`,
    );
    if (fresh.length) console.log(`    새 이름: ${fresh.slice(0, 12).join(', ')}${fresh.length > 12 ? ` … 외 ${fresh.length - 12}` : ''}`);
  }

  const usd = (spentIn * 5) / 1e6 + (spentOut * 25) / 1e6;
  console.log(`\n합계 입력 ${spentIn.toLocaleString('ko-KR')} · 출력 ${spentOut.toLocaleString('ko-KR')} · 약 $${usd.toFixed(2)}`);

  if (!GO) {
    console.log('견적만 냈습니다. 실제로 돌리려면 --go');
    return;
  }

  const rn = await renormalize(
    d.id,
    (raw, ctx) => d.normalize(raw, ctx),
    (raw, ctx, cands) => d.records!(raw, ctx, cands),
  );
  console.log(`\n다시 세움 — 후보 ${rn.before} → ${rn.after} · 레코드 ${rn.posts}건`);
  console.log('다음: tests/_rejudge.ts --go · tests/_summarize.ts --go (새 후보에 판정·요약이 없다)');
}
main();
