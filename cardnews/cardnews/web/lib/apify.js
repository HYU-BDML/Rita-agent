import { pickKey, MIN_REMAINING_USD } from './keys.js'
// 화면 글자는 한 벌뿐이다 — `수집기말.js`.
import { 말하기 } from './수집기말.js'

const API = 'https://api.apify.com/v2'
const MAX_RETRY = 3
const BACKOFF_MS = [3000, 8000, 20000]
const POLL_MS = 3000
const TIMEOUT_MS = 600000

async function req(url, key, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// state: 'ok'(잔액 확인됨) | 'invalid'(401/403 — 키 자체가 틀렸다) | 'unknown'(네트워크·5xx — 판단 불가)
export async function keyStatus(key) {
  try {
    const d = (await req(`${API}/users/me/limits`, key)).data
    return { state: 'ok', remaining: d.limits.maxMonthlyUsageUsd - d.current.monthlyUsageUsd }
  } catch (e) {
    if (e.status === 401 || e.status === 403) return { state: 'invalid', remaining: null }
    return { state: 'unknown', remaining: null }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const LIVE = (s) => s === 'READY' || s === 'RUNNING'

export function cancelledError(언어) {
  const e = new Error(말하기(언어)('집_중단했음'))
  e.cancelled = true
  return e
}

// 중단은 화면만 멈추는 게 아니다. 남겨두면 계속 과금되므로 실행 자체를 세운다.
async function abortRun(runId, key) {
  try {
    await req(`${API}/actor-runs/${runId}/abort`, key, 'POST')
  } catch { /* 이미 끝난 실행이면 실패해도 상관없다 */ }
}

// memory: 실행에 붙일 메모리(MB). 액터마다 시작 비용이 메모리에 비례하므로 소스가 정해서 넘긴다.
// null 이면 지정하지 않고 액터 기본값을 따른다.
export async function runActor(actorId, input,
  { keys, memory = null, onProgress = () => {}, signal = null, 언어 } = {}) {
  const 말 = 말하기(언어)
  const dead = new Set()
  let retry = 0
  // 이미 만든 실행은 곧 지불한 실행이다. 재시도는 이것을 이어받아 폴링/데이터셋 재조회만 한다.
  let run = null
  let runKey = null
  let runStatus = 'READY'
  let startedAt = 0 // 최초 실행 생성 시점. 재개해도 리셋하지 않는다

  while (true) {
    if (signal && signal.aborted) throw cancelledError(언어)
    const statuses = []
    for (const k of keys) {
      if (dead.has(k)) continue
      statuses.push({ key: k, ...(await keyStatus(k)) })
    }
    const key = pickKey(statuses.map((s) => ({ key: s.key, remaining: s.remaining })))
    if (!key) {
      const invalid = statuses.filter((s) => s.state === 'invalid').length
      const unknown = statuses.filter((s) => s.state === 'unknown').length
      throw new Error(
        invalid && invalid === statuses.length
          ? 말('키_틀림')
          : unknown
            ? 말('키_상태모름')
            : invalid
              ? 말('키_몇개틀리고나머지소진', invalid)
              : 말('키_다소진')
      )
    }
    // 이전 실행은 이전 키 소유라 다른 키로는 조회할 수 없다. 키가 바뀌면 이어받기를 포기한다.
    if (run && key !== runKey) {
      run = null
      runStatus = 'READY'
    }

    let why = null
    let timedOut = false
    try {
      if (!run) {
        onProgress(말('집_시작'))
        const url = `${API}/acts/${actorId}/runs${memory ? `?memory=${memory}` : ''}`
        run = (await req(url, key, 'POST', input)).data
        runKey = key
        runStatus = run.status || 'READY'
        startedAt = Date.now()
      }
      while (LIVE(runStatus) && Date.now() - startedAt < TIMEOUT_MS) {
        await sleep(POLL_MS)
        if (signal && signal.aborted) {
          await abortRun(run.id, key)
          throw cancelledError(언어)
        }
        runStatus = (await req(`${API}/actor-runs/${run.id}`, key)).data.status
        if (LIVE(runStatus)) onProgress(말('집_도는중', Math.round((Date.now() - startedAt) / 1000)))
      }
      if (runStatus === 'SUCCEEDED') {
        onProgress(말('집_결과받는중'))
        return await req(`${API}/datasets/${run.defaultDatasetId}/items?format=json`, key)
      }
      if (LIVE(runStatus)) {
        timedOut = true
      } else {
        // 실행이 끝났는데 성공이 아니다. 그 실행은 더 이상 과금되지 않으므로 새로 띄워도 된다.
        why = 말('집_실행상태', runStatus)
        run = null
        runStatus = 'READY'
      }
    } catch (e) {
      if (e.cancelled) throw e // 중단은 실패가 아니다. 재시도하지 않는다.
      why = e.message
    }

    // 제한 시간이 지났는데 실행이 살아 있다 = 계속 과금 중이다. 여기서 새 실행을 띄우면 중복 과금이다.
    if (timedOut) {
      throw new Error(말('집_너무오래'))
    }

    // 실패 원인을 반드시 규명한다. 실패했다는 사실만으로 키를 버리지 않는다.
    const st = await keyStatus(key)
    if (st.state === 'ok' && st.remaining < MIN_REMAINING_USD) {
      dead.add(key)
      onProgress(말('집_소진건너뜀'))
      continue
    }
    if (st.state === 'invalid') {
      dead.add(key)
      onProgress(말('집_틀린키건너뜀'))
      continue
    }
    if (retry >= MAX_RETRY) {
      throw new Error(
        st.state === 'unknown' ? 말('집_망_네트워크', why) : 말('집_망_입력', why)
      )
    }
    await sleep(BACKOFF_MS[Math.min(retry, BACKOFF_MS.length - 1)])
    retry += 1
    onProgress(run ? 말('집_이어받음', retry, MAX_RETRY) : 말('집_다시함', retry, MAX_RETRY))
  }
}
