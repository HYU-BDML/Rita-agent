'use client';
import { useCallback, useEffect, useState } from 'react';
import s from './studio.module.css';
/** Not mounted yet: the lead mounts <VideoOptions/> beside the existing MP4 button and the other panels in the video section. */
export type VideoOptionsValue = { ratio: '9:16' | '4:5' | '1:1'; lang: 'kor' | 'eng'; track: boolean; burn: boolean; strict: boolean; bgmId: string; volume: number; fadeOut: number };
export const defaultVideoOptions: VideoOptionsValue = { ratio: '9:16', lang: 'kor', track: true, burn: false, strict: false, bgmId: '', volume: .4, fadeOut: 2 };
/** Body fields to merge into POST /api/cora/video. Per-scene keyword goes in scenes[i].keyword; per-frame media in media[]. */
export const renderFields = (o: VideoOptionsValue) => ({ ratio: o.ratio, lang: o.lang, subtitles: { track: o.track, burn: o.burn }, strict: o.strict, ...(o.bgmId ? { bgm: { id: o.bgmId, volume: o.volume, fadeOut: o.fadeOut } } : {}) });
async function call(url: string, method = 'GET', data?: unknown) { const r = await fetch(url, { method, headers: data ? { 'Content-Type': 'application/json' } : undefined, body: data ? JSON.stringify(data) : undefined }); const v = await r.json(); if (!r.ok) throw Object.assign(new Error(v.error || '요청 실패'), { status: r.status, body: v }); return v; }
type Audio = { id: string; name: string; license: string; duration: number };
export function VideoOptions({ value, onChange }: { value: VideoOptionsValue; onChange: (v: VideoOptionsValue) => void }) {
  const [audio, setAudio] = useState<Audio[]>([]), [license, setLicense] = useState(''), [error, setError] = useState('');
  const load = useCallback(async () => setAudio((await call('/api/cora/video-audio')).audio), []);
  useEffect(() => { void load().catch(e => setError(e.message)); }, [load]);
  const set = (p: Partial<VideoOptionsValue>) => onChange({ ...value, ...p });
  async function upload(f: File | undefined) {
    if (!f) return; setError('');
    try { const buf = new Uint8Array(await f.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      const r = await call('/api/cora/video-audio', 'POST', { name: f.name, data: btoa(bin), license }); await load(); set({ bgmId: r.audio.id }); } catch (e) { setError((e as Error).message); }
  }
  return <section className={s.panel}><h3>영상 비율·자막·배경음악</h3>{error && <p role="alert">{error}</p>}
    <label>영상 비율<select aria-label="영상 비율" value={value.ratio} onChange={e => set({ ratio: e.target.value as VideoOptionsValue['ratio'] })}><option value="9:16">9:16 (1080×1920)</option><option value="4:5">4:5 (1080×1350)</option><option value="1:1">1:1 (1080×1080)</option></select></label>
    <label>자막 언어<select aria-label="자막 언어" value={value.lang} onChange={e => set({ lang: e.target.value as 'kor' | 'eng' })}><option value="kor">한국어</option><option value="eng">English</option></select></label>
    <label><input type="checkbox" checked={value.track} onChange={e => set({ track: e.target.checked })} /> 선택형 자막 트랙 넣기</label>
    <label><input type="checkbox" checked={value.burn} onChange={e => set({ burn: e.target.checked })} /> 자막을 화면에 새기기(장면별 강조 단어는 노란색)</label>
    <label><input type="checkbox" checked={value.strict} onChange={e => set({ strict: e.target.checked })} /> 이용 조건 메모가 없는 미디어가 있으면 렌더 중단</label>
    <label>배경음악<select aria-label="배경음악" value={value.bgmId} onChange={e => set({ bgmId: e.target.value })}><option value="">없음</option>{audio.map(a => <option key={a.id} value={a.id}>{a.name} ({a.duration}초)</option>)}</select></label>
    <label>볼륨 {value.volume}<input type="range" min={0} max={1} step={.05} value={value.volume} onChange={e => set({ volume: Number(e.target.value) })} /></label>
    <label>끝 페이드 아웃 (초)<input type="number" min={0} max={10} value={value.fadeOut} onChange={e => set({ fadeOut: Number(e.target.value) })} /></label>
    <label>새 음악의 이용 조건(라이선스) 메모<input aria-label="음악 라이선스 메모" maxLength={200} value={license} onChange={e => setLicense(e.target.value)} /></label>
    <label>mp3·m4a·wav 올리기 (10MB 이하)<input aria-label="배경음악 파일" type="file" accept=".mp3,.m4a,.wav,audio/*" disabled={!license.trim()} onChange={e => void upload(e.target.files?.[0])} /></label>
    <p className={s.hint}>이용 조건 메모를 먼저 적어야 올릴 수 있습니다. 음악이 영상보다 짧으면 반복하고 길면 잘라냅니다.</p></section>;
}
type Template = { id: string; name: string; version: number };
/** Template list for a rendered video: save from its saved settings, apply to N scenes, delete. `onApply` receives settings to merge into the editor. */
export function VideoTemplates({ videoId, sceneCount, onApply }: { videoId?: string; sceneCount: number; onApply: (settings: Record<string, unknown>, warnings: string[]) => void }) {
  const [list, setList] = useState<Template[]>([]), [name, setName] = useState(''), [error, setError] = useState('');
  const load = useCallback(async () => setList((await call('/api/cora/video-templates')).templates), []);
  useEffect(() => { void load().catch(e => setError(e.message)); }, [load]);
  const guard = (f: () => Promise<void>) => async () => { setError(''); try { await f(); await load(); } catch (e) { setError((e as Error).message); } };
  return <section className={s.panel}><h3>영상 템플릿</h3>{error && <p role="alert">{error}</p>}
    <label>템플릿 이름<input aria-label="템플릿 이름" maxLength={60} value={name} onChange={e => setName(e.target.value)} /></label>
    <button className={s.secondary} disabled={!videoId || !name.trim()} onClick={guard(async () => { await call('/api/cora/video-templates', 'POST', { name, fromVideoId: videoId }); setName(''); })}>방금 만든 영상으로 템플릿 저장</button>
    <ul>{list.map(t => <li key={t.id}>{t.name} (버전 {t.version}) <button onClick={guard(async () => { const r = await call(`/api/cora/video-templates/${t.id}/apply`, 'POST', { sceneCount }); onApply(r.settings, r.warnings); })}>적용</button> <button onClick={guard(async () => { await call(`/api/cora/video-templates/${t.id}`, 'DELETE'); })}>삭제</button></li>)}</ul></section>;
}
/** Motion graphic form: title + up to 6 lines, 5-30 s. `onDone` gets the download url. */
export function MotionMaker({ options, onDone }: { options: VideoOptionsValue; onDone: (url: string) => void }) {
  const [title, setTitle] = useState(''), [lines, setLines] = useState(''), [seconds, setSeconds] = useState(10), [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <section className={s.panel}><h3>글자만으로 모션그래픽 영상</h3>{error && <p role="alert">{error}</p>}
    <label>제목 (40자 이하)<input aria-label="모션 제목" maxLength={40} value={title} onChange={e => setTitle(e.target.value)} /></label>
    <label>본문 줄 (한 줄에 하나, 최대 6줄)<textarea aria-label="모션 본문 줄" rows={6} value={lines} onChange={e => setLines(e.target.value)} /></label>
    <label>길이 (5~30초)<input aria-label="모션 길이" type="number" min={5} max={30} value={seconds} onChange={e => setSeconds(Number(e.target.value))} /></label>
    <button className={s.secondary} disabled={busy || !title.trim()} onClick={async () => { setBusy(true); setError(''); try { const r = await call('/api/cora/video-motion', 'POST', { title, lines: lines.split('\n').map(x => x.trim()).filter(Boolean), seconds, ratio: options.ratio, strict: options.strict, ...(options.bgmId ? { bgm: { id: options.bgmId, volume: options.volume, fadeOut: options.fadeOut } } : {}) }); onDone(r.url); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>모션그래픽 MP4 만들기</button></section>;
}
type Seg = { index: number; start: number; end: number; text: string }; type Source = { id: string; name: string; duration: number; status: string; segmentCount: number };
const CHUNK = 6 * 1024 * 1024;
/** Own long video + SRT: chunked upload (6MB pieces), pick subtitle segments, cut a clip. */
export function ClipEditor({ onClip }: { onClip: (url: string) => void }) {
  const [sources, setSources] = useState<Source[]>([]), [current, setCurrent] = useState(''), [segs, setSegs] = useState<Seg[]>([]), [picked, setPicked] = useState<number[]>([]), [burn, setBurn] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [progress, setProgress] = useState('');
  const load = useCallback(async () => setSources((await call('/api/cora/video-sources')).sources), []);
  useEffect(() => { void load().catch(e => setError(e.message)); }, [load]);
  async function run(f: () => Promise<void>) { setBusy(true); setError(''); try { await f(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); setProgress(''); } }
  const open = async (id: string) => { const r = await call(`/api/cora/video-sources/${id}`); setCurrent(id); setSegs(r.segments); setPicked([]); };
  async function upload(f: File) {
    const b = await call('/api/cora/video-sources', 'POST', { name: f.name, size: f.size }); const id = b.source.id as string;
    for (let off = 0; off < f.size; off += CHUNK) { setProgress(`${Math.round(off / f.size * 100)}%`); const r = await fetch(`/api/cora/video-sources/${id}/chunk?offset=${off}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f.slice(off, off + CHUNK) }); if (!r.ok) throw new Error((await r.json()).error); }
    await call(`/api/cora/video-sources/${id}/complete`, 'POST', {}); await open(id);
  }
  return <section className={s.panel}><h3>내 영상에서 자막 구간 클립 만들기</h3>{error && <p role="alert">{error}</p>}{progress && <p role="status">올리는 중 {progress}</p>}
    <label>영상 파일 (200MB 이하)<input aria-label="원본 영상 파일" type="file" accept="video/*" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void run(() => upload(f)); }} /></label>
    <ul>{sources.map(x => <li key={x.id}>{x.name} ({x.duration}초, 자막 {x.segmentCount}개) <button onClick={() => void run(() => open(x.id))}>열기</button> <button onClick={() => void run(async () => { await call(`/api/cora/video-sources/${x.id}`, 'DELETE'); if (current === x.id) { setCurrent(''); setSegs([]); } })}>삭제</button></li>)}</ul>
    {current && <><label>SRT 자막 파일<input aria-label="SRT 자막 파일" type="file" accept=".srt" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void run(async () => { const r = await fetch(`/api/cora/video-sources/${current}/srt`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: await f.text() }); const v = await r.json(); if (!r.ok) throw new Error(v.error); setSegs(v.segments); }); }} /></label>
      {segs.map(g => <label key={g.index} style={{ display: 'flex', gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={picked.includes(g.index)} onChange={() => setPicked(p => p.includes(g.index) ? p.filter(x => x !== g.index) : [...p, g.index])} />{g.start.toFixed(1)}~{g.end.toFixed(1)}초 {g.text}</label>)}
      <label><input type="checkbox" checked={burn} onChange={e => setBurn(e.target.checked)} /> 자막을 화면에 새기기</label>
      <button className={s.secondary} disabled={busy || !picked.length} onClick={() => void run(async () => { const r = await call('/api/cora/video-clips', 'POST', { sourceId: current, segments: picked, burn }); onClip(r.url); })}>선택한 구간 클립 만들기</button></>}</section>;
}
