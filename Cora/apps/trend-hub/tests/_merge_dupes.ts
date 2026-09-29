/**
 * 표에 쌓인 같은 유행을 하나로 합친다. **수집하지 않는다.** LLM 1회.
 *
 * 중복은 회차를 건너뛰며 생겼다 — `BAD 챌린지` 는 09-18·09-22 회차가, `배드 챌린지` 는
 * 09-18(다른 회차)·09-21 회차가 냈다. 이제 회차가 표에 있는 이름까지 보고 묶지만
 * (lib/collect/grouping.ts), **이미 두 줄로 앉은 것은 그대로 남는다.**
 *
 * 후보 행을 고치지 않고 **스냅샷을 고친다.** 후보 행만 합치면 다음 재정규화가 옛 원본에서
 * 둘을 다시 세운다. 소급이 스냅샷으로 가는 이유가 여기 있다(_lineage.ts 와 같은 규칙).
 *
 * 같은 회차 안에서 둘이 한 이름이 되면 **게시물을 합친다.** 이름만 바꾸면 뒤엣것이
 * 앞엣것을 덮어써서 근거가 반쯤 사라진다.
 *
 * **키를 직접 물려야 한다.**
 *   npx tsx --env-file=.env.local tests/_merge_dupes.ts --go
 */
import { listSnapshots, listCandidates, patchSnapshotRaw, renormalize, key } from '../lib/core/store';
import { memeNativeDiscovery as d } from '../lib/discoveries/meme-native';
import { groupNames } from '../lib/collect/grouping';
import type { Post } from '../lib/collect/tikhub';

const GO = process.argv.includes('--go');

interface Hit { name: string; kind: string; posts: Post[]; searched: number; aliases?: string[]; related?: string[] }

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === d.id);
  const cands = (await listCandidates()).filter((c) => c.origin.discoveryId === d.id);
  const names = [...new Set(cands.map((c) => c.subject))];
  console.log(`밈 후보 ${cands.length}건 · 이름 ${names.length}개 · 스냅샷 ${snaps.length}개`);
  if (!GO) return console.log('견적만 냈습니다. 실제로 부르려면 --go');

  const hintOf = new Map(cands.map((c) => [c.subject, (c.summary ?? c.verdict ?? '').slice(0, 120)]));
  const r = await groupNames(names.map((n) => ({ name: n, hint: hintOf.get(n), existing: true })));
  const merged = r.groups.filter((g) => g.aliases.length);
  if (!merged.length) return console.log('합칠 것이 없습니다.');

  // 별칭 → 대표
  const canonOf = new Map<string, string>();
  const aliasOf = new Map<string, string[]>();
  for (const g of merged) {
    aliasOf.set(g.canonical, g.aliases);
    for (const a of g.aliases) canonOf.set(key(a), g.canonical);
  }
  console.log(`\n■ 합칠 것 ${merged.length}쌍`);
  for (const g of merged) console.log(`   ${g.canonical}  ←  ${g.aliases.join(' · ')}`);

  let touched = 0;
  for (const s of snaps) {
    const raw = (s.raw ?? {}) as { searches?: Hit[] };
    const searches = raw.searches ?? [];
    if (!searches.length) continue;

    const byName = new Map<string, Hit>();
    let changed = false;
    for (const h of searches) {
      const canonical = canonOf.get(key(h.name)) ?? h.name;
      if (canonical !== h.name) changed = true;
      const prev = byName.get(key(canonical));
      if (!prev) {
        byName.set(key(canonical), { ...h, name: canonical });
        continue;
      }
      // 같은 회차에 둘이 있었다. 게시물을 합친다 — 덮어쓰면 근거가 반쯤 사라진다.
      changed = true;
      const seen = new Set(prev.posts.map((p) => p.sourceId));
      prev.posts = [...prev.posts, ...h.posts.filter((p) => !seen.has(p.sourceId))];
      prev.searched = Math.max(prev.searched, h.searched);
    }
    if (!changed) continue;

    const next = [...byName.values()].map((h) => {
      const alias = aliasOf.get(h.name);
      return alias ? { ...h, aliases: [...new Set([...(h.aliases ?? []), ...alias])] } : h;
    });
    await patchSnapshotRaw(s.runId, { searches: next });
    console.log(`   ${s.runId}  ${searches.length} → ${next.length}`);
    touched += 1;
  }

  console.log(`\n스냅샷 ${touched}개 고침`);
  const rn = await renormalize(d.id, (raw, ctx) => d.normalize(raw, ctx), (raw, ctx, c) => d.records!(raw, ctx, c));
  console.log(`다시 세움 — 후보 ${rn.before} → ${rn.after} · 레코드 ${rn.posts}건`);
}
main();
