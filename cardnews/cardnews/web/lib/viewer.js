// 화면 글자는 한 벌뿐이다 — `수집기말.js`. 창 안으로는 굳힌 글을 실어 보낸다.
import { 뷰어꾸러미 } from './수집기말.js'
import { 쓸언어 } from './언어.js'

// 카드뉴스 한 건을 별도 창에 띄운다. 창을 여러 개 열어 나란히 놓고 비교할 수 있다.
//
// 창 안에서 슬라이드 보기와 계정 게시물 보기가 모두 끝난다. 다만 계정 게시물을
// 받아오는 일만은 원래 창에 맡긴다(window.opener.getAccountPosts). 돈이 나가는
// 호출을 한 곳에 모아둬야 과금 지점을 놓치지 않기 때문이다.

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const slim = (post, toSrc) => ({
  id: post.id,
  url: post.url,
  caption: post.caption || '',
  author: post.author || '',
  likes: post.likes || 0,
  comments: post.comments || 0,
  likesHidden: Boolean(post.likesHidden),
  isCarousel: Boolean(post.isCarousel),
  kind: post.kind,
  slideCount: post.slideCount || (post.slides || []).length,
  slides: (post.slides || []).map((s) => toSrc(s.url)),
  raw: (post.slides || []).map((s) => s.url),
  // 캐러셀에는 영상이 섞인다. <img> 로는 못 그리므로 자리마다 표시를 넘긴다.
  // poster 는 재생 전에 보여줄 정지 화면인데, 주는 소스와 안 주는 소스가 있다.
  videos: (post.slides || []).map((s) => Boolean(s.isVideo)),
  posters: (post.slides || []).map((s) => (s.poster ? toSrc(s.poster) : '')),
})

// 계정 게시물을 창으로 넘길 때도 같은 모양으로 줄여 보낸다
export const slimPost = slim

