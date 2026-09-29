/** 문턱을 낮추면 달라지나. 진단용이고 저장하지 않는다. 호출 없음. */
import { listSnapshots } from '../lib/core/store';
import { bodyWords } from '../lib/collect/phrases';
import type { Post } from '../lib/collect/tikhub';

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === 'meme-native');
  const raw = snaps[snaps.length - 1].raw as { posts?: Post[] };
  const posts = raw.posts ?? [];
  const byPhrase = new Map<string, Set<string>>();
  for (const p of posts) {
    const w = bodyWords(p.text || '');
    const a = p.authorId || p.authorName;
    if (!a) continue;
    const seen = new Set<string>();
    for (let n = 2; n <= 5; n++)
      for (let i = 0; i + n <= w.length; i++) {
        const t = w.slice(i, i + n).join(' ');
        if (seen.has(t)) continue;
        seen.add(t);
        (byPhrase.get(t) ?? byPhrase.set(t, new Set()).get(t)!).add(a);
      }
  }
  const dist = new Map<number, number>();
  for (const v of byPhrase.values()) dist.set(v.size, (dist.get(v.size) ?? 0) + 1);
  console.log('계정 수별 문구 개수');
  for (const k of [...dist.keys()].sort((a, b) => b - a).slice(0, 6)) console.log(`   계정 ${k}곳: ${dist.get(k)}개`);
  const perAccount = posts.length / new Set(posts.map((p) => p.authorId || p.authorName)).size;
  console.log(`\n계정당 게시물 ${perAccount.toFixed(2)}건 — 같은 사람이 여러 번 잡히지 않는다`);
  console.log('\n계정 2곳짜리 문구 12개 (문턱을 낮추면 뭐가 들어오나)');
  for (const [t, a] of [...byPhrase].filter(([, v]) => v.size === 2).slice(0, 12)) console.log(`   ${t}`);
}
main();
