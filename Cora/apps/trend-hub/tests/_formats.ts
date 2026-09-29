/**
 * 밈 2단계의 1번 — 캡션+자막에서 포맷 이름이 몇 개 뽑히나. **LLM 1회.**
 *
 * n-gram(3계정 이상 같은 문구)은 계정당 1.03건 수집에서 구조적으로 0건이 된다.
 * 그런데 같은 자료 자막에는 이름 붙은 포맷이 있었다. 그래서 세는 방법을 바꾼다 —
 * 캐릭터 축처럼 LLM 이 이름을 제안하고 코드가 원문 대조를 한다.
 *
 * 기본은 견적. 부르려면 --go.
 */
import { promises as fs } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { listSnapshots } from '../lib/core/store';
import { proposeFormats, verifyFormats } from '../lib/collect/formats';
import { dropAdult } from '../lib/collect/safety';
import { withinWindow } from '../lib/discoveries/character-native';
import type { Post } from '../lib/collect/tikhub';

const GO = process.argv.includes('--go');
const DISCOVERY = process.argv.find((a) => a.includes('-native')) ?? 'meme-native';

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === DISCOVERY);
  const snap = snaps[snaps.length - 1];
  const posts = dropAdult(withinWindow((snap.raw as { posts?: Post[] }).posts ?? [], snap.at)).kept;

  let ocr = new Map<string, string>();
  try {
    const rows = JSON.parse(
      await fs.readFile(`C:/Users/mooja/AppData/Local/Temp/thumb-text-${DISCOVERY}.json`, 'utf8'),
    ) as { id: string; text: string }[];
    ocr = new Map(rows.map((r) => [r.id, r.text]));
  } catch {
    /* 자막이 없으면 캡션만 본다 */
  }

  console.log(`${snap.runId}\n게시물 ${posts.length}건 · 자막 ${ocr.size}건`);

  if (!GO) {
    const table = posts.map((p) => `${p.text} ${ocr.get(p.sourceId) ?? ''}`).join('\n');
    const r = await new Anthropic().messages.countTokens({
      model: 'claude-opus-5',
      messages: [{ role: 'user', content: table }],
    });
    console.log(`입력 약 ${r.input_tokens.toLocaleString('ko-KR')} 토큰 · 출력 약 6,000 예상 → 약 $${((r.input_tokens * 5) / 1e6 + (6000 * 25) / 1e6).toFixed(2)}`);
    console.log('견적만 냈습니다. 실제로 부르려면 --go');
    return;
  }

  const { drafts, usage } = await proposeFormats(posts, ocr);
  const verified = verifyFormats(posts, ocr, drafts);
  const lost = drafts.length - verified.length;
  console.log(
    `제안 ${drafts.length}개 → 원문 대조 통과 ${verified.length}개 (지어낸 이름 ${lost}개 버림)` +
      ` · 토큰 입력 ${usage.input.toLocaleString('ko-KR')} 출력 ${usage.output.toLocaleString('ko-KR')}` +
      ` · 약 $${((usage.input * 5) / 1e6 + (usage.output * 25) / 1e6).toFixed(2)}\n`,
  );

  const OUT = `C:/Users/mooja/AppData/Local/Temp/formats-${DISCOVERY}.json`;
  await fs.writeFile(
    OUT,
    JSON.stringify(
      verified.map((v) => ({
        ...v.draft,
        sampleAccounts: [...new Set(v.posts.map((p) => p.authorId))],
      })),
      null,
      2,
    ),
    'utf8',
  );
  console.log(`제안 저장: ${OUT}  (화면을 잘라도 잃지 않게)\n`);

  const byKind = new Map<string, typeof verified>();
  for (const v of verified) byKind.set(v.draft.kind, [...(byKind.get(v.draft.kind) ?? []), v]);
  for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`■ ${kind} — ${list.length}개`);
    for (const v of list.sort((a, b) => b.draft.confidence - a.draft.confidence)) {
      console.log(`   ${v.draft.confidence.toFixed(2)}  ${v.draft.name.padEnd(24)} 우리 표본 ${v.posts.length}건 · 계정 ${new Set(v.posts.map((p) => p.authorId)).size}곳`);
      console.log(`         근거: ${v.draft.evidence.replace(/\s+/g, ' ').slice(0, 64)}`);
    }
    console.log();
  }
  if (lost) {
    const names = new Set(verified.map((v) => v.draft.name));
    console.log('■ 원문에 없어 버린 이름:', drafts.filter((d) => !names.has(d.name)).map((d) => d.name).join(' · '));
  }
}
main();