export function viewerHtml(post, toSrc = (u) => u, { accountCost = '', 언어 } = {}) {
  // **창 안에서는 이쪽 함수를 못 부른다.** 그래서 글 한 벌을 통째로 실어 보내고
  // 창은 받은 것만 쓴다. 값 자리는 `{0}` 로 비워져 있고 창 안에서 채운다.
  const 말들 = 뷰어꾸러미(언어)
  const 채움 = (열쇠, ...값) =>
    값.reduce((글, 하나, n) => 글.split('{' + n + '}').join(하나), 말들[열쇠] || '')
  const data = JSON.stringify({ post: slim(post, toSrc), accountCost, 말: 말들 })
    .replace(/</g, '\\u003c')

  return `<!doctype html>
<html lang="${쓸언어(언어) === '영어' ? 'en' : 'ko'}"><head><meta charset="utf-8">
<title>${esc((post.caption || 채움('쪽제목기본')).slice(0, 40))} · @${esc(post.author)}</title>
<style>
  :root { --line:#e3e3e3; --muted:#6b6b6b; --accent:#2563eb; }
  * { box-sizing:border-box; }
  /* height:100vh 로 가두면 슬라이드가 많을 때 아래 썸네일이 잘린다.
     min-height 로 두고 페이지가 스스로 늘어나 스크롤되게 한다. */
  /* 창을 넓게 열면 내용이 끝없이 늘어나 아래쪽 버튼이 화면 밖으로 밀려난다.
     가운데로 모으고 폭을 묶는다. */
  body { margin:0 auto; padding:14px; max-width:1100px;
         font-family:system-ui,'Malgun Gothic',sans-serif; font-size:14px;
         display:flex; flex-direction:column; min-height:100vh; background:#fff; color:#1a1a1a;
         overflow-x:hidden; }
  .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  button { font:inherit; padding:7px 10px; border:1px solid var(--line); border-radius:6px;
           background:#fff; cursor:pointer; }
  button:hover { background:#f2f2f2; }
  button:disabled { color:var(--muted); cursor:default; }
  .muted { color:var(--muted); font-size:12px; }
  #body { flex:1; display:flex; flex-direction:column; margin-top:10px; }
  #stage { display:flex; gap:10px; align-items:center; }
  #slide, #vid { flex:1; min-width:0; max-height:62vh; object-fit:contain; background:#f2f2f2; border-radius:6px; }
  /* 높이를 안 정하면 메타데이터가 오기 전까지 브라우저 기본값(150px)짜리 납작한
     막대라, 세로 릴스 표지가 그 안에서 실오라기만 하게 눌린다 — 빈칸으로 보인다.
     62vh 로 못 박으면 처음부터 표지가 제대로 뜨고, 나중에 화면이 튀지도 않는다. */
  #vid { display:none; height:62vh; }
  /* min-width:0 이 없으면 이 칸이 글자 길이만큼 버텨서 창을 옆으로 밀어낸다 */
  #fallback { flex:1; min-width:0; display:none; flex-direction:column; align-items:center;
              justify-content:center; gap:10px; background:#f7f7f7; border:1px dashed var(--line);
              border-radius:6px; padding:30px; min-height:220px;
              text-align:center; color:var(--muted); font-size:13px; line-height:1.7; }
  /* 장수가 많아도 다 볼 수 있게 여러 줄로 흐르게 둔다. 한 장 크기는 고정한다. */
  /* 실패한 장이 있어도 줄 자체는 남아야 한다. 자리를 비우면 아래가 통째로 사라진 것처럼 보인다. */
  #strip { display:flex; flex-wrap:wrap; gap:5px; margin-top:10px; min-height:82px; }
  #strip img, #strip video { flex:0 0 66px; height:82px; object-fit:cover; border-radius:4px; cursor:pointer;
               border:1px solid var(--line); background:#eee; }
  #strip img.on, #strip video.on { border:2px solid var(--accent); }
  #strip img.dead { opacity:.3; border:1px dashed #c9c9c9; background:#f4f4f4; }
  footer { margin-top:12px; padding-top:12px; border-top:1px solid var(--line); }
  footer .row { flex-wrap:wrap; }
  #grid { display:grid; gap:8px; grid-template-columns:repeat(auto-fill,minmax(150px,1fr));
          align-content:start; }
  .cell { position:relative; }
  .cell img { width:100%; aspect-ratio:4/5; object-fit:cover; border-radius:6px; background:#eee; display:block; }
  .cell .tag { position:absolute; top:6px; right:6px; background:#fff; border-radius:4px;
               padding:1px 6px; font-size:11px; }
  .cell .none { display:none; width:100%; aspect-ratio:4/5; align-items:center; justify-content:center;
                background:#f4f4f4; border-radius:6px; color:var(--muted); font-size:11px; text-align:center; }
  /* 측정값 — 슬라이드 바로 아래. 넘길 때마다 그 장의 값으로 바뀐다. */
  #meas { margin-top:8px; font-size:12px; line-height:1.6; }
  #meas .mrow { display:flex; gap:7px; align-items:baseline; padding:2px 0; }
  #meas .mrow > b:nth-child(2) { flex:0 0 34px; color:var(--muted); font-weight:500; }
  #meas .mrow > span { flex:1; min-width:0; word-break:break-all; }
  /* 어느 트랙이 낸 값인지 한눈에 갈라 보여야 한다. 숫자가 이상하면 자, 이름표가
     이상하면 눈을 의심하면 된다. */
  #meas .who { flex:0 0 30px; text-align:center; border-radius:3px; font-size:10px;
               padding:1px 0; font-weight:600; }
  #meas .r { background:#e8f0fe; color:#1a56c4; }   /* 자 — 코드가 잰 것 */
  #meas .e { background:#fdeee8; color:#c2410c; }   /* 눈 — 비전이 붙인 것 */
  #meas .b { background:#eee; color:#555; }         /* 둘이 나눠 가진 것 */
  #meas i { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:3px;
            border:1px solid #0002; vertical-align:-1px; }
</style></head><body>
<div class="row" style="position:sticky; top:-14px; background:#fff; padding:6px 0; z-index:2;">
  <button id="back" style="display:none;">←</button>
  <strong id="cap" style="flex:1; font-weight:500; font-size:13px; line-height:1.4;"></strong>
  <span id="page" class="muted"></span>
</div>
<div id="body"></div>
<script>
const D = ${data};
const $ = (id) => document.getElementById(id);
// 값 자리({0})를 채우는 것 하나. 모르는 열쇠는 빈 글 — 창이 안 뜨는 것보다 낫다.
// 이 안은 창으로 통째로 실려 가는 글이라 여기에 백틱을 쓰면 글이 거기서 끊긴다.
const 말 = (열쇠, ...값) =>
  값.reduce((글, 하나, n) => 글.split('{' + n + '}').join(String(하나)), (D.말 || {})[열쇠] || '');
let P = D.post;          // 지금 보고 있는 게시물
let origin = D.post;     // 계정 목록에서 들어왔을 때 돌아갈 자리
let account = null;      // { username, posts, onlyCarousel }
let mode = 'slides';
let i = 0;
let M = null;            // 이 게시물의 측정값. 아직 안 재었으면 null

const opener = () => (window.opener && !window.opener.closed ? window.opener : null);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const isVid = (k) => Boolean((P.videos || [])[k]);
const name = (k) => P.author + '_' + P.id + '_' + String(k + 1).padStart(2, '0') + (isVid(k) ? '.mp4' : '.jpg');

// 중계 → 원래 주소 → 호스트 바꾼 주소 순으로 해본다. 셋 다 안 되면 그때 안내한다.
const FALLBACK_HOST = 'scontent.cdninstagram.com';
function altHostOf(u) {
  try { const x = new URL(u); if (x.hostname === FALLBACK_HOST) return ''; x.hostname = FALLBACK_HOST; return x.toString(); }
  catch { return ''; }
}
function nextSrc(el) {
  const raw = el.dataset.raw || '';
  const stage = Number(el.dataset.stage || 0);
  el.dataset.stage = String(stage + 1);
  if (stage >= 2) return '';
  const cand = [raw, altHostOf(raw)][stage];
  return cand && cand !== el.src ? cand : nextSrc(el);
}
function imgFail(el) {
  const next = nextSrc(el);
  if (next) { el.src = next; return; }
  // 썸네일은 옆이 다음 썸네일이다. 옆 칸을 건드리면 줄이 어그러진다.
  if (el.dataset.solo === '1') { el.classList.add('dead'); return; }
  el.style.display = 'none';
  if (el.nextElementSibling) el.nextElementSibling.style.display = 'flex';
}

// 측정값은 이 창이 스스로 받아온다. 같은 출처라 출입증 쿠키가 그대로 실린다.
// 원래 창(app.js)을 안 거치는 것은 그 파일이 여러 작업과 겹치는 자리라서다.
// 공동 목록에 없는 게시물이면 404 가 오고, 그때는 아무것도 안 보여준다.
async function loadMeas() {
  const id = P.id;
  M = null;
  let got = null;
  try {
    const res = await fetch('/api/measures/' + encodeURIComponent(id), { credentials: 'same-origin' });
    if (res.ok) got = await res.json();
  } catch (e) { /* 창고가 없는 환경(파일 직접 열기)에서도 창은 그대로 돌아야 한다 */ }
  if (P.id !== id) return;  // 기다리는 사이에 다른 게시물로 넘어갔다
  M = got;
  if (mode === 'slides') drawMeas();
}

const num = (v, d) => (typeof v === 'number' ? v.toFixed(d) : '-');
// '없음' 은 잰 값에 실제로 들어 있는 낱말이다 — 화면 글자가 아니라 **값**이라
// 여기서 옮기지 않는다. 걸러낸 뒤 자리가 비면 그때 우리 말을 넣는다.
const join = (xs) => xs.filter((x) => x && x !== '없음').map(esc).join(' · ');

function drawMeas() {
  const box = $('meas');
  if (!box) return;
  if (!M) { box.innerHTML = ''; return; }
  const s = (M.slides || [])[i];
  if (!s) { box.innerHTML = '<span class="muted">' + esc(말('측정없음')) + '</span>'; return; }

  const c = s.colors || {}, t = s.text || {}, ph = s.photo || {};
  const chip = (h) => (h ? '<i style="background:' + esc(h) + '"></i>' + esc(h) : '-');
  const tone = s.tone || {};

  // 숫자라도 esc 를 통과시킨다. 측정 JSON 은 기계가 만들지만 검사 없이 저장되므로
  // 여기서 문자열이 들어오면 그대로 태그가 된다.
  const lv = (t.levels || []).map((x) =>
    esc(x.role) + ' ' + esc(x.pt) + 'pt ' + esc(x.weight || '') + ' ' + esc(x.family || '') +
    말('줄자행간', esc(x.lines), esc(x.chars), num(x.leading, 2))).join('<br>');

  const shapes = (s.shapes || []).map((x) =>
    esc(x.kind) + '(' + esc(x.role) + ')' +
    말('도형설명', Math.round(x.radius || 0), Math.round((x.alpha || 0) * 100)) +
    chip(x.fill)).join('<br>');

  // **값은 분석이 적어 둔 그대로 둔다.** 어떤 낱말이 올지 정해져 있지 않아
  // 옮길 수가 없다 — 이름표만 옮긴다.
  const rows = [
    ['e', 말('칸_역할'), join([s.role, s.ending, s.person, s.is_question ? 말('질문형') : ''])],
    ['e', 말('칸_말투'), join([tone.formality, tone.humor, tone.respect, tone.enthusiasm])],
    ['r', 말('칸_색'), chip(c.bg) + ' ' + chip(c.text) + ' ' + chip(c.accent) +
                말('색설명', num(c.contrast, 1),
                   c.accent_blobs != null ? esc(c.accent_blobs) : '-', esc(c.dominance || ''))],
    ['r', 말('칸_글자'), (lv || '-') +
                  말('글자설명', esc(t.align || '-'), esc(t.vpos || '-'),
                     t.margin != null ? esc(t.margin) : '-', num(t.text_area_pct, 0),
                     t.digits != null ? esc(t.digits) : '-',
                     t.emoji != null ? esc(t.emoji) : '-')],
    ['b', 말('칸_사진'), (join([ph.placement, ph.treatment, ph.content, ph.relation]) || 말('없음')) +
                  (ph.area_pct ? 말('사진몫', num(ph.area_pct, 0)) : '')],
    ['b', 말('칸_도형'), shapes || 말('없음')],
  ];

  box.innerHTML =
    '<div class="mrow"><b class="who r">' + esc(말('잰것')) + '</b><span class="muted">' +
      esc(말('잰것설명')) + '</span>' +
      '<b class="who e">' + esc(말('본것')) + '</b><span class="muted">' +
      esc(말('본것설명')) + '</span></div>' +
    rows.map((x) =>
      '<div class="mrow"><b class="who ' + x[0] + '">' +
      esc(x[0] === 'r' ? 말('잰것') : x[0] === 'e' ? 말('본것') : 말('둘다')) +
      '</b><b>' + esc(x[1]) + '</b><span>' + x[2] + '</span></div>').join('');
}

async function save(url, fname) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = href; a.download = fname; a.click();
    URL.revokeObjectURL(href);
    return true;
  } catch { return false; }
}

function drawSlides() {
  mode = 'slides';
  $('cap').textContent = P.caption.slice(0, 90) || 말('캡션없음');
  $('page').textContent = (i + 1) + ' / ' + P.slides.length;
  // 릴스는 영상 파일 하나뿐이다. 한 개를 zip 으로 묶을 이유가 없어서 곧장 내려받는다.
  const onlyVideo = P.slides.length === 1 && isVid(0);
  $('back').style.display = account ? '' : 'none';
  $('back').title = account ? 말('목록으로', account.username) : '';
  $('body').innerHTML =
    '<div id="stage">' +
      '<button id="prev" aria-label="' + esc(말('이전')) + '">‹</button>' +
      '<img id="slide" alt="">' +
      '<video id="vid" controls playsinline preload="metadata"></video>' +
      '<div id="fallback"><div>' + esc(말('못보내줌')) + '</div>' +
        '<button id="orig2">' + esc(말('인스타에서')) + '</button></div>' +
      '<button id="next" aria-label="' + esc(말('다음')) + '">›</button>' +
    '</div>' +
    '<div id="meas"></div>' +
    '<div id="strip"></div>' +
    '<footer class="row">' +
      '<span id="meta" class="muted"></span>' +
      '<span class="row" style="margin-left:auto; gap:6px;">' +
        (onlyVideo
          ? '<button id="dl1">' + esc(말('영상저장')) + '</button>'
          : '<button id="dl1">' + esc(말('이장저장')) + '</button>' +
            '<button id="dlAll">' + esc(말('전체저장', P.slides.length)) + '</button>') +
        '<button id="origin">' + esc(말('원본')) + '</button>' +
        '<button id="acct">' + esc(말('계정더보기')) +
          (D.accountCost ? ' · ' + esc(D.accountCost) : '') + '</button>' +
      '</span>' +
    '</footer>';
  $('meta').textContent = '@' + P.author + ' · ' +
    (P.likesHidden ? 말('좋아요비공개') : '♥ ' + P.likes.toLocaleString()) +
    ' · 💬 ' + P.comments.toLocaleString();
  $('slide').onerror = () => {
    const el = $('slide');
    el.dataset.raw = (P.raw || [])[i] || '';
    const next = nextSrc(el);
    if (next) { el.src = next; return; }
    el.style.display = 'none'; $('fallback').style.display = 'flex';
  };
  // 영상 자리는 <video> 로 둔다. 정지 화면을 주는 소스면 그것을, 안 주면 첫 프레임을 쓴다.
  $('strip').innerHTML = P.slides.map((u, k) =>
    isVid(k)
      ? '<video data-i="' + k + '" muted preload="metadata" poster="' +
        esc((P.posters || [])[k] || '') + '" src="' + esc(u) + '"></video>'
      : '<img data-i="' + k + '" data-solo="1" decoding="async" src="' + esc(u) +
        '" data-raw="' + esc((P.raw||[])[k]||'') + '" alt="" onerror="imgFail(this)">').join('');
  [...$('strip').children].forEach((el) =>
    el.addEventListener('click', () => { i = Number(el.dataset.i); showSlide(); }));
  $('prev').onclick = () => step(-1);
  $('next').onclick = () => step(1);
  $('dl1').onclick = async () => { if (!await save(P.slides[i], name(i))) window.open(P.url, '_blank'); };
  if ($('dlAll')) $('dlAll').onclick = async () => {
    const b = $('dlAll'); b.disabled = true;
    const host = opener();
    const label = 말('전체저장', P.slides.length);
    // 파일 하나(zip)로 묶는 일은 원래 창이 한다. 코드가 한 벌만 있으면 된다.
    if (host && host.saveAllAsZip) {
      try {
        const base = (P.caption.slice(0, 30).trim() || P.id) + ' - ' + P.author;
        const r = await host.saveAllAsZip(P.slides, base, (k, n) => { b.textContent = 말('모으는중', k, n); }, P.videos || []);
        b.textContent = r.failed.length ? 말('저장됨일부', r.failed.length) : 말('저장됨', r.saved);
        setTimeout(() => { b.textContent = label; }, 4000);
      } catch (e) {
        b.textContent = e.message || 말('저장실패');
        setTimeout(() => { b.textContent = label; }, 4000);
      }
      b.disabled = false;
      return;
    }
    // 원래 창이 닫혔으면 한 장씩이라도 내려받는다
    let bad = 0;
    for (let k = 0; k < P.slides.length; k++) {
      b.textContent = 말('저장중', k + 1, P.slides.length);
      if (!await save(P.slides[k], name(k))) bad++;
      await new Promise((r) => setTimeout(r, 300));
    }
    b.textContent = bad ? 말('전체저장일부실패', bad) : label;
    b.disabled = false;
  };
  $('origin').onclick = () => window.open(P.url, '_blank');
  $('orig2').onclick = () => window.open(P.url, '_blank');
  $('acct').onclick = openAccount;
  showSlide();
  loadMeas();   // 그림보다 늦게 와도 되므로 기다리지 않는다
}

function showSlide() {
  $('page').textContent = (i + 1) + ' / ' + P.slides.length;
  $('fallback').style.display = 'none';
  const video = isVid(i);
  // 영상 자리와 사진 자리가 같은 칸을 나눠 쓴다. 한쪽을 켜면 다른 쪽은 끈다.
  //
  // 영상 칸은 '' 로 켜면 안 된다. 빈 문자열은 인라인 선언을 지우는 것인데,
  // #vid 는 위 스타일시트가 display:none 으로 숨겨둔 칸이라 인라인을 지우면
  // 그 규칙이 다시 이겨서 계속 숨어 있다. 그러면 사진 칸은 none, 영상 칸도 none 이 되어
  // 영상이 든 장이 통째로 빈칸으로 보인다. 실제로 그렇게 안 보였다.
  // 사진 칸(#slide)은 스타일시트에 display 규칙이 없어 '' 로 되살아난다.
  $('slide').style.display = video ? 'none' : '';
  $('vid').style.display = video ? 'block' : 'none';
  if (video) {
    $('vid').poster = (P.posters || [])[i] || '';
    $('vid').src = P.slides[i] || '';
  } else {
    $('vid').removeAttribute('src');   // 넘어간 뒤에도 소리가 나면 안 된다
    $('slide').src = P.slides[i] || '';
  }
  [...$('strip').children].forEach((el, k) => el.className = k === i ? 'on' : '');
  drawMeas();
}

const step = (d) => { i = (i + d + P.slides.length) % P.slides.length; showSlide(); };

async function openAccount() {
  const host = opener();
  if (!host || !host.getAccountPosts) {
    window.open('https://www.instagram.com/' + P.author + '/', '_blank');
    return;
  }
  const btn = $('acct');
  if (btn) { btn.disabled = true; btn.textContent = 말('불러오는중'); }
  try {
    const posts = await host.getAccountPosts(P.author);
    account = { username: P.author, posts, onlyCarousel: false };
    drawAccount();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 말('계정더보기'); }
    $('cap').textContent = e.message || 말('계정못불러옴');
  }
}

function drawAccount() {
  mode = 'account';
  const list = account.onlyCarousel ? account.posts.filter((p) => p.isCarousel) : account.posts;
  $('cap').textContent = 말('계정몇건', account.username, list.length);
  $('page').textContent = '';
  $('back').style.display = '';
  $('back').title = 말('보던것으로');
  $('body').innerHTML =
    '<label class="muted" style="margin-bottom:8px;"><input type="checkbox" id="only"' +
      (account.onlyCarousel ? ' checked' : '') + '> ' + esc(말('카드뉴스만')) + '</label>' +
    '<div id="grid">' + list.map((p, k) =>
      '<div class="cell" data-k="' + k + '" style="cursor:' + (p.isCarousel ? 'pointer' : 'default') + ';">' +
        '<img loading="lazy" src="' + esc(p.slides[0] || '') + '" alt="" ' +
          'onerror="this.style.display=\\'none\\'; this.nextElementSibling.style.display=\\'flex\\';">' +
        '<span class="none">' + 말('표지못보내줌') + '</span>' +
        '<span class="tag">' + esc(p.isCarousel ? 말('몇장', p.slideCount)
          : p.kind === 'video' ? 말('릴스') : 말('사진한장')) + '</span>' +
      '</div>').join('') + '</div>';
  $('only').addEventListener('change', (e) => { account.onlyCarousel = e.target.checked; drawAccount(); });
  [...$('grid').children].forEach((el) =>
    el.addEventListener('click', () => {
      const p = list[Number(el.dataset.k)];
      if (!p.isCarousel) return;
      P = p; i = 0; drawSlides();
    }));
}

$('back').onclick = () => {
  if (mode === 'account') { P = origin; i = 0; drawSlides(); return; }
  if (account) drawAccount();
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { window.close(); return; }
  if (mode !== 'slides') return;
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});

drawSlides();
</script></body></html>`
}

export function openViewerWindow(post, toSrc, opts) {
  const w = window.open('', `cardnews_${post.id}`, 'width=900,height=1000,scrollbars=yes,resizable=yes')
  if (!w) return false // 팝업 차단
  w.document.open()
  w.document.write(viewerHtml(post, toSrc, opts))
  w.document.close()
  w.focus()
  return true
}
