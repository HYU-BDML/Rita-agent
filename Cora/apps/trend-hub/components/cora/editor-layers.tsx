'use client';

import { useState, type ChangeEvent } from 'react';
import type { Layer, LayerType, Slide } from '@/lib/cora/model';
import { MAX_LAYERS } from '@/lib/cora/model';
import { addLayer, duplicateLayer, moveLayer, orderedLayers, removeLayer, toggleHidden, toggleLocked, updateLayer, type LayerPatch } from '@/lib/cora/editor/layers';

const KIND: Record<LayerType, string> = { text: '텍스트', image: '이미지', logo: '로고', shape: '도형' };
const box = { display: 'grid', gap: 8, padding: 12, border: '1px solid #d9d6cb', borderRadius: 12, background: '#fff' } as const;
const row = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' } as const;
const btn = { padding: '4px 10px', border: '1px solid #b9b5a6', borderRadius: 8, background: '#f7f5ef', cursor: 'pointer' } as const;
const num = { width: 72 } as const;

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('PNG, JPEG, WebP 사진만 올릴 수 있습니다.'));
    if (file.size > 290_000) return reject(new Error('사진은 290KB 이하만 올릴 수 있습니다.'));
    const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('사진을 읽지 못했습니다.')); r.readAsDataURL(file);
  });
}

