'use client';

import { useEffect, useState } from 'react';
import type { Draft } from '@/lib/cora/model';

type Revision = { version: number; created: string; slideCount: number; captionPreview: string; current: boolean };

/** Saved versions of one project. Restoring returns an unsaved draft through onRestore; saving it creates a new version. */
export function HistoryPanel({ projectId, currentVersion, onRestore }: { projectId: string; currentVersion: number; onRestore: (draft: Draft, version: number) => void }) {
  const [items, setItems] = useState<Revision[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(0); const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/cora/revisions?projectId=${encodeURIComponent(projectId)}`, { credentials: 'same-origin' }).then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b.error || '이력을 불러오지 못했습니다.'); if (live) { setItems(b.revisions); setError(''); } })
      .catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [projectId, currentVersion]);
  async function restore(version: number) {
    if (!window.confirm(`버전 ${version}을 불러올까요? 저장하기 전까지 현재 저장본은 바뀌지 않습니다.`)) return;
    setBusy(version); setError('');
    try {
      const r = await fetch('/api/cora/revisions', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', projectId, version, currentVersion }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error || '복원하지 못했습니다.');
      onRestore(b.draft as Draft, version);
    } catch (e) { setError(e instanceof Error ? e.message : '복원하지 못했습니다.'); } finally { setBusy(0); }
  }
  return (
    <section aria-label="저장 이력" style={{ display: 'grid', gap: 8, padding: 12, border: '1px solid #d9d6cb', borderRadius: 12, background: '#fff' }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>저장 이력</h3>
      {error && <p role="alert" style={{ margin: 0, color: '#a33' }}>{error}</p>}
      {loaded && !items.length && !error && <p style={{ margin: 0 }}>저장한 버전이 아직 없습니다.</p>}
      <ol aria-label="저장 버전 목록" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {items.map(r => (
          <li key={r.version} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <strong>버전 {r.version}</strong><span>{new Date(r.created).toLocaleString('ko-KR')}</span><span>카드 {r.slideCount}장</span>
            <span style={{ color: '#53665c', flex: 1 }}>{r.captionPreview}</span>
            {r.current ? <span>현재 버전</span> : <button type="button" aria-label={`버전 ${r.version} 불러오기`} disabled={busy > 0} onClick={() => restore(r.version)}>이 버전 불러오기</button>}
          </li>))}
      </ol>
    </section>);
}
