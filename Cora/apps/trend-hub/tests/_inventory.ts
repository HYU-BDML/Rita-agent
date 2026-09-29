/**
 * 무엇이 왜 안 열리나. 한 장으로 본다.
 *
 * _status.ts 는 몇 개가 되고 안 되는지를 센다. 여기는 **막힌 것 하나하나가 무엇이 없어서
 * 막혔는지**를 적는다. 둘은 다른 질문이다 — 세는 것으로는 다음에 뭘 할지 못 정한다.
 *
 *   npx tsx --env-file=.env.local tests/_inventory.ts
 */

import { DISCOVERIES, PRODUCERS } from '../lib/core/registry';
import { apiKeyFor } from '../lib/core/dify';

type Row = {
  kind: '판정기' | '생성기';
  id: string;
  name: string;
  state: 'ok' | 'hidden' | 'held';
  keyEnv?: string;
  blocked: string;
  note: string;
};

function rowFor(kind: Row['kind'], x: any): Row {
  const hasKey = x.keyEnv ? Boolean(apiKeyFor(x.keyEnv)) : true;
  const state: Row['state'] = x.held ? 'held' : hasKey ? 'ok' : 'hidden';
  return {
    kind,
    id: x.id,
    name: x.name,
    state,
    keyEnv: x.keyEnv,
    blocked: x.held ? String(x.held) : hasKey ? '' : `${x.keyEnv} 를 넣으면 열린다`,
    note: [x.role ? `역할 ${x.role}` : '', x.unit ? `단위 ${x.unit}` : '',
           x.accepts ? `받는 단위 ${x.accepts.join('·')}` : ''].filter(Boolean).join(' · '),
  };
}

const rows: Row[] = [
  ...DISCOVERIES.map((d) => rowFor('판정기', d)),
  ...PRODUCERS.map((p) => rowFor('생성기', p)),
];

const ICON = { ok: '●', hidden: '○', held: '✕' } as const;
const WHY = {
  ok: '쓸 수 있음',
  hidden: '키 없음 — 키를 넣으면 열린다',
  held: '보류 — 키를 넣어도 안 열린다. 고쳐야 열린다',
} as const;

for (const state of ['ok', 'hidden', 'held'] as const) {
  const part = rows.filter((r) => r.state === state);
  console.log(`\n── ${ICON[state]} ${WHY[state]} (${part.length}) ──`);
  for (const r of part) {
    console.log(`  [${r.kind}] ${r.name}  (${r.id})`);
    if (r.note) console.log(`      ${r.note}`);
    if (r.blocked) console.log(`      막힌 이유: ${r.blocked}`);
  }
}

console.log(`\n합계 ${rows.length} — 쓸 수 있음 ${rows.filter((r) => r.state === 'ok').length} · ` +
  `키 없음 ${rows.filter((r) => r.state === 'hidden').length} · ` +
  `보류 ${rows.filter((r) => r.state === 'held').length}`);
