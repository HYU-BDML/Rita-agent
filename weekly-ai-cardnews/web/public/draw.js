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

// 주제 판 건수 — 목표가 있으면 «5건 중 3건». «3건» 만 보여 다 채운 줄 알았다(판 3). «3/5» 는 목록의 날짜(9/21)와 헷갈려 안 쓴다.
function 건수글(job) {
  const n = job.result?.bundle?.length ?? 0;
  const 목표 = job.order?.목표건수;
  return 목표 ? `${목표}건 중 ${n}건` : `${n}건`;
}

export function 목록줄(job) {
  const 주제 = job.kind === "주제";
  const 뒤 = job.state === "됨" ? (주제 ? 건수글(job) : `${job.result?.slides ?? "?"}장`)
    : job.state === "만드는 중" ? `만드는 중 ${job.pct ?? 0}%`
    : (job.error || job.state);
  const 이름 = 주제 ? `🔎 ${판이름(job)} (${짧은날(job.order?.시작)}~${짧은날(job.order?.끝)})` : job.week;
  return `${아이콘[job.state] || "•"} ${이름} · ${시각(job.started)} · ${뒤}`;
}

// 카드가 실패했거나 빠진 장이 있는 «됨» 판 — 카드만 대본부터 다시 굽는다(계획 4 D-4). 한 판에 두 번까지, 누구나
export const 카드다시최대 = 2;
export function 카드다시(job) {
  const 카 = job?.result?.카드;
  if (job?.state !== "됨" || !(job.result?.bundle || []).length || !카) return null;
  if (!카.오류 && !(카.빠진장 || []).length) return null;
  const 남은 = 카드다시최대 - (job.카드다시 || 0);
  if (남은 <= 0) return null;
  return { 글: `카드만 다시 구워요 — 이 판에서 ${남은}번 더 할 수 있어요 (한 번에 약 10~15센트)` };
}

// 새 분야 카드뉴스 한 줄(계획 3) — 보기 주소 · 못 만든 까닭 · 소식이 없어 안 만듦. 카드를 안 굽는 판(평가)은 null
export function 카드줄(result) {
  const 카 = result?.카드;
  if (카?.보기) {
    const 빠짐 = (카.빠진장 || []).length;
    return { 보기: 카.보기, 글: `카드뉴스 ${카.장수}장` + (빠짐 ? ` · 못 구운 장 ${빠짐}` : "") };
  }
  if (카?.오류) return { 글: `카드뉴스를 못 만들었어요 — ${사람말(카.오류)}` };
  if (result && !(result.bundle || []).length) return { 글: "소식이 없어서 카드뉴스는 만들지 않았어요" };
  return null;
}

