/**
 * 저장된 카드뉴스 원고를 렌더 서버에 실제로 구워 본다.
 * 실행: npx tsx --env-file=.env.local tests/_bake.ts [겉모습]
 */
import { readFileSync } from 'node:fs';
import type { Card } from '../lib/producers/cardnews-native';
import { checkDeck, deckFromCards } from '../lib/producers/deck';
import { health, renderDeck } from '../lib/core/render';

async function main() {
  const style = process.argv[2] || 'gogumafarm';
  const db = JSON.parse(readFileSync('data/db.json', 'utf8')) as {
    products: { producerId: string; title: string; output: { cards?: Card[]; account?: string } }[];
  };
  const p = db.products.filter((x) => x.producerId === 'cardnews-native' && x.output.cards?.length).at(-1);
  if (!p) return console.log('구울 원고가 없습니다.');

  console.log('원고:', p.title, '·', p.output.cards!.length, '장');

  const h = await health();
  const deck = deckFromCards(p.output.cards!, {
    template: 'explain_box',
    style,
    account: p.output.account || '@트렌드허브',
  });

  const 검사 = checkDeck(deck, h);
  if (!검사.ok) return console.log('보내기 전에 막혔습니다:', 검사.reason);

  console.log('보내는 것:', JSON.stringify(deck).slice(0, 300), '…');
  const t = Date.now();
  const r = await renderDeck(deck);
  console.log(`구운 시간 ${((Date.now() - t) / 1000).toFixed(1)}초`);
  console.log(JSON.stringify(r, null, 1).slice(0, 1200));
}

main().catch((e) => {
  console.log('실패:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
