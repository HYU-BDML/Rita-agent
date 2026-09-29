async function main() {
  const res = await fetch('https://api.tikhub.io/api/v1/instagram/v2/search_reels?' + new URLSearchParams({ keyword: '자캐', count: '5' }), {
    headers: { Authorization: `Bearer ${process.env.TIKHUB_KEY}` },
  });
  const j = await res.json() as any;
  const dd = j.data.data;
  console.log('data.data 키:', Object.keys(dd).join(', '));
  for (const [k, v] of Object.entries(dd)) {
    if (Array.isArray(v)) {
      console.log(`  data.data.${k} = array(${v.length})`);
      if (v.length) {
        console.log('    항목 키:', Object.keys(v[0] as any).slice(0, 14).join(', '));
        const m = (v[0] as any).media ?? v[0];
        console.log('    media 키:', Object.keys(m).slice(0, 20).join(', '));
        console.log('    user:', JSON.stringify((m as any).user ?? {}).slice(0, 160));
        console.log('    caption:', JSON.stringify((m as any).caption ?? {}).slice(0, 160));
      }
    }
  }
}
main();
