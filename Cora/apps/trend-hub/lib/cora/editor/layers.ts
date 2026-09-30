import { MAX_LAYERS, validateLayers, type Layer, type LayerType, type Slide } from '../model';

/**
 * Immutable layer helpers. Every function returns a new Slide and never mutates its input.
 * Video elements are not handled here: they belong to the video batch (per-scene motion/clip settings).
 * Locked layers refuse edits and removal (unlock first); reordering, hiding and locking stay allowed.
 */
export type MoveDirection = 'up' | 'down' | 'top' | 'bottom';
export type LayerPatch = Partial<Omit<Layer, 'id' | 'type'>>;

export const layersOf = (slide: Slide): Layer[] => slide.layers ?? [];
/** Layers from back (first) to front (last). Ties keep array order. */
export const orderedLayers = (slide: Slide): Layer[] => layersOf(slide).map((l, i) => ({ l, i })).sort((a, b) => a.l.z - b.l.z || a.i - b.i).map(x => x.l);
const withLayers = (slide: Slide, layers: Layer[]): Slide => {
  if (!layers.length) { const { layers: _drop, ...rest } = slide; void _drop; return rest; }
  return { ...slide, layers };
};
/** Renumbers z as 0..n-1 in the current stacking order. */
const dense = (layers: Layer[]): Layer[] => { const order = orderedLayers({ layers } as Slide); return layers.map(l => ({ ...l, z: order.indexOf(l) })); };
const find = (slide: Slide, id: string) => { const l = layersOf(slide).find(x => x.id === id); if (!l) throw new Error('요소를 찾을 수 없습니다.'); return l; };
const newId = () => globalThis.crypto.randomUUID();
const topZ = (slide: Slide) => layersOf(slide).reduce((m, l) => Math.max(m, l.z), -1) + 1;

const DEFAULTS: Record<LayerType, Omit<Layer, 'id' | 'z'>> = {
  text: { type: 'text', x: 140, y: 420, w: 800, h: 120, text: '새 텍스트', fontSize: 56, color: '#193b32', weight: 700, align: 'left' },
  shape: { type: 'shape', x: 140, y: 420, w: 400, h: 240, fill: '#eab895', radius: 24 },
  image: { type: 'image', x: 140, y: 420, w: 640, h: 400 },
  logo: { type: 'logo', x: 800, y: 60, w: 200, h: 120 },
};
/** Adds a layer on top. Image and logo layers need `init.src` (data:image png/jpeg/webp, at most 400KB). */
export function addLayer(slide: Slide, type: LayerType, init: LayerPatch = {}): Slide {
  if (!DEFAULTS[type]) throw new Error('지원하지 않는 요소 종류입니다.');
  if (layersOf(slide).length >= MAX_LAYERS) throw new Error(`요소는 ${MAX_LAYERS}개까지 추가할 수 있습니다.`);
  const layer = { ...DEFAULTS[type], ...init, id: newId(), z: topZ(slide) } as Layer;
  return withLayers(slide, dense(validateLayers([...layersOf(slide), layer])));
}
export function duplicateLayer(slide: Slide, id: string): Slide {
  const src = find(slide, id);
  if (layersOf(slide).length >= MAX_LAYERS) throw new Error(`요소는 ${MAX_LAYERS}개까지 추가할 수 있습니다.`);
  const { locked: _locked, ...rest } = src; void _locked; // a copy starts unlocked
  const copy: Layer = { ...rest, id: newId(), x: src.x + 40, y: src.y + 40, z: topZ(slide) };
  return withLayers(slide, dense(validateLayers([...layersOf(slide), copy])));
}
export function moveLayer(slide: Slide, id: string, dir: MoveDirection): Slide {
  find(slide, id);
  const order = orderedLayers(slide).map(l => l.id); const i = order.indexOf(id);
  const j = dir === 'up' ? Math.min(order.length - 1, i + 1) : dir === 'down' ? Math.max(0, i - 1) : dir === 'top' ? order.length - 1 : 0;
  order.splice(i, 1); order.splice(j, 0, id);
  return withLayers(slide, layersOf(slide).map(l => ({ ...l, z: order.indexOf(l.id) })));
}
export function updateLayer(slide: Slide, id: string, patch: LayerPatch): Slide {
  const cur = find(slide, id);
  const keys = Object.keys(patch);
  if (cur.locked && !keys.every(k => k === 'locked' || k === 'hidden')) throw new Error('잠긴 요소입니다. 잠금을 풀고 수정해 주세요.');
  const next = { ...cur, ...patch, id: cur.id, type: cur.type } as Layer;
  for (const k of Object.keys(next) as (keyof Layer)[]) if (next[k] === undefined) delete next[k];
  const layers = layersOf(slide).map(l => l.id === id ? next : l);
  return withLayers(slide, dense(validateLayers(layers)));
}
export function removeLayer(slide: Slide, id: string): Slide {
  const cur = find(slide, id);
  if (cur.locked) throw new Error('잠긴 요소입니다. 잠금을 풀고 삭제해 주세요.');
  return withLayers(slide, dense(layersOf(slide).filter(l => l.id !== id)));
}
export const toggleHidden = (slide: Slide, id: string): Slide => updateLayer(slide, id, { hidden: !find(slide, id).hidden });
export const toggleLocked = (slide: Slide, id: string): Slide => updateLayer(slide, id, { locked: !find(slide, id).locked });
