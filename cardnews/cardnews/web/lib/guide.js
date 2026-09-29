// 화면 글자는 한 벌뿐이다 — `수집기말.js`.
import { 말하기 } from './수집기말.js'

// 키 설정 창에 넣는 안내. 그림은 SVG 로 직접 그린다.
// 스크린샷 파일을 두면 배포에 따라다니고 인스타·Apify 화면이 바뀌면 낡는데,
// 여기 그림은 위치를 짚어주는 용도라 글자 몇 개만 고치면 된다.

// Apify 왼쪽 아래 ⓘ 버튼과 거기서 열리는 메뉴
const APIFY_MENU = `
<svg viewBox="0 0 300 150" width="100%" style="max-width:300px; border:1px solid var(--line); border-radius:6px; background:#fff;">
  <rect x="0" y="0" width="88" height="150" fill="#fafafa"/>
  <line x1="88" y1="0" x2="88" y2="150" stroke="#e3e3e3"/>
  <text x="10" y="24" font-size="8" fill="#6b6b6b">Proxy</text>
  <text x="10" y="42" font-size="8" fill="#6b6b6b">Storage</text>
  <text x="10" y="60" font-size="8" fill="#6b6b6b">Billing</text>
  <text x="10" y="78" font-size="8" fill="#6b6b6b">Settings</text>
  <text x="10" y="104" font-size="7" fill="#9b9b9b">Usage  $0.00 / $5.00</text>
  <circle cx="62" cy="134" r="9" fill="#fff" stroke="#1a1a1a" stroke-width="1.5"/>
  <text x="62" y="137" font-size="9" text-anchor="middle" fill="#1a1a1a">?</text>
  <rect x="100" y="8" width="192" height="134" rx="6" fill="#fff" stroke="#d8d8d8"/>
  <text x="112" y="24" font-size="8" fill="#6b6b6b">Docs</text>
  <text x="112" y="40" font-size="8" fill="#6b6b6b">Help center</text>
  <text x="112" y="56" font-size="8" fill="#6b6b6b">Contact support</text>
  <text x="112" y="72" font-size="8" fill="#6b6b6b">Discord</text>
  <rect x="104" y="80" width="184" height="16" fill="#fff8b0"/>
  <text x="112" y="92" font-size="8" font-weight="bold" fill="#1a1a1a">Earn free credits</text>
  <rect x="196" y="83" width="22" height="10" rx="3" fill="#e8e8e8"/>
  <text x="207" y="91" font-size="6" text-anchor="middle" fill="#555">New</text>
  <text x="112" y="112" font-size="8" fill="#6b6b6b">Keyboard shortcuts</text>
  <text x="112" y="128" font-size="8" fill="#6b6b6b">Status page</text>
  <path d="M 66 128 Q 84 112 104 92" stroke="#e24b26" stroke-width="1.5" fill="none" marker-end="url(#a)"/>
  <defs><marker id="a" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
    <path d="M0,0 L6,3 L0,6 Z" fill="#e24b26"/></marker></defs>
</svg>`

// 크롬 개발자도구에서 sessionid 를 찾는 자리
const COOKIE_PANEL = (언어) => `
<svg viewBox="0 0 300 130" width="100%" style="max-width:300px; border:1px solid var(--line); border-radius:6px; background:#fff;">
  <rect x="0" y="0" width="300" height="16" fill="#f2f2f2"/>
  <text x="8" y="11" font-size="7" fill="#6b6b6b">Elements  Console  Sources</text>
  <rect x="112" y="1" width="52" height="14" rx="2" fill="#fff" stroke="#c7c7c7"/>
  <text x="138" y="11" font-size="7" font-weight="bold" text-anchor="middle" fill="#1a1a1a">Application</text>
  <line x1="96" y1="16" x2="96" y2="130" stroke="#e3e3e3"/>
  <text x="8" y="34" font-size="7" fill="#6b6b6b">Storage</text>
  <text x="14" y="50" font-size="7" fill="#6b6b6b">Local storage</text>
  <text x="14" y="66" font-size="7" font-weight="bold" fill="#1a1a1a">Cookies</text>
  <rect x="18" y="72" width="74" height="12" fill="#e8f0fe"/>
  <text x="22" y="81" font-size="6.5" fill="#1a1a1a">instagram.com</text>
  <rect x="100" y="22" width="196" height="12" fill="#f7f7f7"/>
  <text x="106" y="31" font-size="6.5" fill="#6b6b6b">Name</text>
  <text x="176" y="31" font-size="6.5" fill="#6b6b6b">Value</text>
  <text x="106" y="47" font-size="6.5" fill="#6b6b6b">csrftoken</text>
  <text x="176" y="47" font-size="6.5" fill="#9b9b9b">AbC…</text>
  <rect x="100" y="52" width="196" height="14" fill="#fff8b0"/>
  <text x="106" y="62" font-size="6.5" font-weight="bold" fill="#1a1a1a">sessionid</text>
  <text x="176" y="62" font-size="6.5" font-weight="bold" fill="#1a1a1a">7712…%3A28%3A…</text>
  <text x="106" y="78" font-size="6.5" fill="#6b6b6b">ds_user_id</text>
  <text x="176" y="78" font-size="6.5" fill="#9b9b9b">1785…</text>
  <text x="106" y="100" font-size="7" fill="#e24b26">${말하기(언어)('안_쿠키그림')}</text>
</svg>`

const step = (n, text) =>
  `<div style="display:flex; gap:8px; margin:6px 0;">
     <span style="flex:0 0 17px; height:17px; border-radius:50%; background:#1a1a1a; color:#fff;
                  font-size:10px; line-height:17px; text-align:center;">${n}</span>
     <span style="flex:1; line-height:1.6;">${text}</span>
   </div>`

export const APIFY_GUIDE = (언어) => {
  const 말 = 말하기(언어)
  return `
<div class="muted" style="line-height:1.6;">
  ${step(1, 말('안_apify1'))}
  ${step(2, 말('안_apify2'))}
  ${step(3, 말('안_apify3'))}
  <div style="margin-top:12px; padding-top:10px; border-top:1px dashed var(--line);">
    <b style="color:var(--fg);">${말('안_apify더제목')}</b> ${말('안_apify더')}
    <div style="margin-top:8px;">${APIFY_MENU}</div>
  </div>
</div>`
}

export const COOKIE_GUIDE = (언어) => {
  const 말 = 말하기(언어)
  return `
<div class="muted" style="line-height:1.6;">
  <div style="background:#fff6f6; border:1px solid #f0c8c8; border-radius:6px; padding:8px 10px; margin-bottom:8px; color:#a33;">
    ${말('안_쿠키경고')}
  </div>
  ${step(1, 말('안_쿠키1'))}
  ${step(2, 말('안_쿠키2'))}
  ${step(3, 말('안_쿠키3'))}
  ${step(4, 말('안_쿠키4'))}
  ${step(5, 말('안_쿠키5'))}
  ${step(6, 말('안_쿠키6'))}
  <div style="margin-top:8px;">${COOKIE_PANEL(언어)}</div>
  <div style="margin-top:10px;">${말('안_쿠키꼬리')}</div>
</div>`
}
