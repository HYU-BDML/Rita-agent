// 화면에 쓰는 글 만들기 — DOM 을 안 만진다(시험이 node 에서 돈다).
export function 주차글(w) {
  const [, sm, sd] = w.start.split("-").map(Number);
  const [, em, ed] = w.end.split("-").map(Number);
  return `${w.label} (${sm}/${sd}~${em}/${ed})`;
}

export function 시각(iso) {
  if (!iso) return "";
  const k = new Date(Date.parse(iso) + 9 * 3600e3);
  const 두 = (n) => String(n).padStart(2, "0");
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${두(k.getUTCHours())}:${두(k.getUTCMinutes())}`;
}

export function 걸린시간(started, updated) {
  const s = Math.max(0, Math.round((Date.parse(updated) - Date.parse(started)) / 1000));
  return `${Math.floor(s / 60)}분 ${s % 60}초`;
}

const 아이콘 = { "됨": "✅", "만드는 중": "⏳", "실패": "❌", "멈춤": "⏸" };

export function 목록줄(job) {
  const 뒤 = job.state === "됨" ? `${job.result?.slides ?? "?"}장`
    : job.state === "만드는 중" ? `만드는 중 ${job.pct ?? 0}%`
    : (job.error || job.state);
  return `${아이콘[job.state] || "•"} ${job.week} · ${시각(job.started)} · ${뒤}`;
}

export function 단계줄(단계) {
  const 표 = { "됨": "✅", "하는 중": "⏳", "실패": "❌" }[단계.state] || "⬜";
  return `${표} ${단계.name}${단계.note ? " — " + 단계.note : ""}`;
}

export function 빠진것들(result) {
  if (!result) return [];
  return [
    ...(result.missing_slides || []).map((x) => `빠진 장: ${x.no}번 (${x.why})`),
    ...(result.missing_brands || []).map((x) => `빠진 브랜드: ${x.brand} — ${x.why}`),
  ];
}

const 달러 = (x) => "$" + (x < 0.1 ? x.toFixed(3) : x.toFixed(2));

// 딥시크 + OpenAI 그림만 — Apify 는 뺀다(2026-10-01 사용자)
export function 돈줄(c) {
  if (!c) return "";
  return `쓴 돈 약 ${달러(c.합계)} (딥시크 ${달러(c.딥시크)} · 그림 ${c.그림장수}장 ${달러(c.그림)}`
    + `${c.표지값모름 ? ", 표지 값 모름" : ""}, Apify 뺌)`;
}

export function 총시간줄(job) {
  if (!job.started || !job.updated || job.state === "만드는 중") return "";
  return `총 걸린 시간: ${걸린시간(job.started, job.updated)}` + (job.cost ? ` · ${돈줄(job.cost)}` : "");
}

// 만드는 중이면 «지금» 까지 센다 — 기록이 바뀔 때만 세면 숫자가 멈춰 보인다(2026-10-01 사용자)
export function 제목줄(job, 지금) {
  return `${job.week} · ${job.state}` + (job.state === "만드는 중" ? ` · ${걸린시간(job.started, 지금)}` : "");
}

export function 계속볼까(job) {
  return Boolean(job) && job.state === "만드는 중";
}
