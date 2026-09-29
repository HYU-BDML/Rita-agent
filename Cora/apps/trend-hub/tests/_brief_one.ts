/** 후보 하나의 계약 JSON 전문. 호출 없음. */
import { listCandidates, postsFor } from '../lib/core/store';
import { toTopic } from '../lib/core/brief';

async function main() {
  const want = process.argv[2] ?? '기침챌린지';
  const c = (await listCandidates()).find((x) => x.subject === want || x.id === want);
  if (!c) return console.log(`후보를 못 찾았습니다: ${want}`);
  console.log(JSON.stringify(toTopic(c, await postsFor(c.id)), null, 2));
}
main();
