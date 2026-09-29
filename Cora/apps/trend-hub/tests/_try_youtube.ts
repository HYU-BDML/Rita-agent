/**
 * 재검색에 붙인 유튜브가 실제로 쓸 만한 것을 주는지 본다. YouTube 할당량만 쓴다(무료).
 *   npx tsx --env-file=.env.local tests/_try_youtube.ts
 */
import { asPost, hasYouTube, searchVideos } from '../lib/collect/youtube';
import { WINDOW_DAYS } from '../lib/discoveries/character-native';

const NAMES = ['기침챌린지', 'BAD 챌린지', '권루트챌린지', '치이카와'];

async function main() {
  if (!hasYouTube()) return console.log('YOUTUBE_KEY 가 없습니다.');
  for (const name of NAMES) {
    try {
      const videos = await searchVideos(name, { max: 20, withinDays: WINDOW_DAYS });
      const posts = videos.map(asPost);
      const thumbs = posts.filter((p) => p.thumbnail).length;
      const named = posts.filter((p) => p.text.replace(/\s/g, '').includes(name.replace(/\s/g, ''))).length;
      const authors = new Set(posts.map((p) => p.authorId)).size;
      console.log(`${name.padEnd(14)} 영상 ${String(posts.length).padStart(2)}  썸네일 ${thumbs}  이름대조통과 ${named}  채널 ${authors}`);
      const one = posts.find((p) => p.thumbnail);
      if (one) console.log(`   예) ${one.text.slice(0, 44)} · ${one.thumbnail!.split('/').pop()}`);
    } catch (e) {
      console.log(`${name.padEnd(14)} 실패 ${(e as Error).message.slice(0, 80)}`);
    }
  }
}
main();
