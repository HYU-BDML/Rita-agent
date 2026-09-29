/** 생성기가 실제로 받는 원고 재료. 헤드라인만 가고 있지 않은지 눈으로 본다. */
import { listCandidates } from '../lib/core/store';
import { cardnewsNativeProducer } from '../lib/producers/cardnews-native';

async function main() {
  const want = process.argv[2] ?? '';
  const cands = (await listCandidates()).filter((c) => c.subject.includes(want));
  const c = cands.find((x) => cardnewsNativeProducer.gate(x).ok) ?? cands[0];
  if (!c) return console.log('후보 없음');
  console.log(`# ${c.subject} (${c.origin.discoveryId})\n`);
  console.log(String(cardnewsNativeProducer.mapInputs(c).material));
}
main();