export function 빠진것들(result) {
  if (!result) return [];
  if (result.bundle) {
    return [
      ...(result.dropped || []).map((x) => `빠진 소식: ${x.사건} — ${뺀까닭(x.까닭)}`),
      ...(result.unfilled || []).map((x) => `못 채운 칸: ${x.slot} — ${사람말(x.why)}`
        + ((x.searched || []).length ? ` (찾아본 곳: ${x.searched.map(곳말).join(", ")})` : "")
        + (x.more_cost ? ` · 더 쓰면 ${사람말(x.more_cost)}` : "")),
      ...끈도구줄들(result.blocked),
      ...((result.카드 || {}).빠진장 || []).map((x) => `못 구운 장: ${x.no}번 — ${x.why}`),
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
  const 몫 = [`딥시크 ${달러(c.딥시크)}`, `자료 수집 ${달러(c.아피파이 ?? 0)}`];
  if (c.그림 > 0) 몫.push(`그림 ${달러(c.그림)}`);
  if (c.수리 > 0) 몫.push(`도구 고치기 ${달러(c.수리)}`);
  return `쓴 돈 약 ${달러(c.합계)} (${몫.join(" · ")})`;
}

export function 총시간줄(job) {
  if (!job.started || !job.updated || job.state === "만드는 중") return "";
  const 돈 = job.cost ? ` · ${job.kind === "주제" ? 주제돈줄(job.cost) : 돈줄(job.cost)}` : "";
  if (job.다시시작) return `카드 다시 굽기에 걸린 시간: ${걸린시간(job.다시시작, job.updated)}` + 돈;
  return `총 걸린 시간: ${걸린시간(job.started, job.updated)}` + 돈;
}

// 만드는 중이면 «지금» 까지 센다 — 기록이 바뀔 때만 세면 숫자가 멈춰 보인다(2026-10-01 사용자)
export function 제목줄(job, 지금) {
  return `${판이름(job)} · ${job.state}` + (job.state === "만드는 중" ? ` · ${걸린시간(job.다시시작 || job.started, 지금)}` : "")
    + (job.kind === "주제" && job.state === "됨" && job.result?.bundle ? ` · ${건수글(job)}` : "");
}

export function 주문서줄들(o) {
  if (!o) return [];
  const 목록 = (x) => (x && x.length ? x.join(", ") : "-");
  return [["주제", o.주제], ["범위", o.범위 || "-"], ["기간", `${o.시작} ~ ${o.끝}` + (o.기간말 ? ` (${o.기간말})` : "")],
    ["넣을 것", 목록(o.넣을것)], ["뺄 것", 목록(o.뺄것)],
    ["목표", `${o.목표건수}건`], ["한 장 단위", o.한장단위 || "-"],
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
const 덧줄이름 = { 카드: "카드 만들기" };  // 걸음 밖 돈 줄(계획 4 D-7)

export function 걸음돈줄(x) {
  const 돈 = `${달러(x.합계)}` + (x.아피파이 ? ` (자료 수집 약 ${달러(x.아피파이)})` : "")
    + (x.그림 ? ` (그림 약 ${달러(x.그림)})` : "");
  if (x.걸음 == null) return `${덧줄이름[x.단계] || x.단계 || "검증·정리"} · ${돈}`;  // 걸음 밖 줄 — 검증·정리·카드 만들기·도구 고치기(계획 4)
  if (x.걸음 === 0) return `매주 볼 곳 보기 · 도구 ${x.도구.length}개 · ${돈}`;  // 서버가 목록대로 먼저 본 몫(계획 4)
  const 단 = 단계들.find(([표]) => 표 === x.단계);
  return `${x.걸음}걸음 · ${단 ? `${단[0]} ${단[1]} · ` : ""}도구 ${x.도구.length}개 · 생각 ${x.생각토큰.toLocaleString("ko-KR")}토큰 · ${돈}`;
}

export function 대화돈줄(c) {
  if (!c?.합계) return "";
  return `주제 다듬기에 쓴 돈 ${c.합계 < 0.001 ? "$0.001 미만" : 달러(c.합계)}`;  // «$0.000» 이 떴다(진짜 한 판)
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

// 분야 지우기 표를 브라우저에 간직하는 열쇠 — 저장한 브라우저에서만 지운다(계획 2-1 설계 4장)
export const 지우기표열쇠 = (field) => `분야표:${field}`;

// 대화를 기다리는 동안 흐르는 초 — «생각 중이에요…» 만 보고 기다렸다(판 3 대화). 보통 10~40초는 판 3 대화 실측(9·29·40초).
export function 생각중줄(보낸때, 지금) {
  const 초 = Math.round((Date.parse(지금) - Date.parse(보낸때)) / 1000);
  return Number.isFinite(초) ? `지휘자가 생각 중이에요… ${Math.max(0, 초)}초 (보통 10~40초)` : "지휘자가 생각 중이에요… (보통 10~40초)";
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
    .replace(/\(\s*\)/g, "")  // 번호를 지운 자리 «namu.wiki()» (판 4)
    .replace(/ {2,}/g, " ")
    .trim();
}

// 지휘자가 쓰는 곳 이름(«x:계정»·«web:도메인») 을 사람 말로 — «x:hearts2hearts, web:namu.wiki» 가 그대로 떴다(판 4)
const 플랫폼말 = { x: "X", instagram: "인스타", threads: "스레드" };
function 곳말(곳) {
  const [앞, ...뒤] = String(곳).split(":");
  const 핵 = 뒤.join(":").trim();
  if (!핵) return String(곳);
  return 플랫폼말[앞] ? `${플랫폼말[앞]} @${핵.replace(/^@/, "")}` : 핵;
}

// 관문이 뺀 까닭(관문 말)을 사람 말로 — «…발췌로 받쳐지지 않음(모자람: )» 이 그대로 떴다(판 3)
const 뺀까닭꼴 = [[/글자 그대로 없음/, "따온 문구가 원문과 달라서"], [/기간\(.*\) 밖/, "기간 밖 글이라서"],
  [/날짜를 모름/, "원문 날짜를 몰라서"], [/원문 날짜 .* 와 다름/, "날짜가 원문과 달라서"],
  [/같은 사건/, "다른 소식과 같은 일이라서"], [/같은 출처/, "다른 소식과 같은 글이라서"],
  [/숫자 .* 발췌에 없음/, "원문에 없는 숫자가 있어서"], [/없는 증거 번호/, "찾은 적 없는 글이라서"],
  [/절대 날짜로/, "«지난주» 같은 말을 써서"], [/미디어|사진 후보|기사 사진|^media/, "사진·영상이 그 글 것이 아니라서"],
  [/^빈 칸/, "내용이 덜 채워져서"]];
// «발췌»(받침 없음) → «원문»(받침 있음) — 조사도 바꾼다. «원문는» 이 떴다(배포 뒤 확인 10-03)
function 원문말(글) {
  return 글.replace(/발췌(는|가|를|와|로)/g, (_, 조) => `원문${{ 는: "은", 가: "이", 를: "을", 와: "과", 로: "으로" }[조]}`)
    .replace(/발췌/g, "원문");
}

function 뺀까닭(글) {
  const 판정 = String(글 || "").match(/받쳐지지 않음\((모자람|어긋남): ?([\s\S]*)\)$/);
  if (판정) {
    const 첫 = 판정[1] === "어긋남" ? "원문과 반대되는 내용이라서" : "원문에 없는 내용이 들어가 있어서";
    const 까닭 = 원문말(사람말(판정[2]));
    return 까닭 ? `${첫} (${까닭})` : 첫;
  }
  const 맞은 = 뺀까닭꼴.find(([식]) => 식.test(String(글 || "")));
  return 맞은 ? 맞은[1] : 사람말(글);
}

// 지휘자 판단 줄·단계 메모를 화면용 사람 말로 — 판단 기록(모으는 동안엔 펼쳐짐)·상세 보기에 E52·read_page·«발췌로 받쳐지지»
// 가 그대로 보였다(합격 판정 10-03, 사용자 «가»). 나만 보는 전체 기록은 원본 그대로. 지휘자가 자유롭게 쓴 글이라 정해 둔 꼴만 바꾼다.
const 도구말 = { read_page: "기사 읽기", web_search: "웹 검색", x_search: "X 검색", x_account: "X 계정 보기",
  instagram_search: "인스타 검색", instagram_account: "인스타 계정 보기", threads_account: "스레드 계정 보기",
  get_evidence: "모은 자료 다시 보기", update_board: "작업판 적기", submit_result: "결과 내기", view_images: "그림 보기" };
const 도구이름식 = new RegExp(`\\b(${Object.keys(도구말).join("|")})\\b`, "g");
export function 판단말(글) {
  const s = String(글 || "")
    .replace(/요약 문장 «[^»]*» 이 발췌로 받쳐지지(?: 않음)?(?:\([^)]*\)?)?/g, "원문에 없는 내용이 들어감")
    .replace(/요약 문장 «[^»]*(?:» 이(?: 발췌로?)?)?$/, "원문에 없는 내용이 들어감")  // 단계 메모는 80자에서 잘린다
    .replace(/발췌가 (?:E\d+ )?원문에 글자 그대로 없음/g, "따온 문구가 원문과 다름")
    .replace(/\s*— 찾아보거나 빼라/g, "")
    .replace(/\(\s*https?:\/\/[^)]*\)/g, "")  // (https://… → E52)
    .replace(/E\d+(?:#\d+)?\s*~\s*E\d+(?:#\d+)?/g, "")  // E131~E135
    .replace(도구이름식, (m) => 도구말[m])
    .replace(/\b(x|instagram|threads|web|page):([\w.@-]+)/g, (_, 앞, 핵) => 곳말(`${앞}:${핵}`))
    .replace(/unfilled\.searched/g, "못 채운 칸의 찾아본 곳").replace(/\bunfilled\b/g, "못 채운 칸")
    .replace(/\bsearched\b/g, "찾아본 곳").replace(/\bsubmit\b/g, "결과 내기")
    .replace(/발췌/g, "따온 문구")  // 지휘자 글의 «발췌» 는 따온 문구 — «원문» 으로 바꾸면 «원문을 원문 그대로» 가 된다
    .replace(/관문이/g, "마지막 검사가").replace(/관문/g, "마지막 검사")
    // 받침 있는 말로 바꿨으면 조사도 — «못 채운 칸 로»
    .replace(/(못 채운 칸|찾아본 곳) ?(로|를|는|가|와)(?![가-힣])/g, (_, 말, 조) => 말 + { 로: "으로", 를: "을", 는: "은", 가: "이", 와: "과" }[조]);
  return 사람말(s)
    .replace(/\s+([,)])/g, "$1")  // 번호를 지운 자리 «X , 연합뉴스 )»
    .replace(/\(\s*[·,/]\s*/g, "(")  // «(·JTBC»
    .replace(/\(\s*[·,/]?\s*\)/g, "")  // «( )»·«(·)»
    .replace(/(?:\s*[·,/]\s*){2,}/g, " ")  // «E1/E3/E10» 을 지운 자리 «//»
    .replace(/\s·(?=\S)/g, " ")  // «youtube ·모두»
    .replace(/\(\s*\)/g, "")  // 번호 묶음을 지운 자리 «확정( )하고»
    .replace(/ {2,}/g, " ").trim();
}

// 저장된 분야(Task 14-2) — 기간 고르기. «이번 주»·«지난주» 자리에 주차 넷(계획 4 설계 A-5 — 사용자 «어», 최근 4주 안).
// 값은 «주차:앞»(0 = 이번 주). 서버가 주차를 안 주면(옛 서버) 예전 다섯 그대로.
const 주차앞말 = ["이번 주", "지난주", "2주 전", "3주 전"];
const 나머지기간 = [["최근N일", "최근 7일"], ["이번달", "이번 달"], ["지난달", "지난달"]];
export const 기본기간 = "주차:1";  // 다 끝난 지난주가 기본

export function 기간고르기들(기간들) {
  const 주차 = 기간들?.주차 || [];
  const 앞 = 주차.length
    ? 주차.map(([시작, 끝, 이름], i) => [`주차:${i}`, `${주차앞말[i] || `${i}주 전`} — ${이름} (${짧은날(시작)}~${짧은날(끝)})`])
    : [["지난주", 기간글("지난주", "지난주", 기간들)], ["이번주", 기간글("이번주", "이번 주", 기간들)]];
  return [...앞, ...나머지기간.map(([종류, 글]) => [종류, 기간글(종류, 글, 기간들)])];
}

export function 기간몸(값) {
  const m = /^주차:(\d)$/.exec(값 || "");
  if (m) return { 종류: "주차", 앞: Number(m[1]) };
  return 값 === "최근N일" ? { 종류: 값, N: 7 } : { 종류: 값 };
}

// 기간 고르기 칸 글에 서버가 센 날짜를 붙인다 — «최근 7일» 만 보고 눌렀다(판 4). 날짜를 못 받았으면 말만.
export function 기간글(종류, 글, 기간들) {
  const 날 = 기간들?.[종류];
  return 날 ? `${글} (${짧은날(날[0])}~${짧은날(날[1])})` : 글;
}

export function 분야줄들(f) {
  const 본 = f?.본 || {};
  const 목록 = (x) => (x && x.length ? x.join(", ") : "-");
  return [["주제", 본.주제], ["범위", 본.범위 || "-"], ["넣을 것", 목록(본.넣을것)], ["뺄 것", 목록(본.뺄것)],
    ["목표", `${본.목표건수}건`], ["찾는 넓이", `${본.등급} ${넓이[본.등급] || ""}`.trim()],
    ["매주 볼 곳", (f?.목록 || []).length ? f.목록.join("\n") : "없음 — 지휘자가 처음부터 찾아요"]];
}

// 매주 볼 곳(계획 4 설계 A-3) — 서버의 목록후보를 저장·바꾸기 펼침 줄로. «새로 찾은 곳» 은 꺼진 채로 시작한다
export const 목록최대 = 10;

export function 목록펼침줄들(후보) {
  return (후보 || []).map((x, 번호) => ({
    번호, 글: x.까닭 ? `${x.글} · ${x.까닭}` : x.글, 숫자: x.숫자 || "", 갈래: x.갈래 || "", 켬: x.갈래 !== "새로 찾은 곳",
  }));
}

export function 목록머리(줄들, 바꾸기 = false) {
  if (!줄들.length) return "매주 볼 곳 목록을 못 만들었어요 — 저장하면 다음 판도 지휘자가 처음부터 찾아요";
  const 켠 = 줄들.filter((x) => x.켬).length;
  if (켠 > 목록최대) return `매주 볼 곳은 ${목록최대}곳까지예요 — 지금 ${켠}곳, 줄을 더 빼 주세요`;
  return 바꾸기 ? `매주 볼 곳 ${켠}곳 — ✕ 로 빼고, «새로 찾은 곳» 은 «넣기» 로 더해요`
    : `매주 볼 곳 ${켠}곳 — 필요 없는 줄은 ✕ 로 빼세요`;
}

export function 남길번호들(줄들) {
  return 줄들.filter((x) => x.켬).map((x) => x.번호);
}

export function 줄단추글(줄) {
  if (줄.켬) return "✕";
  return 줄.갈래 === "새로 찾은 곳" ? "넣기" : "되살리기";
}

// 목록 판 결과 맨 위 한 줄 — 저장한 목록 중 몇 곳을 봤고 어디를 못 봤나
export function 목록결과줄(result) {
  const m = result?.목록;
  if (!m) return "";
  const 못 = (m.못본곳 || []).map((x) => `${x.글} (${x.까닭})`);
  return `매주 볼 곳 ${m.전체}곳 중 ${m.본곳}곳 봄` + (못.length ? ` · 못 본 곳: ${못.join(", ")}` : "");
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

// 수리공 까닭의 안쪽 말 — «재현: 고장: 실행 FAILED» 를 처음 온 사람이 못 읽었다(과제 35 화면 점검)
function 수리까닭(글) {
  return 사람말(글)
    .replace(/^(?:\s*(?:재현|고장|입력|이상함|막힘|돈)\s*:\s*)+/, "")
    .replace(/\bFAILED\b/g, "실패").replace(/\bTIMED-OUT\b/g, "시간 초과").replace(/\bABORTED\b/g, "중단");
}

// 수리공이 이 판에서 고친·못 고친 도구(계획 4 C-5) — 사람 말로 한 줄씩
export function 수리줄들(result) {
  const 수 = result?.수리;
  if (!수) return [];
  const 이름 = (x) => 도구이름[x] || x;
  return [
    ...(수.고침 || []).map((x) => `고친 도구: ${이름(x.도구)} — ${사람말(x.까닭)}` + (x.돈 ? ` (${달러(x.돈)})` : "")),
    ...(수.못고침 || []).map((x) => `못 고친 도구: ${이름(x.도구)} — ${수리까닭(x.까닭)}`
      + (x["사람이 할 일"] ? ` · 사람이 할 일: ${x["사람이 할 일"]}` : "")),
    ...(수.고치는중 || []).map((x) => `고치는 중이던 도구: ${이름(x)} — 다음 판부터 고쳐진 채로 써요`),
  ];
}
