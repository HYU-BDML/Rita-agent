/**
 * 계정명일치(selfNamed)가 맞게 찍히는지 눈으로 본다. 저장도 호출도 하지 않는다.
 *
 * 이 값은 프롬프트가 아니라 `lib/collect/names.ts:inAccount` 가 만든다.
 * 같은 함수가 **어느 게시물을 근거로 셀지**도 정하므로, 규칙을 건드리면
 * 후보 수가 같이 움직인다. 그래서 고치기 전후로 이 표를 비교한다.
 */
import { listSnapshots } from '../lib/core/store';
import { characterNativeDiscovery as d, verifiedFrom, pickForTable } from '../lib/discoveries/character-native';

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === d.id);
  const rows = new Map<string, { self: boolean; hits: string; authors: number; accounts: string[] }>();

  for (const s of snaps) {
    for (const n of pickForTable(verifiedFrom(s.raw, s.at))) {
      rows.set(n.name, {
        self: n.selfNamed,
        hits: n.hits.join('·'),
        authors: n.authors.length,
        accounts: [...new Set(n.posts.map((p) => `${p.authorName}(@${p.authorId})`))].slice(0, 2),
      });
    }
  }

  const yes = [...rows].filter(([, v]) => v.self);
  console.log(`후보 ${rows.size}건 · 계정명일치 ${yes.length}건\n`);
  for (const [name, v] of [...rows].sort((a, b) => Number(b[1].self) - Number(a[1].self))) {
    console.log(`${v.self ? '예  ' : '아니오'} ${name.padEnd(14)} 자리:${(v.hits || '-').padEnd(10)} 계정${v.authors}  ${v.accounts.join(' , ')}`);
  }
}
main();
