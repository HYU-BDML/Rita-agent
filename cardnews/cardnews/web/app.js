import { loadKeys, saveKeys, parseKeys, mergeKeys, maskKey, loadCookie, saveCookie, creditLabel } from './lib/keys.js'
import { runActor, keyStatus } from './lib/apify.js'
import { SOURCES, normalize, estimateCost, estimateCostReelKeyword, fmtCredit, normalizeTag, COUNTS, DEFAULT_COUNT, estimateSecs, estimateSecsAccount, fmtDuration, parseTarget } from './lib/sources.js'
import { scoreCover, hasText } from './lib/textscore.js'
import { applyView, SORTS, sortKeysFor } from './lib/view.js'
import { openViewerWindow, slimPost } from './lib/viewer.js'
import { UPDATES, LATEST, hasUnseen, updatesFor, markerOf, 소식글 } from './lib/updates.js'
import { detectProxy, imgSrc, rawOf, altHostOf } from './lib/img.js'
import { 언어표, 다음언어, 저장된언어, 언어남기기 } from './lib/언어.js'
// 화면에 뜨는 글자는 한 벌뿐이다 — `lib/수집기말.js`.
import { 말하기, 낱말, 라벨몇장 } from './lib/수집기말.js'
import { makeZip, safeName } from './lib/zip.js'
import { APIFY_GUIDE, COOKIE_GUIDE } from './lib/guide.js'
import * as board from './lib/board.js'
import * as templates from './lib/templates.js'
import {
  MAX_FAVORITES, loadFavorites, saveFavorites, addFavorite, removeFavorite, isExpired, agoLabel,
  favoritesFor,
} from './lib/favorites.js'

const $ = (id) => document.getElementById(id)
const PAGE = 25

// **이 화면에도 스위치가 있다**(사람 지시 2026-09-19). 채팅 화면과 **같은 곳에**
// 남기므로 어느 쪽에서 바꾸든 둘 다 따라온다 — 규칙 한 벌은 `lib/언어.js` 다.
//
// 한 번 읽고 **도중에 안 바꾼다.** 이미 그려 놓은 글자를 하나하나 다시 만지면
// 빠뜨린 자리가 반드시 생긴다. 대신 눌렀을 때 쪽을 다시 부른다(아래 `언어바꾸기`).
const 언어 = 저장된언어()
const 말 = 말하기(언어)

// HTML 에 박아 둔 열쇠(`data-말`)를 실제 글자로 채운다. 열쇠를 잘못 치면 빈
// 칸이 되므로 `test/수집기말.test.js` 가 화면과 글자표를 맞춰 본다.
function 화면글자채우기() {
  document.title = 말('쪽제목')
  for (const el of document.querySelectorAll('[data-말]')) el.textContent = 말(el.dataset.말)
  for (const el of document.querySelectorAll('[data-말h]')) el.innerHTML = 말(el.dataset.말h)
  for (const el of document.querySelectorAll('[data-말ph]')) el.placeholder = 말(el.dataset.말ph)
  // 미닫이 옆 글은 값이 붙어 있어 열쇠만으로는 못 채운다. 누를 때만 고치면
  // 처음 뜬 화면에는 HTML 에 박아 둔 한국어가 그대로 남는다.
  $('minSlidesOut').textContent = 말('검색_몇장이상', $('minSlides').value)
  언어단추그리기()
}

// **글자는 바뀔 언어가 아니라 «지금 언어»를 보여 준다** — 채팅 화면과 같다.
function 언어단추그리기() {
  const 단추 = $('langBtn')
  if (!단추) return
  단추.textContent = 언어표.find((x) => x.값 === 언어).보임
  단추.title = 말('언어_스위치설명')
  // 글자를 JS 가 채우므로 마크업에는 이름이 없다. 읽어 주는 도구가 빈 단추로
  // 보지 않게 여기서 붙인다.
  단추.setAttribute('aria-label', 단추.title)
  단추.setAttribute('aria-pressed', String(언어 === 언어표[1].값))
}

// 누르면 남기고 쪽을 다시 부른다. **검색 결과는 안 날아간다** — 그건 이
// 브라우저(sessionStorage)에 있고 `restoreSession` 이 도로 꺼낸다.
function 언어바꾸기() {
  언어남기기(다음언어(언어))
  location.reload()
}

const state = {
  keys: loadKeys(localStorage),
  cookie: loadCookie(localStorage),
  results: [],
  note: '',     // 실패한 검색어 같은 덧붙일 말
  favs: [],     // 즐겨찾기 — 돈 주고 받은 결과를 브라우저에 남겨둔 것
  scores: {},   // 게시물 id -> 표지 글자 점수. null 이면 아직 못 쟀다는 뜻
  shown: PAGE,
  used: [],
  hidden: [],
  board: [],          // 공동 목록 카드
  picked: new Set(),  // 담긴 게시물 id — 검색 결과의 하트를 채우는 데 쓴다
  contentType: 'cardnews', // 'cardnews' | 'reel' — 헤더 토글이 바꾼다
}
window.__state = state

function restoreSession() {
  let saved = null
  try {
    const raw = sessionStorage.getItem('last_result')
    if (raw) saved = JSON.parse(raw)
  } catch { /* 손상된 캐시는 무시한다 */ }
  if (!saved) return
  if (Array.isArray(saved.results)) state.results = saved.results
  if (Array.isArray(saved.used)) state.used = saved.used
}

function saveSession() {
  try {
    sessionStorage.setItem('last_result', JSON.stringify({ results: state.results, used: state.used }))
  } catch { /* 용량 초과 시 캐시를 포기한다 */ }
}

// keep=false 는 갈래를 바꿀 때다. 그때는 그 갈래의 기본(첫 항목)으로 돌아가야 한다 —
// 카드뉴스에서 고른 좋아요순을 릴스로 끌고 가면 릴스 기본인 조회수순을 영영 못 본다.
// 결과만 바뀔 때는 고르던 것을 지킨다. 보던 정렬이 발밑에서 바뀌면 안 된다.
function renderSortOptions({ keep = true } = {}) {
  const keys = sortKeysFor(state.contentType, state.results)
  const want = keep ? $('sort').value : ''
  $('sort').innerHTML = keys.map((k) => `<option value="${k}">${말(SORTS[k].말열쇠)}</option>`).join('')
  if (keys.includes(want)) $('sort').value = want
}

function renderCounts() {
  $('count').innerHTML = COUNTS.map((n) => `<option value="${n}">${말('검색_몇건', n)}</option>`).join('')
  $('count').value = String(DEFAULT_COUNT)
}

function plannedCalls() {
  return normalizeTag($('q').value) ? 1 : 0
}

// 갈래마다 액터가 달라 걸리는 시간이 다르다. 계정은 건수에 거의 안 끌려간다.
function etaSecs(source, n) {
  return source === 'keyword' ? estimateSecs(n) : estimateSecsAccount(n)
}

// 카드뉴스는 keyword/account. 릴스는 계정이면 reelAccount, 검색어면 reelPopular(B) 먼저 —
// 실패하면 keyword(A) 로 폴백한다(search() 안에서 처리).
function sourceNameFor(target) {
  if (state.contentType === 'reel') return target === 'account' ? 'reelAccount' : 'reelPopular'
  return target
}

