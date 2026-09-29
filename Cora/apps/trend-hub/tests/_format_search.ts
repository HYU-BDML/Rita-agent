/**
 * 밈 2단계의 2·3번 — 뽑힌 포맷 이름으로 **다시 검색해 몇 계정이 하는지 센다.**
 *
 * 1번(`_formats.ts`)이 준 것은 이름뿐이다. 우리 표본에서는 전부 계정 1곳이라
 * 그것만으로는 후보가 못 된다. 이름을 검색창에 넣어 **남들도 하는지**를 확인하는
 * 자리가 여기다. 캐릭터 축이 이름을 원문 대조하는 것과 같은 자리이되,
 * 대조 상대가 저장된 자료가 아니라 **플랫폼 전체**다.
 *
 * 검색은 `searchTikTok` 을 그대로 쓴다 — region=KR · publish_time=30 이 이미 걸려 있다.
 * 이름 하나에 1콜. 기본은 견적, 부르려면 --go.
 */
import { promises as fs } from 'node:fs';
import { searchTikTok } from '../lib/collect/tikhub';

const GO = process.argv.includes('--go');
/** 후보로 세울 문턱. 밈은 여럿이 따라 하는 것이 정의라 1이면 의미가 없다 (사용자 결정). */
const MIN_ACCOUNTS = 3;
const OUT = () => `C:/Users/mooja/AppData/Local/Temp/format-search${process.argv.includes('--low') ? '-low' : ''}.json`;

/**
 * 2026-09-19 회차에서 뽑힌 confidence ≥0.5 목록.
 * (그때 스크립트가 저장을 안 해서 화면에 남은 것을 옮겼다. 지금은 저장한다.)
 */
const NAMES: { name: string; kind: string; conf: number }[] = [
  { name: '쇼츠 중독 테스트', kind: 'format', conf: 0.9 },
  { name: '남자 유행어 TOP4', kind: 'format', conf: 0.9 },
  { name: '배드챌린지', kind: 'challenge', conf: 0.85 },
  { name: '무한도전 챌린지', kind: 'challenge', conf: 0.85 },
  { name: '썬키스 챌린지', kind: 'challenge', conf: 0.6 },
  { name: 'face check meme', kind: 'format', conf: 0.6 },
  { name: '나는 이걸 이미 좋아해', kind: 'catchphrase', conf: 0.6 },
  { name: '스파이더맨 챌린지', kind: 'challenge', conf: 0.55 },
  { name: '핀터 입맛대로 그림그리기', kind: 'format', conf: 0.55 },
  { name: '기침챌린지', kind: 'challenge', conf: 0.5 },
  { name: '30일 복근 챌린지', kind: 'challenge', conf: 0.5 },
  { name: '연애의 조건 챌린지', kind: 'challenge', conf: 0.5 },
  { name: '이모지 따라하기', kind: 'format', conf: 0.5 },
  { name: '도우인 메이크업', kind: 'format', conf: 0.5 },
];

/** confidence <0.5 라 1차에서 잘라냈던 것들. --low 로 돈다. */
const LOW: { name: string; kind: string; conf: number }[] = [
  { name: '벨트 챌린지', kind: 'challenge', conf: 0.45 },
  { name: '요즘유행 끝말잇기', kind: 'format', conf: 0.45 },
  { name: '남자만 아는 기쁨', kind: 'format', conf: 0.45 },
  { name: '버블 챌린지', kind: 'challenge', conf: 0.4 },
  { name: '밤 감성 챌린지', kind: 'challenge', conf: 0.4 },
  { name: '아무거나 따라하기', kind: 'format', conf: 0.4 },
  { name: '사투리 성대모사', kind: 'format', conf: 0.4 },
  { name: '난 나를 보낼게', kind: 'ambiguous', conf: 0.4 },
  { name: '운전 밈', kind: 'ambiguous', conf: 0.35 },
  { name: '옷 자르는 밈', kind: 'ambiguous', conf: 0.35 },
  { name: '유행 막차타기', kind: 'ambiguous', conf: 0.3 },
];

const compact = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

async function main() {
  const LIST = process.argv.includes('--low') ? LOW : NAMES;
  console.log(`이름 ${LIST.length}개 · 1개당 1콜 · 약 $${(LIST.length * 0.03).toFixed(2)}\n`);
  if (!GO) {
    for (const n of LIST) console.log(`   ${n.conf.toFixed(2)}  ${n.kind.padEnd(11)} ${n.name}`);
    console.log('\n견적만 냈습니다. 실제로 부르려면 --go');
    return;
  }

  const rows: {
    name: string; kind: string; conf: number; hits: number; accounts: number;
    matched: number; matchedAccounts: number; samples: { account: string; text: string; url: string }[];
  }[] = [];

  for (const n of LIST) {
    let posts: Awaited<ReturnType<typeof searchTikTok>> = [];
    try {
      posts = await searchTikTok(n.name, 20);
    } catch (e) {
      console.log(`⚠ ${n.name}: ${e instanceof Error ? e.message.slice(0, 70) : String(e)}`);
      continue;
    }
    /*
     * **검색 결과를 그대로 믿지 않는다.** 검색은 느슨해서 이름과 무관한 것도 준다.
     * 이름이 캡션에 실제로 있는 것만 센다 — 캐릭터 축의 원문 대조와 같은 장치다.
     * 이 수가 검색 건수와 크게 벌어지면 그건 '이름이 약하다'는 뜻이다.
     */
    const k = compact(n.name);
    const matched = posts.filter((p) => compact(p.text).includes(k));
    rows.push({
      name: n.name, kind: n.kind, conf: n.conf,
      hits: posts.length,
      accounts: new Set(posts.map((p) => p.authorId)).size,
      matched: matched.length,
      matchedAccounts: new Set(matched.map((p) => p.authorId)).size,
      samples: (matched.length ? matched : posts).slice(0, 3).map((p) => ({
        account: p.authorId, text: p.text.replace(/\s+/g, ' ').slice(0, 62), url: p.url,
      })),
    });
    process.stdout.write(`  ${rows.length}/${LIST.length}\r`);
  }

  await fs.writeFile(OUT(), JSON.stringify(rows, null, 2), 'utf8');
  console.log(`\n결과 저장: ${OUT()}\n`);

  rows.sort((a, b) => b.matchedAccounts - a.matchedAccounts || b.accounts - a.accounts);
  console.log('■ 이름별 계정 수 (0곳부터 전부)');
  console.log(`   ${'이름'.padEnd(22)}검색  계정   이름대조  그중계정`);
  for (const r of rows) {
    console.log(
      `   ${r.name.padEnd(23)}${String(r.hits).padStart(3)}${String(r.accounts).padStart(6)}` +
        `${String(r.matched).padStart(9)}${String(r.matchedAccounts).padStart(9)}`,
    );
  }

  for (const n of [3, 2, 1]) {
    const pass = rows.filter((r) => r.matchedAccounts >= n);
    console.log(`\n■ N=${n} → 후보 ${pass.length}개${pass.length ? ': ' + pass.map((r) => r.name).join(' · ') : ''}`);
  }

  console.log('\n■ 재검색이 실제로 그 밈 영상인가 — 캡션 확인');
  for (const r of rows.slice(0, 8)) {
    console.log(`\n   ▶ "${r.name}"  이름대조 ${r.matched}/${r.hits}건 · 계정 ${r.matchedAccounts}곳`);
    for (const s of r.samples) console.log(`       @${(s.account || '?').slice(0, 16).padEnd(17)} ${s.text}`);
  }
}
main();
