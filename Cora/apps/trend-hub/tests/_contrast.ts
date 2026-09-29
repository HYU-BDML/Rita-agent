import { THEMES, contrast, MIN_BODY, MIN_TITLE } from '../lib/cardnews/themes';
function main() {
  console.log(`  문턱: 제목 ${MIN_TITLE}:1 · 본문 ${MIN_BODY}:1\n`);
  for (const t of THEMES) {
    const ti = contrast(t.fg, t.bg), bo = contrast(t.sub, t.bg), ac = contrast(t.accent, t.bg);
    console.log(
      `  ${t.name.padEnd(9)} ${t.dark ? '어둠' : '밝음'}   제목 ${String(ti).padStart(5)}   본문 ${String(bo).padStart(5)}   강조 ${String(ac).padStart(5)}`,
    );
  }
}
main();