function renderCost() {
  const n = Number($('count').value)
  const calls = plannedCalls()
  if (!calls) {
    $('cost').textContent = 말('돈_검색어없음')
    return
  }
  const { source } = parseTarget($('q').value)
  const isReelKeyword = state.contentType === 'reel' && source === 'keyword'
  const tail = 말('돈_예상시간', fmtDuration(etaSecs(source, n), 언어)) + (source === 'keyword'
    ? (state.cookie ? 말('돈_내화면기준') : 말('돈_쿠키권함'))
    : 말('돈_계정게시물'))
  if (isReelKeyword) {
    const { min, max } = estimateCostReelKeyword(n)
    $('cost').textContent = 말('돈_크레딧범위', fmtCredit(min, 언어), fmtCredit(max, 언어), tail)
    return
  }
  const credit = fmtCredit(estimateCost(sourceNameFor(source), n) * calls, 언어)
  $('cost').textContent = 말('돈_크레딧', credit, tail)
}

function renderUsed() {
  const used = state.used
  const hidden = state.hidden
  if (!used.length) {
    $('used').style.display = 'none'
    return
  }
  $('used').style.display = ''
  $('used').innerHTML =
    말('검색_쓴말') +
    used
      .map((u) => {
        const off = hidden.includes(u.tag)
        return `<span class="chip" style="${off ? 'opacity:.4;' : ''}">` +
          `${esc(u.tag)}` +
          `<button data-t="${esc(u.tag)}" aria-label="${esc(말(off ? '검색_보이기' : '검색_숨기기', u.tag))}">${off ? '+' : '×'}</button></span>`
      })
      .join(' ')
  $('used').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      const t = b.dataset.t
      const i = hidden.indexOf(t)
      if (i >= 0) hidden.splice(i, 1)
      else hidden.push(t)
      state.shown = PAGE
      renderUsed()
      render()
    })
  )
}

// 표지로 쓸 그림. 첫 장이 영상이면 그 주소로는 그림을 못 그리므로 인스타가
// 따로 주는 대표 그림을 쓴다. 공동 목록에서 온 카드에는 대표 그림이 없다.
function coverOf(p) {
  return p.cover || (p.slides[0] && p.slides[0].url) || ''
}

function currentView() {
  const hidden = state.hidden
  const kept = state.results.filter((p) => p.slides && p.slides.length && !hidden.includes(p.tag))
  const isReel = state.contentType === 'reel'
  const view = applyView(kept, {
    carouselOnly: !isReel,
    reelOnly: isReel,
    minSlides: Number($('minSlides').value),
    sort: $('sort').value,
  })
  // 릴스는 표지 글자 검사를 안 한다 — 그 정의(카드뉴스 판정)는 카드뉴스에만 쓴다.
  if (isReel) return { view, dropped: 0 }
  // 표지에 글자가 없으면 카드뉴스가 아니다. 끄고 켜는 조건이 아니라 정의다.
  // 아직 못 잰 표지는 남긴다. 글자가 있는 걸 빠뜨리는 쪽이 헛잡는 쪽보다 나쁘다.
  const withText = view.filter((p) => hasText(state.scores[p.id] ?? null))
  return { view: withText, dropped: view.length - withText.length }
}

// 중계가 실패해도 곧장 포기하지 않는다. 원래 주소로 한 번 더 해본다.
window.imgFail = (el) => {
  const raw = el.dataset.raw || ''
  const stage = Number(el.dataset.stage || 0)
  const next = [raw, altHostOf(raw)][stage]
  if (next && next !== el.src) {
    el.dataset.stage = String(stage + 1)
    el.src = next
    return
  }
  if (stage < 2) { // 같은 주소면 건너뛰고 다음 단계로
    el.dataset.stage = String(stage + 1)
    window.imgFail(el)
    return
  }
  el.style.display = 'none'
  if (el.nextElementSibling) el.nextElementSibling.style.display = 'flex'
}

async function fetchBytes(url) {
  const seen = new Set()
  for (const u of [url, rawOf(url), altHostOf(url)]) {
    if (!u || seen.has(u)) continue
    seen.add(u)
    try {
      const res = await fetch(u)
      if (res.ok) return new Uint8Array(await res.arrayBuffer())
    } catch { /* 다음 주소로 넘어간다 */ }
  }
  return null
}

