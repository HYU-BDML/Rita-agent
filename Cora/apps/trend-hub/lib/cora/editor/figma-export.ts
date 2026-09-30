import { artwork } from '../artwork';
import { zip } from '../export';
import type { Draft } from '../model';

const enc = new TextEncoder();
const GAP = 80;
const pad = (n: number) => String(n).padStart(2, '0');
/** Inner markup of a card SVG, with clip/filter ids made unique per card so a combined file has no id collisions. */
function inner(svg: string, n: number) {
  const body = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'));
  return body.replace(/\bid="([^"]+)"/g, `id="c${n}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#c${n}-$1)`);
}
export const FIGMA_README = `Cora Figma 내보내기 안내

1. Figma 캔버스에 SVG 파일을 끌어다 놓거나 File > Place image를 선택해 파일을 고르면 벡터로 가져옵니다.
2. frames.svg는 모든 카드를 왼쪽에서 오른쪽으로 ${GAP}px 간격으로 나란히 놓은 파일입니다. 카드마다 그룹 이름이 card-01, card-02처럼 붙습니다.
3. card-01.svg부터의 파일은 카드 한 장씩입니다. 캔버스 너비는 1080px이고 높이는 화면 비율(4:5, 1:1, 9:16)에 따라 1350, 1080, 1920px입니다.
4. 글자는 윤곽선으로 바꾸지 않고 <text>로 남겨 두었으므로 Figma에서 글을 고칠 수 있습니다. 글꼴(Arial, Apple SD Gothic Neo, Malgun Gothic 또는 Georgia)이 설치되어 있지 않으면 Figma가 대체 글꼴로 보여 줄 수 있습니다.
5. 사진과 로고는 SVG 안에 데이터로 포함되어 있어 별도 파일이 필요 없습니다.
6. 이 파일은 사용자의 브라우저 밖으로 나가지 않는 로컬 변환 결과이며 Figma 계정과 연결되지 않습니다.
`;
export interface SvgExport { cards: { name: string; svg: string; overflow: boolean }[]; frames: string; readme: string; width: number; height: number }
export function figmaExport(d: Draft): SvgExport {
  const arts = d.slides.map((s, i) => artwork(s, d, i));
  const height = Number(/height="(\d+)"/.exec(arts[0].svg)![1]);
  const width = d.slides.length * 1080 + (d.slides.length - 1) * GAP;
  const groups = arts.map((a, i) => `<g id="card-${pad(i + 1)}" transform="translate(${i * (1080 + GAP)} 0)">${inner(a.svg, i + 1)}</g>`).join('');
  const frames = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${groups}</svg>`;
  return { cards: arts.map((a, i) => ({ name: `card-${pad(i + 1)}.svg`, svg: a.svg, overflow: a.overflow })), frames, readme: FIGMA_README, width, height };
}
export function figmaZip(d: Draft): Uint8Array {
  const e = figmaExport(d);
  return zip([
    ...e.cards.map(c => ({ name: `cards/${c.name}`, bytes: enc.encode(c.svg) })),
    { name: 'frames.svg', bytes: enc.encode(e.frames) },
    { name: 'README.txt', bytes: enc.encode(e.readme) },
  ]);
}
