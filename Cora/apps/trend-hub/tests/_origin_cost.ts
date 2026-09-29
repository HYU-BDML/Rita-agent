/** 출신 분류 입력이 몇 토큰인지 실측. count_tokens 는 무료다. */
import Anthropic from '@anthropic-ai/sdk';
import { listCandidates } from '../lib/core/store';
import { cut } from '../lib/core/text';

async function main() {
  const cs = (await listCandidates()).filter((c) => c.origin.discoveryId === 'character-native');
  const table = cs
    .map((c) => {
      const ev = c.evidence.slice(0, 2).map((e) => cut(e.title.replace(/\s+/g, ' '), 70)).join(' / ');
      return `${c.subject}\t권리:${c.rights.ownership}\t요약:${cut((c.summary ?? '').replace(/\s+/g, ' '), 260)}\t근거:${ev}`;
    })
    .join('\n');
  const r = await new Anthropic().messages.countTokens({
    model: 'claude-opus-5',
    messages: [{ role: 'user', content: table }],
  });
  // 출력: 후보마다 {name, origin, work, basis, confidence} 약 45토큰
  const out = cs.length * 45;
  console.log(`후보 ${cs.length}건 · 입력 ${r.input_tokens.toLocaleString('ko-KR')} 토큰 · 출력 약 ${out.toLocaleString('ko-KR')}`);
  console.log(`Opus 5  ≈ $${((r.input_tokens * 5) / 1e6 + (out * 25) / 1e6).toFixed(3)}`);
  console.log(`Haiku 4.5 ≈ $${((r.input_tokens * 1) / 1e6 + (out * 5) / 1e6).toFixed(3)}`);
  console.log(`\n요약 없는 후보: ${cs.filter((c) => !(c.summary ?? '').trim()).length}건`);
  console.log(`근거 0건 후보: ${cs.filter((c) => !c.evidence.length).length}건`);
}
main();
