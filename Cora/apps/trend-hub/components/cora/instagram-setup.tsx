'use client';
import { useState } from 'react';
import type { InstagramSetupCheck } from '@/lib/cora/instagram-readiness';
type Setup = { checks: InstagramSetupCheck[]; localConfigReady: boolean; mediaConfigured: boolean; note: string };
export function InstagramSetupGuide() {
  const [setup, setSetup] = useState<Setup | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function check() {
    setBusy(true); setError('');
    try { const r = await fetch('/api/cora/connect/instagram?setup=1'); const data = await r.json(); if (!r.ok) throw new Error(data.error || '점검 실패'); setSetup(data); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <details><summary>Instagram 시험 계정 연결 안내</summary>
    <p>비밀번호나 2단계 인증번호를 Cora 또는 AI 채팅에 보내지 않습니다. Instagram 공식 화면에서 직접 로그인하고 연결을 승인합니다.</p>
    <ol>
      <li>시험용 Instagram 계정을 준비하고 크리에이터 또는 비즈니스 계정으로 설정합니다. 준비 상태를 공유할 때는 @사용자명과 계정 유형만 알려주세요.</li>
      <li>Cora 운영자가 Meta 개발자 앱의 Instagram 로그인 설정과 시험 사용자 권한을 준비합니다. 앱 시크릿은 서버의 비밀 설정에 저장합니다.</li>
      <li>설정된 HTTPS 주소에서 Cora에 로그인한 뒤 Instagram 계정 연결을 누릅니다. Instagram에서 권한을 승인하고 돌아오면 연결된 계정을 확인합니다.</li>
      <li>계정 연결과 실제 게시를 구분합니다. 현재 게시 준비함은 모의 실행이며 실제 게시 큐 연결은 개발 중입니다. 첫 실제 시험 게시 전에 계정과 게시물을 확인합니다.</li>
    </ol>
    <button type="button" disabled={busy} onClick={()=>void check()}>{busy?'점검 중…':'연결 준비 상태 점검'}</button>
    {error&&<p role="alert">{error}</p>}
    {setup&&<section aria-label="Instagram 연결 준비 점검 결과"><p>{setup.localConfigReady?'로컬 설정 점검 통과 — Instagram 승인 검증 필요':'아래 준비 항목을 확인해 주세요.'}</p><ul>{setup.checks.map(c=><li key={c.id}><b>{c.ready?'준비됨':'준비 필요'} · {c.label}</b><p>{c.help}</p></li>)}</ul><p>{setup.note}</p><p>이미지·영상 저장소: {setup.mediaConfigured?'설정 존재 — 실제 업로드 검증 필요':'미설정 — 계정 연결에는 필요 없으며 게시할 때 필요합니다.'}</p></section>}
    <p><a href="https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/" target="_blank" rel="noreferrer">Meta 공식 Instagram 로그인 안내</a></p>
  </details>;
}
