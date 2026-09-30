import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDraft, validateLayers, type Layer, type Slide } from '../lib/cora/model';
import { artwork } from '../lib/cora/artwork';
import { addLayer, duplicateLayer, moveLayer, orderedLayers, removeLayer, toggleHidden, toggleLocked, updateLayer } from '../lib/cora/editor/layers';
import { CoraStore } from '../lib/cora/store';
import { listRevisions, restoreRevision } from '../lib/cora/editor/revisions';
import { figmaExport, figmaZip } from '../lib/cora/editor/figma-export';
import { IMG, oldDraft } from './cora-editor-fixtures';

const text = (id: string, z: number, over: Partial<Layer> = {}): Layer => ({ id, type: 'text', x: 100, y: 500, w: 600, h: 100, z, text: 'hello', fontSize: 40, color: '#112233', weight: 700, align: 'left', ...over });
const baseSlide = (): Slide => ({ id: 's', headline: 'h', body: 'b' });
const deepFreeze = <T,>(o: T): T => { if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };

test('Backward compatibility: 217 old-style card renders are byte-identical to the SVG from git HEAD artwork.ts', () => {
  const g = JSON.parse(readFileSync(new URL('./cora-editor-golden.json', import.meta.url), 'utf8')) as { cases: { name: string; draft: ReturnType<typeof oldDraft>; index: number; svg: string }[] };
  assert.equal(g.cases.length, 217);
  for (const c of g.cases) assert.equal(artwork(c.draft.slides[c.index], c.draft, c.index).svg, c.svg, c.name);
});
test('Backward compatibility: old drafts validate and gain no layers key', () => {
  const v = validateDraft(oldDraft());
  for (const s of v.slides) assert.ok(!('layers' in s));
  assert.ok(!artwork(v.slides[0], v, 0).svg.includes('data-layer-id'));
});

test('Validation: accepts every layer type and refuses unknown types, bad limits and more than 12 layers', () => {
  const ok = [text('t', 0), { id: 'i', type: 'image', x: 0, y: 0, w: 100, h: 100, z: 1, src: IMG }, { id: 'l', type: 'logo', x: 0, y: 0, w: 100, h: 100, z: 2, src: IMG, opacity: 0.5, rotation: -20, locked: true, hidden: false }, { id: 's', type: 'shape', x: 0, y: 0, w: 100, h: 100, z: 3, fill: '#aabbcc', radius: 20 }];
  assert.equal(validateLayers(ok).length, 4);
  const bad: unknown[] = [
    { ...text('v', 0), type: 'video' }, { ...text('v', 0), type: 'sticker' }, text('', 0), { ...text('v', 0), w: 0 }, { ...text('v', 0), x: NaN }, { ...text('v', 0), x: 99999 },
    { ...text('v', 0), opacity: 1.5 }, { ...text('v', 0), rotation: 400 }, { ...text('v', 0), z: 1.5 }, { ...text('v', 0), z: -1 },
    { ...text('v', 0), text: 'x'.repeat(301) }, { ...text('v', 0), fontSize: 4 }, { ...text('v', 0), fontSize: 900 }, { ...text('v', 0), color: 'red' },
    { ...text('v', 0), weight: 300 }, { ...text('v', 0), align: 'justify' }, { ...text('v', 0), locked: 'yes' },
    { id: 'i', type: 'image', x: 0, y: 0, w: 1, h: 1, z: 0 }, { id: 'i', type: 'image', x: 0, y: 0, w: 1, h: 1, z: 0, src: 'https://x.test/a.png' },
    { id: 'i', type: 'image', x: 0, y: 0, w: 1, h: 1, z: 0, src: 'data:image/svg+xml;base64,AAAA' }, { id: 'i', type: 'logo', x: 0, y: 0, w: 1, h: 1, z: 0, src: 'data:image/png;base64,' + 'A'.repeat(400000) },
    { id: 's', type: 'shape', x: 0, y: 0, w: 1, h: 1, z: 0, fill: 'nope', radius: 0 }, null, 'x', [],
  ];
  for (const b of bad) assert.throws(() => validateLayers([b]), /요소|사진|지원/, JSON.stringify(b)?.slice(0, 80));
  assert.throws(() => validateLayers([text('a', 0), text('a', 1)]), /중복/);
  assert.throws(() => validateLayers('x'), /12개/);
  assert.equal(validateLayers(Array.from({ length: 12 }, (_, i) => text('n' + i, i))).length, 12);
  assert.throws(() => validateLayers(Array.from({ length: 13 }, (_, i) => text('n' + i, i))), /12개/);
  const v = validateLayers([{ ...text('k', 0), extra: 'dropped', src: IMG }]);
  assert.ok(!('extra' in v[0]) && !('src' in v[0]));
});
test('Validation: validateDraft validates layers per card', () => {
  const d = oldDraft(); d.slides[0].layers = [text('t', 0)];
  assert.equal(validateDraft(d).slides[0].layers![0].text, 'hello');
  d.slides[0].layers = [{ ...text('t', 0), type: 'video' as never }];
  assert.throws(() => validateDraft(d), /지원하지 않는/);
});