// 새 창이 부른다. 슬라이드를 모아 파일 하나로 만든다.
window.saveAllAsZip = async (slides, baseName, onProgress = () => {}, videos = []) => {
  const files = []
  const failed = []
  for (let i = 0; i < slides.length; i += 1) {
    onProgress(i + 1, slides.length)
    const data = await fetchBytes(slides[i])
    const ext = videos[i] ? 'mp4' : 'jpg'
    if (data) files.push({ name: `${String(i + 1).padStart(2, '0')}.${ext}`, data })
    else failed.push(i + 1)
  }
  if (!files.length) throw new Error(말('실_한장도'))
  const url = URL.createObjectURL(new Blob([makeZip(files)], { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName(baseName)}.zip`
  a.click()
  URL.revokeObjectURL(url)
  return { saved: files.length, failed }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

// 조회수 배지. -1(모름)은 물음표로 — 0건이라고 착각하면 안 된다.
function fmtViews(n) {
  if (!Number.isFinite(n) || n < 0) return 말('결_조회모름')
  // **만 단위는 한국어에서만 통한다.** 영어로는 그대로 세 자리씩 끊어 준다.
  if (n >= 10000 && 언어 === '한국어') return 말('결_조회만', (n / 10000).toFixed(1))
  return 말('결_조회', n.toLocaleString())
}

function render() {
  const { view, dropped } = currentView()
  const got = state.results.length
  const searched = state.used.length > 0
  const isReel = state.contentType === 'reel'
  if (got) {
    $('status').textContent = isReel
      ? 말('결_찾음', got, state.note)
      : 말('결_찾음카드뉴스', got, view.length, state.note)
  } else if (searched) {
    $('status').textContent = 말('결_하나도', state.note)
  } else {
    $('status').textContent = ''
  }
  // 정렬 드롭다운 바로 옆자리다. 조회수순이 왜 없어졌는지는 그 옆에서 말해야 한다 —
  // 상태줄에 쓰면 즐겨찾기 열기 같은 다른 흐름이 덮어써서 사라진다(실측).
  // 드롭다운과 같은 근거로 판단한다. 따로 재면 항목은 있는데 없다고 하거나 그 반대가 된다.
  const noViews = isReel && !sortKeysFor(state.contentType, state.results).includes('views')
  $('count-out').textContent = !got
    ? ''
    : isReel
      ? (noViews ? 말('결_조회수없음') : '')
      : (dropped ? 말('결_글자없어뺌', dropped) : '')
  // 담을 것이 있을 때만 보인다. 이미 담아둔 검색이면 "갈아끼우기" 라고 말해준다.
  $('favSave').style.display = got ? '' : 'none'
  $('favSave').textContent =
    favoritesFor(state.favs, state.contentType).some((f) => f.label === favLabel())
      ? 말('즐_갱신')
      : 말('즐_담기')
  placeFavs() // 버튼이 나타났다 사라지면 기준 줄이 바뀐다
  $('empty').style.display = view.length ? 'none' : ''
  if (!view.length) {
    // 검색을 했는지부터 가른다. 0건을 받아놓고 "아직 검색하지 않았다" 고 하면 안 된다.
    $('empty').innerHTML = !searched
      ? 말('빔_아직안함')
      : got
        ? (isReel ? 말('빔_릴스없음', got) : 말('빔_카드뉴스없음', got))
        : 말('빔_인스타가빔')
  }
  const slice = view.slice(0, state.shown)
  $('grid').innerHTML = slice
    .map((p, i) => `
      <div class="card" data-i="${i}">
        <div class="thumb">
          <img crossorigin="anonymous" loading="lazy" src="${esc(imgSrc(coverOf(p)))}"
               data-raw="${esc(coverOf(p))}" alt="" onerror="imgFail(this)">
          <span class="noimg">${말('결_표지없음')}</span>
          <button class="heart${state.picked.has(p.id) ? ' on' : ''}" data-id="${esc(p.id)}"
                  title="${esc(말(state.picked.has(p.id) ? '공_담겨있음' : '공_담기'))}"
                  aria-label="${esc(말('공_담기'))}">${state.picked.has(p.id) ? '♥' : '♡'}</button>
          <span class="badge">${isReel ? fmtViews(p.playCount) : esc(말('결_몇장', p.slideCount))}</span>
        </div>
        <div class="meta">
          <div class="cap">${esc(p.caption.slice(0, 60))}</div>
          <div class="muted" style="margin-top:4px;">
            ${p.likesHidden ? esc(말('결_좋아요비공개')) : '♥ ' + p.likes.toLocaleString()} ·
            💬 ${p.comments.toLocaleString()} · @${esc(p.author)}
          </div>
        </div>
      </div>`)
    .join('')
  // 하트는 카드보다 먼저 붙인다. 카드 클릭(뷰어 열기)이 하트까지 삼키지 않게 막는다.
  $('grid').querySelectorAll('.heart').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      const p = slice.find((x) => x.id === el.dataset.id)
      if (p) takePick(p, el)
    })
  )
  $('grid').querySelectorAll('.card').forEach((el) =>
    el.addEventListener('click', () => window.openViewer(slice[Number(el.dataset.i)]))
  )
  const rest = view.length - slice.length
  $('more').style.display = rest > 0 ? '' : 'none'
  $('more').textContent = 말('검색_더보기몇', rest)
}

function applyResults(all, used, note) {
  const seen = new Set()
  state.results = all.filter((p) => p.id && !seen.has(p.id) && seen.add(p.id))
  state.used = used
  state.hidden = []
  state.shown = PAGE
  state.scores = {}
  state.note = note || ''
  saveSession()
  renderUsed()
  renderSortOptions() // render() 가 $('sort').value 를 읽으므로 그 전에 맞춰둔다
  render()
}

// ── 즐겨찾기 ────────────────────────────────────────────────
// 돈 주고 받은 결과를 브라우저에 남겨두고 공짜로 다시 꺼낸다.
// 칩을 누르는 것으로는 인스타를 부르지 않는다 — 돈이 나가는 길은 검색 버튼 하나뿐이다.

function favLabel() {
  return state.used.map((u) => u.tag).join(' + ')
}

// 본문 밖에 세울 때는 "저장한 것 갱신" 버튼과 같은 줄 높이에 맞춘다.
// 좁은 화면에서는 CSS 가 본문 안으로 되돌리므로 그때는 손대지 않는다.
function placeFavs() {
  const el = $('favs')
  if (getComputedStyle(el).position !== 'absolute') {
    el.style.top = ''
    return
  }
  // 기준은 언제나 필터 바다. 버튼을 기준으로 삼으면, 검색 결과가 없어져 버튼이
  // 사라지는 순간 기준이 바뀌면서 패널이 위로 튄다.
  // 바의 위쪽 안쪽 여백만큼 내려야 버튼과 같은 줄에 선다.
  const bar = document.querySelector('.bar')
  const pad = parseFloat(getComputedStyle(bar).paddingTop) || 0
  el.style.top = `${bar.offsetTop + pad}px`
}

window.addEventListener('resize', placeFavs)

function renderFavs() {
  const now = Date.now()
  // '' 로 켜지 마라. 위 스타일시트가 이 칸의 배치를 정하므로 실제 값을 준다
  // (같은 실수로 오늘 영상 칸이 통째로 안 보였다).
  // 릴스와 카드뉴스는 결과 모양이 달라 서로의 화면에서 열면 아무것도 안 나온다.
  // 그래서 지금 갈래 것만 보여준다. 갈래를 바꾸면 그쪽 것이 나타난다.
  const mine = favoritesFor(state.favs, state.contentType)
  $('favs').style.display = mine.length ? 'flex' : 'none'
  // 본문 밖에 떨어져 서므로 이름표가 있어야 뭔지 안다(좁은 화면에서는 CSS 가 숨긴다)
  $('favs').innerHTML = `<div class="favttl">${esc(말('즐_이름표'))}</div>` + mine
    .map((f) => {
      const old = isExpired(f.savedAt, now)
      return `<span class="fav${old ? ' old' : ''}">` +
        `<b data-open="${esc(f.label)}" title="${esc(말('즐_다시엶'))}">★ ${esc(f.label)}</b>` +
        `<span class="when">${esc(말('즐_언제', f.count, agoLabel(f.savedAt, now, 언어)))}` +
        `${old ? esc(말('즐_그림만료')) : ''}</span>` +
        `<button class="del" data-del="${esc(f.label)}" aria-label="${esc(말('즐_지우기', f.label))}">×</button></span>`
    })
    .join('')

  $('favs').querySelectorAll('[data-open]').forEach((el) =>
    el.addEventListener('click', () => openFav(el.dataset.open)))
  $('favs').querySelectorAll('[data-del]').forEach((el) =>
    el.addEventListener('click', () => {
      state.favs = removeFavorite(state.favs, el.dataset.del, state.contentType)
      saveFavorites(localStorage, state.favs)
      renderFavs()
      render()
    }))

  placeFavs()
}

async function openFav(label) {
  const f = favoritesFor(state.favs, state.contentType).find((x) => x.label === label)
  if (!f) return
  applyResults(f.results, f.used, '')
  // 표지 검사가 끝나면 스스로 다시 그리면서 상태줄을 덮는다. 그 뒤에 알린다 —
  // 안 그러면 "돈이 안 나갔다"는 말이 한 번도 안 보인다.
  await scoreCovers()
  const 언제 = agoLabel(f.savedAt, undefined, 언어)
  $('status').textContent = isExpired(f.savedAt)
    ? 말('즐_열었음만료', label, 언제)
    : 말('즐_열었음', label, 언제)
}

function saveCurrentAsFav() {
  if (!state.results.length) return
  const label = favLabel()
  if (!label) return
  const entry = {
    label,
    savedAt: new Date().toISOString(),
    count: state.results.length,
    results: state.results,
    used: state.used,
    contentType: state.contentType,
  }
  const { list, why } = addFavorite(state.favs, entry, 언어)
  if (why) {
    $('status').textContent = why
    return
  }
  // 넣지 못하면 있던 것을 그대로 둔다. 용량이 넘치는 일이 실제로 있다.
  if (!saveFavorites(localStorage, list)) {
    $('status').textContent = 말('즐_자리없음')
    return
  }
  state.favs = list
  renderFavs()
  render()
  const mine = favoritesFor(state.favs, state.contentType).length
  $('status').textContent = 말('즐_담았음', label, entry.count, mine, MAX_FAVORITES)
}

$('favSave').addEventListener('click', saveCurrentAsFav)

// 표지 글자 점수를 잰다. 이미 화면에 띄운 그림을 다시 쓰므로 돈도 요청도 들지 않는다.
// 수집이 끝난 뒤에 부른다. 수집 중 진행 표시를 덮어쓰지 않기 위해서다.
async function scoreCovers() {
  const todo = state.results.filter(
    (p) => p.isCarousel && coverOf(p) && state.scores[p.id] === undefined
  )
  if (!todo.length) return
  $('progress').style.display = ''
  $('cancel').style.display = 'none' // 여기서는 중단할 것이 없다
  for (let i = 0; i < todo.length; i += 1) {
    const p = todo[i]
    progress(말('진_표지보는중', i + 1, todo.length))
    try {
      state.scores[p.id] = await scoreCover(imgSrc(coverOf(p)))
    } catch {
      state.scores[p.id] = null // 못 읽은 표지는 남긴다
    }
  }
  $('progress').style.display = 'none'
  $('cancel').style.display = ''
  render()
}

let controller = null

function progress(text) {
  $('prog').textContent = text
}

function searching(on) {
  $('progress').style.display = on ? '' : 'none'
  $('go').disabled = on
  if (on) $('status').textContent = ''
}

async function search() {
  if (!state.keys.length) {
    $('status').textContent = 말('계_키먼저')
    return
  }
  const typed = normalizeTag($('q').value)
  $('q').value = typed
  if (!typed) {
    $('status').textContent = 말('돈_검색어없음')
    return
  }
  const n = Number($('count').value)
  const { source, value } = parseTarget(typed)
  const eta = 말('돈_예상시간', fmtDuration(etaSecs(source, n), 언어))
  // 계정 쪽 예상은 실측 두 점에서 나온 추정이다. 실제로 몇 초 걸렸는지 남겨야
  // 값이 쌓이고, 어긋나면 sources.js 의 식을 고칠 근거가 된다.
  const startedAt = Date.now()
  controller = new AbortController()
  const signal = controller.signal
  searching(true)
  try {
    const targets = [{ tag: typed }]
    // 태그별로 실패를 격리한다. 이미 지불한 태그의 결과를 한 번의 실패로 버리지 않는다.
    const all = []
    const done = []
    const failed = []
    let last = ''
    const primary = sourceNameFor(source)
    // 릴스+키워드 조합만 폴백 대상이 있다 — 나머지(카드뉴스, 릴스+계정)는 소스 하나뿐.
    const fallback = state.contentType === 'reel' && source === 'keyword' ? 'keyword' : null
    for (const t of targets) {
      try {
        let usedSource = primary
        let rows
        try {
          rows = await runActor(
            SOURCES[primary].actorId,
            SOURCES[primary].buildInput({ tag: value, username: value, count: n, cookies: state.cookie }),
            {
              keys: state.keys,
              memory: SOURCES[primary].memoryMb,
              onProgress: (m) => progress(말('진_말머리', t.tag, m, eta)),
              signal,
              언어,
            }
          )
        } catch (e) {
          if (e.cancelled || !fallback) throw e
          progress(말('진_릴스폴백', t.tag, eta))
          usedSource = fallback
          rows = await runActor(
            SOURCES[fallback].actorId,
            SOURCES[fallback].buildInput({ tag: value, username: value, count: n, cookies: state.cookie }),
            {
              keys: state.keys,
              memory: SOURCES[fallback].memoryMb,
              onProgress: (m) => progress(말('진_말머리', t.tag, m, eta)),
              signal,
              언어,
            }
          )
        }
        all.push(...normalize(usedSource, rows).map((p) => ({ ...p, tag: t.tag, contentType: state.contentType })))
        done.push(t)
      } catch (e) {
        if (e.cancelled) throw e
        failed.push(t.tag)
        last = e.message
      }
    }
    if (!done.length) throw new Error(말('실_수집실패', last))
    const took = Math.round((Date.now() - startedAt) / 1000)
    const note = (failed.length ? 말('실_일부실패', failed.join(', '), last) : '') +
      말('실_걸렸음', fmtDuration(took, 언어))
    applyResults(all, done, note)
  } catch (e) {
    $('status').textContent = e.message
  } finally {
    controller = null
    searching(false)
  }
}

$('go').addEventListener('click', async () => {
  await search()
  await scoreCovers()
})
$('cancel').addEventListener('click', () => {
  if (!controller) return
  progress(말('진_중단중'))
  controller.abort()
})
$('q').addEventListener('input', renderCost)
$('count').addEventListener('change', renderCost)
$('sort').addEventListener('change', () => { state.shown = PAGE; render() })
$('minSlides').addEventListener('input', () => {
  $('minSlidesOut').textContent = 말('검색_몇장이상', $('minSlides').value)
  state.shown = PAGE
  render()
})
$('more').addEventListener('click', () => { state.shown += PAGE; render() })

// 키 설정 — 저장된 키는 절대 입력칸에 되돌려주지 않는다. 마스킹된 목록으로만 보여준다.
// 창 안의 변경은 초안에만 쌓고, 저장을 눌러야 실제 키에 반영한다.
const draft = { keys: [], cookie: '' }

// 키마다 얼마 남았는지. 키 문자열로 기억한다 — 목록에서 하나 지워도 자리가 안 밀린다.
const creditOf = {}

function renderKeyDialog() {
  $('keyList').innerHTML = draft.keys.length
    ? draft.keys
        .map((k, i) => `<span class="row" style="gap:6px;">
            <span class="muted" style="width:16px;">${i + 1}</span>
            <span class="keyline">${esc(maskKey(k))}</span>
            <span class="muted" style="font-size:11px;">${esc(creditLabel(creditOf[k], 언어))}</span>
            <button type="button" data-i="${i}" style="padding:2px 8px; margin-left:auto;"
                    aria-label="${esc(말('키_한줄지우기', i + 1))}">×</button>
          </span>`)
        .join('')
    : `<span class="muted">${esc(말('키_없음'))}</span>`
  $('keyList').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      draft.keys.splice(Number(b.dataset.i), 1)
      renderKeyDialog()
    })
  )
  $('ckList').innerHTML = draft.cookie
    ? `<span class="row" style="gap:6px;"><span class="keyline">${esc(maskKey(draft.cookie))}</span>
       <button type="button" id="ckDel" style="padding:2px 8px;" aria-label="${esc(말('키_쿠키지우기'))}">×</button></span>`
    : `<span class="muted">${esc(말('키_없음'))}</span>`
  if (draft.cookie) $('ckDel').addEventListener('click', () => { draft.cookie = ''; renderKeyDialog() })
}

$('keyBtn').addEventListener('click', () => {
  $('apifyGuide').innerHTML = APIFY_GUIDE(언어)
  $('cookieGuide').innerHTML = COOKIE_GUIDE(언어)
  draft.keys = [...state.keys]
  draft.cookie = state.cookie
  $('keyIn').value = ''
  $('ckIn').value = ''
  renderKeyDialog()
  $('keyDlg').showModal()
  loadCredits()
})

// 창을 열 때마다 키마다 한 번씩 물어본다. 돈이 드는 호출이 아니다.
// 하나가 늦거나 실패해도 나머지는 그대로 뜨도록 각자 끝나는 대로 그린다.
async function loadCredits() {
  await Promise.all(
    draft.keys.map(async (k) => {
      try {
        creditOf[k] = await keyStatus(k)
      } catch {
        creditOf[k] = { state: 'unknown', remaining: null }
      }
      if ($('keyDlg').open) renderKeyDialog()
    })
  )
}

// 지우면 되돌릴 수 없다. 창을 닫기 전에 묻는다.
$('keyClear').addEventListener('click', (e) => {
  if (!state.keys.length && !state.cookie) return
  if (!confirm(말('키_정말지울까', state.keys.length, state.cookie ? 말('키_와쿠키') : ''))) {
    e.preventDefault()
  }
})

// close 이벤트는 브라우저에 따라 오지 않는다. 확실히 오는 submit에서 처리한다.
$('keyForm').addEventListener('submit', (e) => {
  const how = (e.submitter && e.submitter.value) || $('keyDlg').returnValue
  const typedKeys = $('keyIn').value
  const typedCookie = $('ckIn').value.trim()
  $('keyIn').value = ''
  $('ckIn').value = ''
  if (how === 'clear') {
    state.keys = []
    state.cookie = ''
    saveKeys(localStorage, state.keys)
    saveCookie(localStorage, '')
    $('status').textContent = 말('키_다지웠음')
    renderCost()
    return
  }
  if (how !== 'save') return
  const added = parseKeys(typedKeys)
  if (typedKeys.trim() && !added.length) {
    $('status').textContent = 말('키_못알아봄')
    return
  }
  const before = state.keys.length
  state.keys = mergeKeys(draft.keys, added) // 붙여넣은 키는 기존 목록에 더한다
  state.cookie = typedCookie || draft.cookie
  saveKeys(localStorage, state.keys)
  saveCookie(localStorage, state.cookie)
  const delta = state.keys.length - before
  const 바뀜 = delta > 0 ? 말('키_늘었음', delta) : delta < 0 ? 말('키_줄었음', -delta) : ''
  $('status').textContent =
    말('키_저장했음', state.keys.length, 바뀜, state.cookie ? 말('키_쿠키하나') : '')
  renderCost()
})

window.openViewer = (p) => {
  if (!openViewerWindow(p, imgSrc, { accountCost: accountCostLabel(), 언어 })) {
    $('status').textContent = 말('실_팝업막힘')
  }
}

const ACCOUNT_COUNT = 10
const accountCache = {}
let accountLoading = false

// "이 계정 더 보기" 에 붙일 크레딧 표시. 검색 탭 뷰어와 공동 목록 탭 뷰어가 같이 쓴다.
// 여기서 값을 안 채우면 그 버튼을 눌러도 돈이 나가는 줄 모르고 누르게 된다.
function accountCostLabel() {
  return 말('돈_계정더보기값', fmtCredit(estimateCost('account', ACCOUNT_COUNT), 언어))
}

// 새 창이 부른다. 돈이 나가는 호출은 여기 한 곳에만 둔다.
// 창은 받은 것을 그리기만 하므로 과금 지점이 흩어지지 않는다.
window.getAccountPosts = async (username) => {
  if (!username) throw new Error(말('계_이름없음'))
  if (accountCache[username]) return accountCache[username]
  if (accountLoading) throw new Error(말('계_다른것받는중'))
  if (!state.keys.length) throw new Error(말('계_키먼저'))
  accountLoading = true
  $('status').textContent = 말('계_받는중', username)
  try {
    const src = sourceNameFor('account')
    const rows = await runActor(
      SOURCES[src].actorId,
      SOURCES[src].buildInput({ username, count: ACCOUNT_COUNT }),
      {
        keys: state.keys,
        memory: SOURCES[src].memoryMb,
        onProgress: (m) => { $('status').textContent = 말('계_진행', username, m) },
        언어,
      }
    )
    // detailedData는 순서가 섞여서 오므로 날짜로 다시 세운다
    const list = normalize(src, rows)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map((p) => slimPost(p, imgSrc))
    accountCache[username] = list
    $('status').textContent = 말('계_받았음', username, list.length)
    return list
  } catch (e) {
    $('status').textContent = e.message
    throw e
  } finally {
    accountLoading = false
  }
}

// ── 공동 목록 ───────────────────────────────────────────────
// 뱃지 배경색 — index.html 은 이 태스크에서 한 줄(라벨링 링크)만 건드리기로 해서
// 새 CSS 클래스를 안 만들고 기존 .badge 모양을 인라인 스타일로 따라간다.
const TONE_BG = { off: '#eee', busy: '#fff7d6', ready: '#dbeafe', done: '#dcfce7', bad: '#fee2e2' }

// 라벨 상태는 카드 목록과 따로 온다. cards(배열 참조)로 "이 목록엔 이미 물어봤는지"를
// 가려서, 상태가 도착한 뒤 다시 그릴 때 또 부르는 것을 막는다(무한 루프 예방).
let labelStatusCache = {}
let labelStatusFor = null

function renderBoard() {
  const cards = state.board
  $('boardEmpty').style.display = cards.length ? 'none' : ''
  $('boardEmpty').innerHTML = 말(state.contentType === 'reel' ? '공_빔_릴스' : '공_빔_카드뉴스')
  $('boardStatus').textContent = cards.length ? 말('공_몇건담김', cards.length) : ''
  const isCardnews = state.contentType === 'cardnews'
  const statusReady = isCardnews && labelStatusFor === cards
  $('boardGrid').innerHTML = cards
    .map((c, i) => {
      const status = statusReady ? labelStatusCache[c.id] : null
      const badge = status && status !== '안 함' ? board.badgeOf(status) : null
      // 상태 값은 프로그램끼리 맞춰 보는 한국어 낱말이다. **화면에 걸 때만** 옮긴다.
      const 상태글 = 낱말('상태', 라벨몇장(status, 언어), 언어)
      return `
      <div class="card" data-i="${i}">
        <div class="thumb">
          ${board.coverTag(c.slides[0] || '')}
          <button class="heart on" data-id="${esc(c.id)}" title="${esc(말('공_빼기'))}"
                  aria-label="${esc(말('공_빼기'))}">♥</button>
          <button class="pin${c.pinned ? ' on' : ''}" data-pin="${esc(c.id)}"
                  title="${esc(말(c.pinned ? '공_고정풀까' : '공_고정할까'))}"
                  aria-label="${esc(말(c.pinned ? '공_고정풀기' : '공_고정함'))}">📌</button>
          <span class="badge">${state.contentType === 'reel'
            ? fmtViews(c.playCount)
            : esc(c.slideCount < c.slideTotal
                ? 말('결_몇장중몇장', c.slideCount, c.slideTotal)
                : 말('결_몇장', c.slideCount))}</span>
          ${badge ? `<span class="badge" style="right:auto; left:6px; bottom:6px; top:auto;
              background:${TONE_BG[badge.tone]};">${esc(상태글)}</span>` : ''}
        </div>
        <div class="meta">
          <div class="cap">${esc(c.caption.slice(0, 60))}</div>
          <div class="muted" style="margin-top:4px;">
            ${c.likesHidden ? esc(말('결_좋아요비공개')) : '♥ ' + c.likes.toLocaleString()} ·
            💬 ${c.comments.toLocaleString()} · @${esc(c.author)}
          </div>
          ${isCardnews ? `<button data-label="${esc(c.id)}" style="margin-top:6px;">${esc(말('공_라벨'))}</button>` : ''}
          ${isCardnews && board.analyzable(status)
            ? `<button data-analyze="${esc(c.id)}" style="margin-top:6px; margin-left:6px;">${
              esc(낱말('상태', board.analyzeLabel(status), 언어))}</button>`
            : ''}
        </div>
      </div>`
    })
    .join('')

  $('boardGrid').querySelectorAll('[data-pin]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      togglePin(el.dataset.pin)
    }))
  $('boardGrid').querySelectorAll('.heart').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      dropPick(el.dataset.id)
    })
  )
  $('boardGrid').querySelectorAll('[data-label]').forEach((el) =>
    el.addEventListener('click', (e) => {
      // 카드 전체도 클릭을 받아 뷰어를 연다 — 막지 않으면 라벨 단추가 뷰어도 같이 연다
      e.stopPropagation()
      window.open(`/label.html?id=${encodeURIComponent(el.dataset.label)}`, '_blank')
    })
  )
  $('boardGrid').querySelectorAll('[data-analyze]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      runAnalyze(el.dataset.analyze)
    })
  )
  $('boardGrid').querySelectorAll('.card').forEach((el) =>
    el.addEventListener('click', () => {
      // 창고 주소는 이미 우리 주소라 중계기를 거칠 필요가 없다
      openViewerWindow(board.cardToPost(cards[Number(el.dataset.i)]), (u) => u,
        { accountCost: accountCostLabel(), 언어 })
    })
  )

  // 상태 호출은 카드뉴스에서만, 그리고 이 목록에 대해 아직 안 물어봤을 때만 한다.
  // 실패하거나 늦게 와도 카드는 이미 위에서 다 그려진 뒤라 목록이 비지 않는다.
  if (isCardnews && labelStatusFor !== cards) {
    board.labelStatus(언어).then((s) => {
      labelStatusCache = s
      labelStatusFor = cards
      renderBoard()
    }).catch(() => {})
  }
}

// 고정은 표에 남는다 — 승민님 화면에서도 같은 순서로 보여야 한다.
async function togglePin(id) {
  const card = state.board.find((c) => c.id === id)
  if (!card) return
  try {
    await board.setPin(id, !card.pinned, 언어)
    await loadBoard()
    $('boardStatus').textContent = 말(card.pinned ? '공_고정풀었음' : '공_고정했음')
  } catch (e) {
    if (e.needPassword) askPassword(() => togglePin(id))
    else $('boardStatus').textContent = e.message
  }
}

// '라벨 끝'일 때만 뜨는 단추. **두 걸음이다** — 먼저 「이 라벨로 해라」로 못을
// 박고(confirmLabels → '분석 대기'), 그 다음 계량을 실제로 건다(startAnalyze).
//
// 예전에는 첫 걸음만 있었고 계량은 사람이 자기 컴퓨터에서 명령을 쳐야 돌았다.
// 게시물이 늘 때마다 사람을 불러야 했다(2026-08-27).
//
// **기다리지 않는다.** 계량은 1~2분이고 서버는 202 만 준다. 끝났는지는 목록의
// 상태로 안다 — 그래서 곧바로 목록을 다시 읽고, 잠시 뒤 한 번 더 읽는다.
async function runAnalyze(id) {
  // **이름을 여기서 묻는다.** 이 틀은 저장소에 쌓여 Dify 고르는 칸에 줄로 뜬다 —
  // 이름이 없으면 게시물 코드(`DNUFIa4NIkK`)가 그 줄이 되고, 열 벌쯤 쌓이면
  // 아무도 못 고른다. 취소하면 분석도 안 건다: 이름 없이 굳어 버리면 다시
  // 분석해야만 고칠 수 있다.
  const card = state.board.find((c) => c.id === id)
  const 지음 = prompt(말('분_이름물음'), (card && card.author) || id)
  if (지음 === null) return
  try {
    await board.confirmLabels(id, 언어)
    await board.startAnalyze(id, 지음.trim(), 언어)
    await loadBoard() // state.board 를 새 배열로 갈아서 라벨 상태 캐시도 같이 다시 읽는다
    $('boardStatus').textContent = 말('분_걸었음')
    // 서버가 '분석중'으로 바꾸는 데 잠깐 걸린다. 한 번 더 읽어 그 표시를 띄운다.
    setTimeout(() => { loadBoard().catch(() => {}) }, 4000)
  } catch (e) {
    if (e.needPassword) askPassword(() => runAnalyze(id))
    else $('boardStatus').textContent = e.message
  }
}

// 빼면 창고의 그림도 같이 지운다. 안 지우면 창고에 쓰레기만 쌓인다.
async function dropPick(id) {
  const card = state.board.find((c) => c.id === id)
  if (!card) return
  if (!confirm(말('공_정말뺄까', card.slideCount))) return
  try {
    await board.removePick(id, 언어)
    // loadBoard() 가 renderBoard() 를 불러 boardStatus 칸을 덮어쓴다.
    // 안내가 지워지지 않게 다시 그린 뒤에 넣는다.
    await loadBoard()
    $('boardStatus').textContent = 말('공_뺐음')
  } catch (e) {
    if (e.needPassword) askPassword(() => dropPick(id))
    else $('boardStatus').textContent = e.message
  }
}

function renderBoardCount() {
  $('boardCount').textContent = String(state.board.length)
}

// 암호를 넣은 뒤 이어서 할 일. 401 을 만난 자리가 여기에 자기를 남긴다.
let pending = null

// 401 이 오면 암호 창을 띄우고, 들어온 뒤 하려던 일을 이어서 한다.
function askPassword(then) {
  $('pwMsg').textContent = ''
  $('pwIn').value = ''
  $('pwDlg').showModal()
  pending = then
}

$('pwForm').addEventListener('submit', async (e) => {
  // method="dialog" 는 submit 하는 순간 창을 닫는다. 서버에 물어보는 것은 await 라서,
  // 답이 온 뒤에 preventDefault 를 불러봐야 창은 이미 닫힌 뒤다.
  // 그래서 무조건 먼저 막고, 암호가 맞았을 때만 우리가 닫는다.
  e.preventDefault()
  const pw = $('pwIn').value.trim()
  $('pwIn').value = ''
  if (pw.length < 8) {
    $('pwMsg').textContent = 말('공_8자이상')
    return
  }
  $('pwMsg').textContent = 말('진_확인중')
  if (!(await board.login(pw))) {
    $('pwMsg').textContent = 말('공_암호다름')
    return
  }
  $('pwDlg').close()
  const next = pending
  pending = null
  if (next) next()
})

async function loadBoard() {
  try {
    state.board = await board.listPicks(state.contentType, 언어)
    state.picked = new Set(state.board.map((c) => c.id))
    renderBoardCount()
    renderBoard()
    render() // 검색 결과의 하트도 다시 그린다
  } catch (e) {
    if (e.needPassword) {
      askPassword(loadBoard)
      return
    }
    $('boardStatus').textContent = e.message
  }
}

// 하트 한 번에 슬라이드를 전부 서버 창고로 복사한다. 몇 초 걸리므로 진행을 보여준다.
async function takePick(post, heartEl) {
  if (state.picked.has(post.id)) {
    $('status').textContent = 말('공_이미담김')
    return
  }
  const thumb = heartEl.closest('.thumb')
  const note = document.createElement('div')
  note.className = 'copying'
  note.textContent = 말('공_복사준비')
  thumb.appendChild(note)
  heartEl.disabled = true
  try {
    const out = await board.pick(post, (done, total) => {
      note.textContent = 말('공_복사중', done, total)
    }, 언어)
    state.picked.add(post.id)
    $('status').textContent =
      out.saved === out.total
        ? 말('공_담았음', out.saved)
        : 말('공_일부만담음', out.total, out.saved)
    await loadBoard()
  } catch (e) {
    if (e.needPassword) {
      askPassword(() => takePick(post, heartEl))
    } else {
      $('status').textContent = 말('공_못담음', e.message)
    }
  } finally {
    note.remove()
    heartEl.disabled = false
  }
}

// 헤더 토글 — 검색·공동 목록 둘 다 이 상태를 따라 바뀐다.
function showContentType(type) {
  if (state.contentType === type) return
  state.contentType = type
  $('typeCardnews').classList.toggle('on', type === 'cardnews')
  $('typeReel').classList.toggle('on', type === 'reel')
  state.results = []
  state.used = []
  state.shown = PAGE
  renderUsed()
  render()
  renderCost()
  renderSortOptions({ keep: false })
  renderFavs() // 갈래마다 즐겨찾기가 다르다
  $('slideFilter').style.display = type === 'reel' ? 'none' : ''
  renderUpdates()
  // 탭이 어디에 있든 다시 읽는다. 검색 탭에 있을 때 안 읽으면 배지 숫자도,
  // 검색 결과의 하트도 반대편 갈래 것이 그대로 남는다.
  loadBoard()
}

$('typeCardnews').addEventListener('click', () => showContentType('cardnews'))
$('typeReel').addEventListener('click', () => showContentType('reel'))

// 탭 셋. **표로 잡는다** — 갈래가 둘일 때는 `onBoard` 하나로 됐지만, 셋부터는
// 참거짓 변수를 늘릴수록 «어느 판이 켜져 있나» 를 못 읽는다.
const 판들 = {
  search: { 단추: 'tabSearch', 판: 'searchPane' },
  board: { 단추: 'tabBoard', 판: 'boardPane' },
  templates: { 단추: 'tabTemplates', 판: 'templatePane' },
  made: { 단추: 'tabMade', 판: 'madePane' },
}

// 보던 판을 남긴다. 언어를 바꾸면 쪽을 다시 부르는데, 그때 검색 판으로
// 떨어지면 「눌렀더니 딴 데로 갔다」가 된다. 새로고침에도 같이 듣는다.
const 탭열쇠 = 'cardnews.수집기탭'

function showTab(which) {
  const 고른것 = 판들[which] ? which : 'search'
  try { sessionStorage.setItem(탭열쇠, 고른것) } catch { /* 사생활 보호 창 */ }
  for (const [이름, x] of Object.entries(판들)) {
    $(x.단추).classList.toggle('on', 이름 === 고른것)
    $(x.판).style.display = 이름 === 고른것 ? '' : 'none'
  }
  // 탭을 누를 때마다 새로 읽는다 — 승민님이 담은 것이 여기서 들어온다
  if (고른것 === 'board') loadBoard()
  if (고른것 === 'templates') loadTemplates()
  if (고른것 === 'made') loadMade()
}

for (const [이름, x] of Object.entries(판들)) {
  $(x.단추).addEventListener('click', () => showTab(이름))
}

// 창고의 틀 목록을 그림 격자로 편다. **암호 관문 밖이다** — 목록도 틀도 공개
// 파일이라 브라우저가 창고를 곧장 읽는다(중계할 것이 없다).
async function loadTemplates() {
  $('tplStatus').textContent = 말('진_읽는중')
  try {
    const 목록 = await templates.목록읽기(fetch, 언어)
    $('tplList').innerHTML = templates.격자(목록, 언어)
    $('tplCount').textContent = String(목록.length)
    $('tplStatus').textContent = ''
  } catch (e) {
    $('tplStatus').textContent = e.message
  }
}

// 만든 카드뉴스 목록. **암호 관문 밖이다** — 틀 목록과 같은 결로 창고를 곧장 읽는다.
async function loadMade() {
  $('madeStatus').textContent = 말('진_읽는중')
  try {
    const 목록 = await templates.만든것읽기(fetch, 언어)
    $('madeList').innerHTML = templates.만든격자(목록, 언어)
    $('madeCount').textContent = String(목록.length)
    $('madeStatus').textContent = ''
  } catch (e) {
    $('madeStatus').textContent = e.message
  }
}

// 이름 바꾸기. **다시 분석하지 않는다** — 이름 짓기가 나중에 생겨서, 그 전에
// 만든 틀은 이름이 게시물 코드다. 그걸 고치자고 게시물을 다시 재는 것은
// 값(구글 비전)도 시간도 아깝다.
async function renameTemplate(코드, 옛이름) {
  const 새이름 = prompt(말('템_새이름'), 옛이름)
  if (새이름 === null) return
  if (!새이름.trim()) return
  $('tplStatus').textContent = 말('템_바꾸는중')
  try {
    const res = await fetch('/api/template/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 코드, 이름: 새이름.trim() }),
    })
    const j = await res.json()
    if (!res.ok || j.ok === false) throw new Error(j.why || 말('템_못바꿈'))
    $('tplStatus').textContent = 말('템_바꿨음', j.이름)
    await loadTemplates()
  } catch (e) {
    $('tplStatus').textContent = e.message
  }
}

// 이름 한 줄을 집어 가는 단추. Dify 고르는 칸에 그대로 붙여 넣을 값이다.
// 만들기. **넷을 고른다** — 디자인(누른 그 틀)·말투·주제·원고.
//
// 몇 분 걸리는 일이라 번호표를 받고 몇 초마다 물어본다. 채팅(RITA)이 쓰는 그
// 방식 그대로고, 뒤에서 도는 사슬도 같은 것이다.
let 만드는중 = null

// **틀이름은 서버로 가는 값, 보임이름은 화면에 거는 글자다.** 영어 이름을 그대로
// 보내면 서버가 「그런 틀이 없다」로 막는다.
async function openMake(틀이름, 보임이름 = 틀이름) {
  if (만드는중) return
  let 말투목록 = []
  try {
    말투목록 = await templates.말투읽기(fetch, 언어)
  } catch (e) {
    $('tplStatus').textContent = e.message
  }
  $('makePane').innerHTML = templates.만들기칸(보임이름, 말투목록, 언어)
  $('makePane').style.display = ''
  $('makeCancel').onclick = closeMake
  $('makeGo').onclick = () => runMake(틀이름)
  $('makeTopic').focus()
}

function closeMake() {
  만드는중 = null
  $('makePane').style.display = 'none'
  $('makePane').innerHTML = ''
}

async function runMake(틀이름) {
  const 주제 = $('makeTopic').value.trim()
  if (!주제) return ($('makeStatus').textContent = 말('만_주제비었음'))
  $('makeGo').disabled = true
  $('makeStatus').textContent = 말('만_만드는중')
  try {
    const res = await fetch('/api/make', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // **스위치는 채팅 화면에만 있다.** 이 화면은 그 옆 칸에 창으로 뜨고
      // 같은 브라우저 저장소를 쓰므로, 고른 것을 읽어 그대로 싣는다. 여기에
      // 스위치를 하나 더 두면 둘이 어긋난다(사람 결정 2026-09-18: 스위치 하나).
      body: JSON.stringify({ 주제, 틀: 틀이름,
                             말투: $('makeTone').value,
                             원고: $('makeScript').value.trim(),
                             언어 }),
    })
    const 접수 = await res.json()
    if (!res.ok || !접수.job_id) throw new Error(접수.why || 말('만_못걸었음'))
    만드는중 = 접수.job_id
    await 기다리기(접수.job_id)
  } catch (e) {
    $('makeStatus').textContent = e.message
  } finally {
    if ($('makeGo')) $('makeGo').disabled = false
  }
}

// **끝날 때까지 몇 초마다 물어본다.** 창을 닫으면 멈춘다 — 카드뉴스는 그래도
// 만들어지고 「만든 것」 탭에 쌓인다.
async function 기다리기(번호) {
  const 시작 = Date.now()
  while (만드는중 === 번호 && Date.now() - 시작 < 15 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 5000))
    if (만드는중 !== 번호) return
    const res = await fetch(`/api/jobs/${encodeURIComponent(번호)}`)
    const 봉투 = await res.json().catch(() => ({}))
    if (봉투.status === 'succeeded') {
      $('makeStatus').textContent = 말('만_다됐음')
      $('makeOut').innerHTML = templates.만든결과(봉투.result)
      만드는중 = null
      loadMade().catch(() => {})
      return
    }
    if (봉투.status === 'failed') {
      만드는중 = null
      $('makeStatus').textContent = (봉투.error && 봉투.error.message) || 말('만_못만들었음')
      return
    }
    const 몫 = Number(봉투.progress)
    $('makeStatus').textContent = Number.isFinite(몫)
      ? 말('만_만드는중몇', 몫) : 말('만_만드는중')
  }
}

// 틀 들여다보기. **틀 파일은 사람이 볼 게 못 된다** — 기계가 읽는 날것이라
// 숫자만 죽 늘어선다. 그 안의 재료로 장마다 그림을 그린다.
async function peekTemplate(코드, 이름) {
  $('peekPane').style.display = ''
  $('peekPane').innerHTML = `<p class="tpl-meta">${말('진_읽는중')}</p>`
  try {
    const 틀 = await templates.틀읽기(코드, fetch, 언어)
    $('peekPane').innerHTML = templates.틀그림(틀, 이름, 언어)
    $('peekClose').onclick = () => {
      $('peekPane').style.display = 'none'
      $('peekPane').innerHTML = ''
    }
  } catch (e) {
    $('peekPane').innerHTML = `<p class="tpl-meta">${e.message}</p>`
  }
}

$('tplList').addEventListener('click', async (e) => {
  const 보기 = e.target.closest('.tpl-peek')
  // **제목은 화면 이름, 읽어 오는 것은 코드다.** 영어로 골랐으면 영어 이름이 뜬다.
  if (보기) return peekTemplate(보기.dataset.code, 보기.dataset.보임 || 보기.dataset.name)
  const 만들기 = e.target.closest('.tpl-make')
  if (만들기) return openMake(만들기.dataset.name, 만들기.dataset.보임 || 만들기.dataset.name)
  const 바꾸기 = e.target.closest('.tpl-rename')
  if (바꾸기) return renameTemplate(바꾸기.dataset.code, 바꾸기.dataset.name)
  const 단추 = e.target.closest('.tpl-copy')
  if (!단추) return
  try {
    await navigator.clipboard.writeText(단추.dataset.name)
    $('tplStatus').textContent = 말('템_복사했음', 단추.dataset.name)
  } catch {
    $('tplStatus').textContent = 말('템_이름은', 단추.dataset.name)
  }
})

// 마지막으로 열어본 소식의 표식. 콘텐츠 종류마다 따로 센다 — 카드뉴스에서 다 읽어도
// 릴스 전용 미읽음 소식이 있으면 릴스 쪽에서 점이 따로 뜬다.
const seenKey = (type) => `updates_seen_${type}`

function renderUpdates() {
  const list = updatesFor(state.contentType)
  $('updList').innerHTML = list.map((소식) => {
    const u = 소식글(소식, 언어)
    return `
    <section>
      <h4>${esc(u.title)}</h4>
      <p>${esc(u.body)}</p>
      <div class="muted" style="margin-top:6px;">${esc(u.date)}</div>
    </section>`
  }).join('')
  const latest = markerOf(list)
  $('updDot').style.display = hasUnseen(localStorage.getItem(seenKey(state.contentType)), latest) ? '' : 'none'
}

$('updBtn').addEventListener('click', () => {
  $('updDlg').showModal()
  const latest = markerOf(updatesFor(state.contentType))
  try { localStorage.setItem(seenKey(state.contentType), latest) } catch { /* 저장 못 해도 읽기는 된다 */ }
  $('updDot').style.display = 'none'
})

detectProxy().then(() => render()) // 중계가 있으면 이미지 주소를 갈아끼운다

화면글자채우기() // 다른 그리기보다 먼저 — HTML 에 박힌 열쇠를 글자로 바꾼다
if ($('langBtn')) $('langBtn').addEventListener('click', 언어바꾸기)
renderCounts()
renderUpdates()
restoreSession()
renderSortOptions() // 되살린 결과에 조회수가 있는지 보고 정하므로 restoreSession 뒤여야 한다
renderCost()
renderUsed()
state.favs = loadFavorites(localStorage)
renderFavs()
render()
scoreCovers() // 새로고침으로 되살린 결과도 점수를 다시 잰다
loadBoard() // 담긴 것을 먼저 읽어야 검색 결과의 하트를 옳게 그린다

// 보던 판으로 돌아간다. **맨 마지막이다** — showTab 이 그 판을 읽어 오므로
// 위의 첫 그림이 다 끝난 뒤라야 한다.
try {
  const 봤던것 = sessionStorage.getItem(탭열쇠)
  if (봤던것 && 봤던것 !== 'search') showTab(봤던것)
} catch { /* 사생활 보호 창 — 검색 판으로 둔다 */ }
