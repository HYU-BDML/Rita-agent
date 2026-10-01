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

export function 단계줄(단계) {
  const 표 = { "됨": "✅", "하는 중": "⏳", "실패": "❌" }[단계.state] || "⬜";
  return `${표} ${단계.name}${단계.note ? " — " + 단계.note : ""}`;
}

const 달러 = (x) => "$" + (x < 0.1 ? x.toFixed(3) : x.toFixed(2));

// 딥시크 + OpenAI 그림만 — Apify 는 뺀다(2026-10-01 사용자)
export function 돈줄(c) {
  if (!c) return "";
  return `쓴 돈 약 ${달러(c.합계)} (딥시크 ${달러(c.딥시크)} · 그림 ${c.그림장수}장 ${달러(c.그림)}`
    + `${c.표지값모름 ? ", 표지 값 모름" : ""}, Apify 뺌)`;
}

export function 계속볼까(job) {
  return Boolean(job) && job.state === "만드는 중";
}

const 짧은날 = (iso) => {
  if (!iso) return "?";
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
};

export function 판이름(job) {
  return job.kind === "주제" ? (job.order?.분야이름 ?? "새 분야") : job.week;
}

export function 목록줄(job) {
  const 주제 = job.kind === "주제";
  const 뒤 = job.state === "됨" ? (주제 ? `${job.result?.bundle?.length ?? 0}건` : `${job.result?.slides ?? "?"}장`)
    : job.state === "만드는 중" ? `만드는 중 ${job.pct ?? 0}%`
    : (job.error || job.state);
  const 이름 = 주제 ? `🔎 ${판이름(job)} (${짧은날(job.order?.시작)}~${짧은날(job.order?.끝)})` : job.week;
  return `${아이콘[job.state] || "•"} ${이름} · ${시각(job.started)} · ${뒤}`;
}

export function 빠진것들(result) {
  if (!result) return [];
  if (result.bundle) {
    return [
      ...(result.dropped || []).map((x) => `빠진 소식: ${x.사건} — ${사람말(x.까닭)}`),
      ...(result.unfilled || []).map((x) => `못 채운 칸: ${x.slot} — ${사람말(x.why)}`
        + ((x.searched || []).length ? ` (찾아본 곳: ${x.searched.join(", ")})` : "")
        + (x.more_cost ? ` · 더 쓰면 ${x.more_cost}` : "")),
      ...끈도구줄들(result.blocked),
    ];
  }
  return [
    ...(result.missing_slides || []).map((x) => `빠진 장: ${x.no}번 (${x.why})`),
    ...(result.missing_brands || []).map((x) => `빠진 브랜드: ${x.brand} — ${x.why}`),
  ];
}

// 주제 판은 자료 수집(Apify)도 짐작해서 더한다 — 주간 판은 옛 서버가 긁어서 «Apify 뺌».
// 리타 사용자는 «Apify» 를 모르니 화면엔 «자료 수집» 으로(2026-10-01 UX 점검)
export function 주제돈줄(c) {
  if (!c) return "";
  return `쓴 돈 약 ${달러(c.합계)} (딥시크 ${달러(c.딥시크)} · 자료 수집 ${달러(c.아피파이 ?? 0)})`;
}

export function 총시간줄(job) {
  if (!job.started || !job.updated || job.state === "만드는 중") return "";
  const 돈 = job.cost ? ` · ${job.kind === "주제" ? 주제돈줄(job.cost) : 돈줄(job.cost)}` : "";
  return `총 걸린 시간: ${걸린시간(job.started, job.updated)}` + 돈;
}

// 만드는 중이면 «지금» 까지 센다 — 기록이 바뀔 때만 세면 숫자가 멈춰 보인다(2026-10-01 사용자)
export function 제목줄(job, 지금) {
  return `${판이름(job)} · ${job.state}` + (job.state === "만드는 중" ? ` · ${걸린시간(job.started, 지금)}` : "");
}

export function 주문서줄들(o) {
  if (!o) return [];
  const 목록 = (x) => (x && x.length ? x.join(", ") : "-");
  return [["주제", o.주제], ["범위", o.범위 || "-"], ["기간", `${o.시작} ~ ${o.끝}` + (o.기간말 ? ` (${o.기간말})` : "")],
    ["넣을 것", 목록(o.넣을것)], ["뺄 것", 목록(o.뺄것)], ["목표", `${o.목표건수}건`], ["한 장 단위", o.한장단위 || "-"],
    ["분야 이름", o.분야이름],
    ["찾는 넓이", `${o.등급} ${넓이[o.등급] || ""} — 도구 ${o.예산.호출}번 · $${o.예산.돈} · ${o.예산.분}분까지`]];
}

export function 예산줄(board) {
  const e = board?.예산;
  if (!e) return "";
  return `도구 ${e.호출}/${e.호출한도}번 · 돈 ${달러(e.돈)}/$${e.돈한도} · ${Math.round(e.남은분)}분 남음`;
}

const 단계들 = [["①", "이해하기"], ["②", "지도 그리기"], ["③", "넓게 훑기"], ["④", "들어가 보기"], ["⑤", "단서 따라 깊게"],
  ["⑥", "빈칸 점검"], ["⑦", "증거 다지기·정리"]];

export function 단계표(지금) {
  const i = 단계들.findIndex(([표]) => 표 === 지금);
  return 단계들.map(([표, 이름], j) => ({ 표, 이름, 상태: j < i ? "지남" : j === i ? "지금" : "아직" }));
}