test('Render: layers draw after the card in z order, hidden layers are skipped, canvas clip applied', () => {
  const d = oldDraft(); const s: Slide = { ...d.slides[0], layers: [text('top', 5, { text: 'TOPTEXT' }), text('bottom', 1, { text: 'BOTTOMTEXT' }), text('gone', 3, { text: 'HIDDENTEXT', hidden: true }), { id: 'sh', type: 'shape', x: 10, y: 10, w: 50, h: 50, z: 3, fill: '#ff0000', radius: 999 }] };
  const svg = artwork(s, d, 0).svg;
  assert.ok(svg.indexOf('BOTTOMTEXT') < svg.indexOf('TOPTEXT'));
  assert.ok(svg.indexOf(d.slides[0].headline) < svg.indexOf('BOTTOMTEXT'), 'layers sit on top of the card text');
  assert.ok(!svg.includes('HIDDENTEXT'));
  assert.match(svg, /<rect x="10" y="10" width="50" height="50" rx="25" fill="#ff0000"\/>/);
  assert.match(svg, /clip-path="url\(#canvas-clip\)"/);
  assert.match(svg, /<clipPath id="canvas-clip"><rect width="1080" height="1350"\/>/);
  s.layers![0] = { ...s.layers![0], rotation: 30, opacity: 0.4, align: 'center' };
  const r = artwork(s, d, 0).svg; assert.match(r, /transform="rotate\(30 400 550\)" opacity="0.4"/); assert.match(r, /text-anchor="middle"/);
});
test('Render: text is escaped, image layers use data URIs with meet/slice, layer id cannot break out of attributes', () => {
  const d = oldDraft(); const s: Slide = { ...d.slides[0], layers: [text('a"><script>x</script>', 0, { text: '<script>alert(1)</script> & "q"', w: 4000 }), { id: 'im', type: 'image', x: 0, y: 0, w: 100, h: 100, z: 1, src: IMG }, { id: 'lo', type: 'logo', x: 0, y: 0, w: 100, h: 100, z: 2, src: IMG }] };
  const svg = artwork(s, d, 0).svg;
  assert.ok(!svg.includes('<script>'));
  assert.match(svg, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;q&quot;/);
  assert.match(svg, /preserveAspectRatio="xMidYMid slice" clip-path="url\(#layer-clip-2\)"/);
  assert.match(svg, /preserveAspectRatio="xMidYMid meet" clip-path="url\(#layer-clip-3\)"/);
  assert.ok(svg.includes(IMG));
  assert.ok(!/<[a-z]+[^>]*<script/.test(svg));
});
test('Render: 1:1 and 9:16 canvases size the canvas clip and long layer text wraps into several lines', () => {
  const d = oldDraft({ design: { ratio: '9:16', template: 'minimal', font: 'serif', textScale: 1 } });
  const s: Slide = { ...d.slides[0], layers: [text('w', 0, { text: '가'.repeat(60), w: 400, fontSize: 40 })] };
  const svg = artwork(s, d, 0).svg;
  assert.match(svg, /<clipPath id="canvas-clip"><rect width="1080" height="1920"\/>/);
  assert.ok((svg.match(/data-layer-type="text"><text/g) ?? []).length === 1 && (svg.match(/<text x="100" y="\d+" text-anchor="start" fill="#112233"/g) ?? []).length > 1);
  assert.match(svg, /<g clip-path="url\(#canvas-clip\)" font-family="Georgia/);
});

test('Helpers: immutable, add/duplicate/move/update/remove/hide/lock behave and outputs always validate', () => {
  const s0 = deepFreeze(baseSlide());
  let s = addLayer(s0, 'text'); s = addLayer(s, 'shape'); s = addLayer(s, 'image', { src: IMG }); s = addLayer(s, 'logo', { src: IMG });
  assert.ok(!('layers' in s0)); assert.equal(s.layers!.length, 4);
  assert.deepEqual(orderedLayers(s).map(l => l.type), ['text', 'shape', 'image', 'logo']);
  assert.deepEqual(s.layers!.map(l => l.z), [0, 1, 2, 3]);
  deepFreeze(s);
  const [t, sh, im] = s.layers!;
  assert.deepEqual(orderedLayers(moveLayer(s, t.id, 'top')).map(l => l.type), ['shape', 'image', 'logo', 'text']);
  assert.deepEqual(orderedLayers(moveLayer(s, im.id, 'up')).map(l => l.type), ['text', 'shape', 'logo', 'image']);
  assert.deepEqual(orderedLayers(moveLayer(s, im.id, 'down')).map(l => l.type), ['text', 'image', 'shape', 'logo']);
  assert.deepEqual(orderedLayers(moveLayer(s, im.id, 'bottom')).map(l => l.type), ['image', 'text', 'shape', 'logo']);
  assert.deepEqual(orderedLayers(moveLayer(s, t.id, 'down')).map(l => l.type), ['text', 'shape', 'image', 'logo'], 'already at bottom');
  const d = duplicateLayer(s, sh.id); assert.equal(d.layers!.length, 5); const copy = orderedLayers(d).at(-1)!;
  assert.notEqual(copy.id, sh.id); assert.equal(copy.x, sh.x + 40); assert.equal(copy.fill, sh.fill);
  const u = updateLayer(s, t.id, { text: 'changed', x: 5 }); assert.equal(u.layers![0].text, 'changed'); assert.equal(s.layers![0].text, '새 텍스트'); assert.notEqual(u.layers, s.layers);
  assert.throws(() => updateLayer(s, t.id, { fontSize: 1 }), /요소/);
  assert.throws(() => updateLayer(s, 'missing', { x: 1 }), /찾을 수/);
  const h = toggleHidden(s, t.id); assert.equal(h.layers![0].hidden, true); assert.equal(toggleHidden(h, t.id).layers![0].hidden, false);
  const l = toggleLocked(s, t.id); assert.equal(l.layers![0].locked, true);
  assert.throws(() => updateLayer(l, t.id, { x: 1 }), /잠긴/); assert.throws(() => removeLayer(l, t.id), /잠긴/);
  assert.equal(updateLayer(l, t.id, { locked: false }).layers![0].locked, false);
  assert.equal(duplicateLayer(l, t.id).layers!.at(-1)!.locked, undefined, 'copy starts unlocked');
  const r = removeLayer(s, sh.id); assert.equal(r.layers!.length, 3); assert.deepEqual(r.layers!.map(x => x.z).sort(), [0, 1, 2]);
  assert.ok(!('layers' in removeLayer(removeLayer(removeLayer(removeLayer(s, t.id), sh.id), im.id), s.layers![3].id)));
  assert.throws(() => addLayer(s0, 'image'), /사진/);
  assert.throws(() => addLayer(s0, 'video' as never), /지원하지 않는/);
  let full = s0; for (let i = 0; i < 12; i++) full = addLayer(full, 'shape');
  assert.throws(() => addLayer(full, 'shape'), /12개/); assert.throws(() => duplicateLayer(full, full.layers![0].id), /12개/);
  validateLayers(full.layers);
});

const draftOf = (label: string) => oldDraft({ caption: label });
test('History: only the owner sees versions, restore returns the right body without saving, stale currentVersion conflicts', () => {
  const s = new CoraStore(':memory:');
  try {
    const a = s.signup('a@example.test', 'pw-aaaaaaaa'), b = s.signup('b@example.test', 'pw-bbbbbbbb');
    const p1 = s.save(a.id, draftOf('첫 번째 캡션'))!;
    const d2 = draftOf('두 번째 캡션'); d2.slides[0] = { ...d2.slides[0], layers: [text('t', 0)] };
    const p2 = s.save(a.id, d2, p1.id, 1)!; const p3 = s.save(a.id, draftOf('세 번째 캡션 '.repeat(20)), p1.id, 2)!;
    const list = listRevisions(s, a.id, p1.id);
    assert.deepEqual(list.map(r => r.version), [3, 2, 1]); assert.deepEqual(list.map(r => r.current), [true, false, false]);
    assert.equal(list[0].slideCount, 4); assert.equal(list[2].captionPreview, '첫 번째 캡션'); assert.ok(list[0].captionPreview.length <= 60);
    assert.throws(() => listRevisions(s, b.id, p1.id), /NOT_FOUND/); assert.throws(() => listRevisions(s, a.id, 'nope'), /NOT_FOUND/);
    const r = restoreRevision(s, a.id, p1.id, 2, 3);
    assert.equal(r.draft.caption, '두 번째 캡션'); assert.equal(r.draft.slides[0].layers![0].text, 'hello'); assert.equal(r.restoredVersion, 2);
    assert.equal(s.get(a.id, p1.id)!.version, 3, 'restore does not save'); assert.equal(s.get(a.id, p1.id)!.caption.startsWith('세 번째'), true);
    assert.equal(restoreRevision(s, a.id, p1.id, 1, 3).draft.caption, '첫 번째 캡션');
    assert.throws(() => restoreRevision(s, b.id, p1.id, 1, 3), /NOT_FOUND/);
    assert.throws(() => restoreRevision(s, a.id, p1.id, 1, 2), /CONFLICT/);
    assert.throws(() => restoreRevision(s, a.id, p1.id, 9, 3), /NOT_FOUND/);
    assert.throws(() => restoreRevision(s, a.id, p1.id, 0, 3), /버전/);
    const saved = s.save(a.id, { ...r.draft }, p1.id, 3)!; assert.equal(saved.version, 4); assert.equal(listRevisions(s, a.id, p1.id).length, 4);
    void p2; void p3;
  } finally { s.close(); }
});
test('History: restoring a ready version comes back as draft status', () => {
  const s = new CoraStore(':memory:');
  try { const a = s.signup('r@example.test', 'pw-rrrrrrrr'); const p = s.save(a.id, oldDraft({ workStatus: 'ready' }))!; assert.equal(restoreRevision(s, a.id, p.id, 1, 1).draft.workStatus, 'draft'); } finally { s.close(); }
});

function readZip(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const out: Record<string, string> = {}; let o = 0;
  while (dv.getUint32(o, true) === 0x04034b50) { const size = dv.getUint32(o + 18, true), nl = dv.getUint16(o + 26, true); const name = new TextDecoder().decode(bytes.subarray(o + 30, o + 30 + nl)); out[name] = new TextDecoder().decode(bytes.subarray(o + 30 + nl, o + 30 + nl + size)); o += 30 + nl + size; }
  return out;
}
test('Figma export: one SVG per card, frames.svg with 80px gaps, text kept as <text>, unique ids, README included', () => {
  const d = oldDraft(); d.slides[1] = { ...d.slides[1], layers: [text('t', 0, { text: '레이어 글자' })] };
  const e = figmaExport(d);
  assert.equal(e.cards.length, 4); assert.deepEqual(e.cards.map(c => c.name), ['card-01.svg', 'card-02.svg', 'card-03.svg', 'card-04.svg']);
  assert.equal(e.width, 4 * 1080 + 3 * 80); assert.equal(e.height, 1350);
  assert.match(e.frames, /^<svg [^>]*width="4560" height="1350" viewBox="0 0 4560 1350"/);
  for (let i = 0; i < 4; i++) assert.ok(e.frames.includes(`<g id="card-0${i + 1}" transform="translate(${i * 1160} 0)">`), String(i));
  assert.ok(e.frames.includes('레이어 글자') && e.cards[1].svg.includes('<text '));
  assert.ok(!e.frames.includes('<path'), 'text is not outlined');
  const ids = [...e.frames.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]); assert.equal(new Set(ids).size, ids.length, 'ids unique in combined file');
  for (const m of e.frames.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(m[1]), 'dangling ' + m[1]);
  assert.equal((e.frames.match(/<svg/g) ?? []).length, 1);
  assert.match(e.readme, /Figma/); assert.match(e.readme, /80px/); assert.match(e.readme, /<text>/);
  const z = readZip(figmaZip(d));
  assert.deepEqual(Object.keys(z), ['cards/card-01.svg', 'cards/card-02.svg', 'cards/card-03.svg', 'cards/card-04.svg', 'frames.svg', 'README.txt']);
  assert.equal(z['frames.svg'], e.frames); assert.equal(z['cards/card-02.svg'], e.cards[1].svg);
});
