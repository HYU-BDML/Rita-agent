/**
 * 죽은 유튜브 썸네일 주소를 되살린다.
 *
 * `pickThumb` 이 `fhd` 를 가장 큰 단으로 골랐는데, API 가 그 칸을 주면서도 주소는
 * 서지 않는다 — 저장된 fhddefault 229장 중 표본 40장이 전부 404 였다. 화면에서는
 * 이미지 폴백이 지워 주므로 조용히 사라졌고, 그래서 아무도 몰랐다.
 *
 * 수집 쪽은 고쳤지만 이미 적힌 주소는 그대로다. 영상 id 는 살아 있으니 같은 영상의
 * 서는 단으로 갈아 끼운다. 큰 쪽부터 실제로 받아 보고 되는 것을 쓴다.
 *
 * **키를 직접 물려야 한다.** 이 스크립트는 Next 를 거치지 않으므로 .env.local 이
 * 저절로 읽히지 않는다. 안 물리면 Anthropic 호출이 인증 오류로 떨어지는데
 * scoreThumbs 가 그걸 삼켜서 '0장 판정'으로만 보인다 — 원인이 안 보인다.
 *   npx tsx --env-file=.env.local tests/이름.ts --go
 */
import { listPosts, upsertPosts } from '../lib/core/store';

const GO = process.argv.includes('--go');
const VARIANTS = ['maxresdefault.jpg', 'sddefault.jpg', 'hqdefault.jpg', 'mqdefault.jpg'];

async function alive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const posts = await listPosts();
  const dead = posts.filter((p) => p.thumbnailUrl?.endsWith('fhddefault.jpg'));
  console.log(`fhddefault 썸네일 ${dead.length}장`);
  if (!GO) return console.log('확인만 했습니다. 실제로 고치려면 --go');
  if (!dead.length) return;

  const fixed: typeof posts = [];
  let gone = 0;
  for (let i = 0; i < dead.length; i += 8) {
    const part = await Promise.all(
      dead.slice(i, i + 8).map(async (p) => {
        const base = p.thumbnailUrl!.replace(/fhddefault\.jpg$/, '');
        for (const v of VARIANTS) {
          if (await alive(base + v)) return { ...p, thumbnailUrl: base + v };
        }
        return null;
      }),
    );
    for (const p of part) {
      if (p) fixed.push(p);
      else gone += 1;
    }
    process.stdout.write(`\r  ${Math.min(i + 8, dead.length)}/${dead.length}`);
  }
  console.log();
  await upsertPosts(fixed);

  const by = new Map<string, number>();
  for (const p of fixed) {
    const v = p.thumbnailUrl!.split('/').pop()!;
    by.set(v, (by.get(v) ?? 0) + 1);
  }
  console.log(`${fixed.length}장 되살림 · ${[...by].map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  if (gone) console.log(`${gone}장은 어느 단도 서지 않았다 — 영상이 내려갔을 가능성이 높다.`);
}
main();
