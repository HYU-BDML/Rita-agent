import { access } from 'node:fs/promises';
import { run } from './ffmpeg';
import { hexColor } from './geometry';
/**
 * The FFmpeg build on this machine has no drawtext/libass, so text is rasterized to transparent PNGs
 * (Pillow + a Korean font) and composited with FFmpeg's overlay filter. Highlight keywords are colored per character run.
 */
export const FONT_CANDIDATES = ['/System/Library/Fonts/AppleSDGothicNeo.ttc', '/usr/share/fonts/truetype/nanum/NanumGothic.ttf', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc'];
export async function resolveFont(): Promise<string> {
  const configured = process.env.CORA_FONT_FILE;
  if (configured) { try { await access(configured); return configured; } catch { throw new Error(`CORA_FONT_FILE에 지정한 글꼴 파일을 찾을 수 없습니다: ${configured}`); } }
  for (const f of FONT_CANDIDATES) { try { await access(f); return f; } catch { /* next */ } }
  throw new Error('자막에 쓸 한글 글꼴을 찾을 수 없습니다. CORA_FONT_FILE 환경변수에 .ttf/.ttc/.otf 글꼴 경로를 지정해 주세요.');
}
export interface RasterJob {
  out: string; text: string; size: number; maxWidth: number; color?: string; highlight?: string; keyword?: string; bold?: boolean;
  /** 'subtitle' draws on a full canvas (canvasWidth x canvasHeight) with a dark box; 'block' crops to the text. */
  mode: 'subtitle' | 'block'; canvasWidth?: number; canvasHeight?: number; position?: 'bottom' | 'middle';
}
export const PY = String.raw`
import sys, json
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.stderr.write("PIL"); sys.exit(4)
req = json.load(sys.stdin); res = []
def rgb(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))
for j in req["jobs"]:
    try:
        font = ImageFont.truetype(req["font"], j["size"])
    except Exception:
        sys.stderr.write("FONT"); sys.exit(3)
    if j.get("bold"):
        try: font.set_variation_by_name("Bold")
        except Exception: pass
    text = j["text"]; kw = j.get("keyword") or ""
    base = rgb(j["color"]); hi = rgb(j["highlight"])
    cols = [base] * len(text)
    if kw:
        i = 0
        while True:
            k = text.find(kw, i)
            if k < 0: break
            for x in range(k, k + len(kw)): cols[x] = hi
            i = k + len(kw)
    lines = []; idx = 0
    for para in text.split("\n"):
        line = []; w = 0.0
        for ch in para:
            cw = font.getlength(ch)
            if w + cw > j["maxWidth"] and line:
                lines.append((line, w)); line = []; w = 0.0
            line.append((ch, cols[idx], cw)); w += cw; idx += 1
        lines.append((line, w)); idx += 1
    lh = int(j["size"] * 1.35); bw = int(max(w for _, w in lines)) + 1; bh = lh * len(lines)
    pad = int(j["size"] * .45)
    if j["mode"] == "subtitle":
        W, H = j["canvasWidth"], j["canvasHeight"]
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
        bx0 = (W - bw) // 2 - pad; bx1 = bx0 + bw + 2 * pad
        by1 = int(H * .88) if j.get("position", "bottom") == "bottom" else (H + bh) // 2 + pad
        by0 = by1 - bh - 2 * pad
        d.rounded_rectangle((bx0, by0, bx1, by1), radius=pad, fill=(0, 0, 0, 150)); ox = (W - bw) // 2; oy = by0 + pad
        size = (W, H)
    else:
        img = Image.new("RGBA", (bw + 2 * pad, bh + 2 * pad), (0, 0, 0, 0)); d = ImageDraw.Draw(img); ox = pad; oy = pad
        size = img.size
    for n, (line, w) in enumerate(lines):
        x = ox + (bw - w) / 2; y = oy + n * lh
        for ch, c, cw in line:
            d.text((x, y), ch, font=font, fill=c + (255,), stroke_width=max(1, j["size"] // 18), stroke_fill=(0, 0, 0, 255)); x += cw
    img.save(j["out"]); res.append({"out": j["out"], "width": size[0], "height": size[1]})
print(json.dumps(res))
`;
export async function rasterize(jobs: RasterJob[]): Promise<{ out: string; width: number; height: number }[]> {
  const font = await resolveFont();
  const payload = JSON.stringify({ font, jobs: jobs.map(j => ({ ...j, color: hexColor(j.color, '#ffffff'), highlight: hexColor(j.highlight, '#ffd84d') })) });
  try {
    const { stdout } = await run(process.env.CORA_PYTHON || 'python3', ['-c', PY], { input: payload, timeoutMs: 30000, failMessage: '글자 이미지를 만들지 못했습니다.' });
    return JSON.parse(stdout);
  } catch (e) {
    const stderr = (e as { stderr?: string }).stderr ?? '';
    if (stderr.includes('PIL')) throw new Error('글자 이미지를 만들려면 Python Pillow가 필요합니다. pip install pillow 후 다시 시도해 주세요.');
    if (stderr.includes('FONT')) throw new Error('자막 글꼴 파일을 열 수 없습니다. CORA_FONT_FILE이 올바른 글꼴인지 확인해 주세요.');
    throw e;
  }
}