// 걸음마다 쓴 돈 한 줄(cost.걸음별) — 사용자 «매번 얼마 썼는지» (2026-10-01 «나»)
export function 걸음돈줄(x) {
  const 돈 = `${달러(x.합계)}` + (x.아피파이 ? ` (자료 수집 약 ${달러(x.아피파이)})` : "");
  if (x.걸음 == null) return `검증·정리 · ${돈}`;
  const 단 = 단계들.find(([표]) => 표 === x.단계);
  return `${x.걸음}걸음 · ${단 ? `${단[0]} ${단[1]} · ` : ""}도구 ${x.도구.length}개 · 생각 ${x.생각토큰.toLocaleString("ko-KR")}토큰 · ${돈}`;
}

export function 대화돈줄(c) {
  return c?.합계 ? `주제 다듬기에 쓴 돈 ${달러(c.합계)}` : "";
}

export function 칸줄(칸) {
  const 표 = { "채움": "✅", "후보": "🔍", "빈칸": "⬜" }[칸.상태] || "•";
  return `${표} ${칸.사건 || "빈칸"}` + (칸.미디어 && 칸.미디어 !== "없음" ? ` · ${칸.미디어}` : "");
}

const 플랫폼이름 = { x: "X", instagram: "인스타", threads: "스레드", page: "기사", web: "웹" };

export function 소식머리(d) {
  return `${d.순서}. ${d.주인공} · ${d.사건}`;
}

export function 소식밑줄(d) {
  const r = d.반응 || {};
  const 계정 = ["page", "web"].includes(d.출처.플랫폼) ? d.출처.계정 : `@${d.출처.계정}`;  // 기사는 계정이 아니라 사이트
  return `${d.날짜} · ${플랫폼이름[d.출처.플랫폼] || d.출처.플랫폼} ${계정}`
    + (r.좋아요 ? ` · ♥ ${r.좋아요.toLocaleString("ko-KR")}` : "")
    + (d.배수 >= 1.5 ? ` · 평소의 ${d.배수}배 인기` : "");
}

export function 대화줄(m) {
  return `${m.who === "사람" ? "나" : "지휘자"}: ${m.text}`;
}

export function 지갑띠글(w) {
  if (!w) return "";
  if (w.apify?.멈춤) return "이번 달 자료 모으기 분량을 거의 다 써서 새 분야는 잠시 쉬어요 — AI 소식은 그대로 돼요";
  if (w.deepseek?.멈춤) return "딥시크 잔액이 얼마 안 남아 새 분야는 잠시 쉬어요 — AI 소식은 그대로 돼요";
  if (w.apify?.낮음) return `이번 달 자료 모으기 분량이 얼마 안 남았어요 (약 ${달러(w.apify.쓸수있는합)}) — 다 쓰면 새 분야는 잠시 쉬어요`;
  return "";
}

export function 새분야막힘(w) {
  return Boolean(w?.apify?.멈춤 || w?.deepseek?.멈춤);
}

// 기록에서 온 주소는 http(s) 만 링크·미디어로 쓴다
export function 안전주소(u) {
  return /^https?:\/\//i.test(u || "") ? u : "";
}

const 넓이 = { A: "좁음", B: "보통", C: "넓음" };

// 사람에게 보일 말에서 내부 증거 번호(E3 · E7#2 · [E3, E41])를 뺀다 — 처음 온 사람은 뜻을 모른다(2026-10-01 UX 점검)
export function 사람말(글) {
  return String(글 || "")
    .replace(/\s*\[E\d+(?:#\d+)?(?:\s*,\s*E\d+(?:#\d+)?)*\]/g, "")
    .replace(/(^|[^\w])E\d+(?:#\d+)?\s*/g, "$1")
    .replace(/ {2,}/g, " ")
    .trim();
}

// 저장된 분야(Task 14-2) — 주문서 요약과 기간 고르기. 첫 칸이 기본.
export const 저장기간들 = [["지난주", "지난주"], ["이번주", "이번 주"], ["최근N일", "최근 7일"], ["이번달", "이번 달"],
  ["지난달", "지난달"]];

export function 분야줄들(f) {
  const 본 = f?.본 || {};
  const 목록 = (x) => (x && x.length ? x.join(", ") : "-");
  return [["주제", 본.주제], ["범위", 본.범위 || "-"], ["넣을 것", 목록(본.넣을것)], ["뺄 것", 목록(본.뺄것)],
    ["목표", `${본.목표건수}건`], ["찾는 넓이", `${본.등급} ${넓이[본.등급] || ""}`.trim()]];
}

const 도구이름 = { x_search: "X 검색", x_account: "X 계정", instagram_search: "인스타 검색", instagram_account: "인스타 계정",
  threads_account: "스레드", web_search: "웹 검색", read_page: "기사 읽기", view_images: "사진 판정" };

// 도중에 끈 도구를 까닭마다 한 줄로 — «Apify 분량» 같은 말은 사람 말로(최종 검토 I5)
function 끈도구줄들(blocked) {
  const 묶음 = new Map();
  for (const x of blocked || []) {
    const 까닭 = /Apify 분량/.test(x.까닭) ? "자료 모으기 분량이 떨어져서"
      : /^두 번 실패/.test(x.까닭) ? "두 번 고장 나서" : 사람말(x.까닭);
    묶음.set(까닭, [...(묶음.get(까닭) || []), 도구이름[x.도구] || x.도구]);
  }
  return [...묶음].map(([까닭, 도구들]) => `도중에 끈 도구: ${도구들.join("·")} — ${까닭}`);
}
