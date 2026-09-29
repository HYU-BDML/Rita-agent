/** YouTube 응답에 썸네일이 어느 칸으로 오는지만 본다. 무료 할당량(search 100 + videos 1). */
async function main() {
  const key = process.env.YOUTUBE_KEY?.trim();
  if (!key) throw new Error('YOUTUBE_KEY 없음');
  const s = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent('치이카와')}&type=video&maxResults=1&key=${key}`,
  ).then((r) => r.json());
  const id = s?.items?.[0]?.id?.videoId;
  console.log('videoId:', id);
  const v = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${id}&key=${key}`,
  ).then((r) => r.json());
  const sn = v?.items?.[0]?.snippet ?? {};
  console.log('snippet 키:', Object.keys(sn).join(' · '));
  const th = sn.thumbnails ?? {};
  console.log('thumbnails 키:', Object.keys(th).join(' · '));
  for (const k of Object.keys(th)) console.log(`  ${k}: ${th[k]?.width}x${th[k]?.height} ${String(th[k]?.url).slice(0, 70)}`);
}
main();

export {};