/** Layer list and property editor for one card. Every change goes through onChange with a new Slide. */
export function LayerPanel({ slide, onChange }: { slide: Slide; onChange: (s: Slide) => void }) {
  const [selectedId, setSelectedId] = useState(''); const [error, setError] = useState(''); const [pending, setPending] = useState<'image' | 'logo' | ''>('');
  const layers = orderedLayers(slide).slice().reverse(); // front layer first
  const selected = layers.find(l => l.id === selectedId) ?? null;
  const run = (fn: () => Slide) => { try { onChange(fn()); setError(''); } catch (e) { setError(e instanceof Error ? e.message : '요소를 바꾸지 못했습니다.'); } };
  const add = (type: LayerType) => run(() => { const next = addLayer(slide, type); setSelectedId(next.layers!.find(l => !slide.layers?.some(o => o.id === l.id))!.id); return next; });
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; const type = pending; e.target.value = ''; setPending('');
    if (!file || !type) return;
    try { const src = await readImage(file); const next = addLayer(slide, type, { src }); setSelectedId(next.layers!.find(l => !slide.layers?.some(o => o.id === l.id))!.id); onChange(next); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : '사진을 추가하지 못했습니다.'); }
  }
  const patch = (id: string, p: LayerPatch) => run(() => updateLayer(slide, id, p));
  const numField = (l: Layer, k: 'x' | 'y' | 'w' | 'h' | 'rotation' | 'fontSize' | 'radius', label: string) => (
    <label key={k} style={{ display: 'grid', gap: 2, fontSize: 13 }}>{label}
      <input type="number" aria-label={label} style={num} disabled={!!l.locked} value={l[k] ?? 0} onChange={e => { const n = e.currentTarget.valueAsNumber; if (Number.isFinite(n)) patch(l.id, { [k]: n }); }} />
    </label>);
  return (
    <section aria-label="요소 레이어" style={box}>
      <h3 style={{ margin: 0, fontSize: 16 }}>요소 추가와 순서 ({layers.length}/{MAX_LAYERS})</h3>
      <div style={row} role="group" aria-label="요소 추가">
        <button type="button" style={btn} onClick={() => add('text')}>텍스트 추가</button>
        <button type="button" style={btn} onClick={() => add('shape')}>도형 추가</button>
        <label style={btn}>이미지 추가<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="이미지 요소 사진 선택" hidden onClickCapture={() => setPending('image')} onChange={pick} /></label>
        <label style={btn}>로고 추가<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="로고 요소 사진 선택" hidden onClickCapture={() => setPending('logo')} onChange={pick} /></label>
      </div>
      {error && <p role="alert" style={{ margin: 0, color: '#a33' }}>{error}</p>}
      {!layers.length && <p style={{ margin: 0, color: '#53665c' }}>아직 추가한 요소가 없습니다. 위 버튼으로 텍스트, 이미지, 로고, 도형을 카드 위에 올릴 수 있습니다.</p>}
      <ul aria-label="요소 목록" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
        {layers.map((l, i) => {
          const name = `${KIND[l.type]} ${layers.length - i}${l.type === 'text' && l.text ? ` (${Array.from(l.text).slice(0, 8).join('')})` : ''}`;
          return (
            <li key={l.id} style={{ ...row, padding: 4, borderRadius: 8, background: l.id === selectedId ? '#e6efe9' : 'transparent', opacity: l.hidden ? 0.55 : 1 }}>
              <button type="button" style={{ ...btn, flex: 1, textAlign: 'left' }} aria-pressed={l.id === selectedId} aria-label={`${name} 선택`} onClick={() => setSelectedId(l.id)}>{name}{l.locked ? ' 잠김' : ''}{l.hidden ? ' 숨김' : ''}</button>
              <button type="button" style={btn} aria-label={`${name} 앞으로`} disabled={i === 0} onClick={() => run(() => moveLayer(slide, l.id, 'up'))}>위로</button>
              <button type="button" style={btn} aria-label={`${name} 뒤로`} disabled={i === layers.length - 1} onClick={() => run(() => moveLayer(slide, l.id, 'down'))}>아래로</button>
              <button type="button" style={btn} aria-label={`${name} 복제`} disabled={layers.length >= MAX_LAYERS} onClick={() => run(() => duplicateLayer(slide, l.id))}>복제</button>
              <button type="button" style={btn} aria-label={`${name} ${l.hidden ? '보이기' : '숨기기'}`} onClick={() => run(() => toggleHidden(slide, l.id))}>{l.hidden ? '보이기' : '숨기기'}</button>
              <button type="button" style={btn} aria-label={`${name} ${l.locked ? '잠금 해제' : '잠그기'}`} onClick={() => run(() => toggleLocked(slide, l.id))}>{l.locked ? '잠금 해제' : '잠그기'}</button>
              <button type="button" style={btn} aria-label={`${name} 삭제`} disabled={!!l.locked} onClick={() => run(() => { const n = removeLayer(slide, l.id); if (l.id === selectedId) setSelectedId(''); return n; })}>삭제</button>
            </li>);
        })}
      </ul>
      {selected && (
        <fieldset style={{ ...row, border: '1px solid #e2dfd3', borderRadius: 8 }} aria-label="선택한 요소 설정">
          <legend>{KIND[selected.type]} 설정 (캔버스 너비 1080px 기준)</legend>
          {numField(selected, 'x', '가로 위치 x')}{numField(selected, 'y', '세로 위치 y')}{numField(selected, 'w', '너비 w')}{numField(selected, 'h', '높이 h')}{numField(selected, 'rotation', '회전(도)')}
          <label style={{ display: 'grid', gap: 2, fontSize: 13 }}>불투명도(0~1)
            <input type="number" aria-label="불투명도" style={num} step={0.1} min={0} max={1} disabled={!!selected.locked} value={selected.opacity ?? 1} onChange={e => { const n = e.currentTarget.valueAsNumber; if (Number.isFinite(n)) patch(selected.id, { opacity: n }); }} />
          </label>
          {selected.type === 'text' && <>
            <label style={{ display: 'grid', gap: 2, fontSize: 13 }}>문구<textarea aria-label="요소 문구" rows={2} maxLength={300} disabled={!!selected.locked} value={selected.text ?? ''} onChange={e => patch(selected.id, { text: e.currentTarget.value })} /></label>
            {numField(selected, 'fontSize', '글자 크기')}
            <label style={{ display: 'grid', gap: 2, fontSize: 13 }}>글자 색<input type="color" aria-label="글자 색" disabled={!!selected.locked} value={selected.color ?? '#193b32'} onChange={e => patch(selected.id, { color: e.currentTarget.value })} /></label>
            <label style={{ display: 'grid', gap: 2, fontSize: 13 }}>글자 굵기<select aria-label="글자 굵기" disabled={!!selected.locked} value={selected.weight ?? 700} onChange={e => patch(selected.id, { weight: Number(e.currentTarget.value) as Layer['weight'] })}>{[400, 500, 600, 700, 800].map(w => <option key={w} value={w}>{w}</option>)}</select></label>
            <label style={{ display: 'grid', gap: 2, fontSize: 13 }}>정렬<select aria-label="요소 문자 정렬" disabled={!!selected.locked} value={selected.align ?? 'left'} onChange={e => patch(selected.id, { align: e.currentTarget.value as Layer['align'] })}><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label>
          </>}
          {selected.type === 'shape' && <>
            {numField(selected, 'radius', '모서리 둥글기')}
            <label style={{ display: 'grid', gap: 2, fontSize: 13 }}>채움 색<input type="color" aria-label="도형 채움 색" disabled={!!selected.locked} value={selected.fill ?? '#eab895'} onChange={e => patch(selected.id, { fill: e.currentTarget.value })} /></label>
          </>}
        </fieldset>)}
    </section>);
}
