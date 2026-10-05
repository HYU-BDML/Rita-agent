import {
  주차글, 목록줄, 단계줄, 빠진것들, 계속볼까, 총시간줄, 제목줄, 주문서줄들, 예산줄, 단계표, 칸줄, 소식머리, 소식밑줄, 대화줄,
  지갑띠글, 새분야막힘, 안전주소, 걸음돈줄, 대화돈줄, 사람말, 분야줄들, 생각중줄, 판단말, 지우기표열쇠, 카드줄, 카드다시, 기간고르기들, 기본기간, 기간몸,
  목록펼침줄들, 목록머리, 남길번호들, 줄단추글, 목록결과줄, 목록최대, 수리줄들,
} from "./draw.js";

const $ = (id) => document.getElementById(id);
const 주차칸 = $("주차"), 만들기단추 = $("만들기"), 알림 = $("알림"), 목록 = $("목록"), 오른쪽 = $("오른쪽");
const 갈래AI = $("갈래AI"), 갈래새 = $("갈래새"), AI칸 = $("AI칸"), 새칸 = $("새칸"), 지갑띠 = $("지갑띠"), 갈래들 = $("갈래들"), 저장칸 = $("저장칸");
const 대화목록 = $("대화"), 말칸 = $("말칸"), 보내기단추 = $("보내기"), 새대화단추 = $("새대화"), 주문서칸 = $("주문서");
const 물음 = new URLSearchParams(location.search);
let 지금번호 = 물음.get("job");
let 지금대화 = 물음.get("chat");
let 지금대화몸 = null, 지갑 = null, 분야들 = [], 지금분야 = null, 기간들 = null;
let 보는타이머 = null, 초타이머 = null, 대화타이머 = null, 대화초타이머 = null;
let 내려가기 = false;  // 폰에서 판을 고른 뒤 처음 그릴 때 결과 칸으로 내려간다

async function 부르기(길, 설정) {
  try {
    const r = await fetch("/api" + 길, 설정);
    const 몸 = await r.json().catch(() => ({ error: `응답을 못 읽음 (${r.status})` }));
    return { 상태: r.status, 몸 };
  } catch (e) {
    return { 상태: 0, 몸: { error: "연결이 끊겼어요 — 잠시 뒤 다시 볼게요" } };
  }
}

const 보낼몸 = (몸) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(몸) });

// 안내=true 면 파란 안내 글씨 — 성공 알림이 빨간 오류처럼 보였다(최종 검토)
function 말하기(글, 안내 = false) { 알림.textContent = 글 || ""; 알림.hidden = !글; 알림.classList.toggle("안내", Boolean(안내)); }

function 글줄(태그, 모양, 글) {
  const e = document.createElement(태그);
  if (모양) e.className = 모양;
  e.textContent = 글;
  return e;
}

function 링크(글, 주소, 모양 = "") {
  const a = 글줄("a", 모양, 글);
  if (안전주소(주소)) { a.href = 주소; a.target = "_blank"; a.rel = "noopener"; }
  return a;
}

function 주소고치기() {
  const q = new URLSearchParams();
  if (지금번호) q.set("job", 지금번호);
  if (지금대화) q.set("chat", 지금대화);
  history.replaceState(null, "", q.toString() ? "?" + q : location.pathname);
}

// ── 갈래 ────────────────────────────────────────────────────────────────
// 무엇: "AI" · "새" · 저장된 분야 번호
function 갈래고르기(무엇) {
  for (const b of 갈래들.querySelectorAll("button")) {
    const 맞음 = b.dataset.갈래 === 무엇;
    b.classList.toggle("고름", 맞음);
    b.setAttribute("aria-selected", String(맞음));
  }
  지금분야 = 분야들.find((f) => f.field === 무엇) || null;
  AI칸.hidden = 무엇 !== "AI";
  새칸.hidden = 무엇 !== "새";
  저장칸.hidden = !지금분야;
  if (무엇 === "AI") return;
  지갑보기();
  if (지금분야) 저장칸그리기();
}
갈래AI.onclick = () => 갈래고르기("AI");
갈래새.onclick = () => 갈래고르기("새");

async function 분야채우기() {
  const { 상태, 몸 } = await 부르기("/topic/fields");
  if (상태 !== 200) return;
  분야들 = 몸.fields;
  기간들 = 몸.기간들;
  for (const b of 갈래들.querySelectorAll("button.저장")) b.remove();
  for (const f of 분야들) {
    const b = 글줄("button", "저장", f.이름);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", "false");
    b.dataset.갈래 = f.field;
    b.title = f.본?.주제 || f.이름;
    b.onclick = () => 갈래고르기(f.field);
    갈래들.insertBefore(b, 갈래새);
  }
}

function 저장칸그리기() {
  const f = 지금분야;
  저장칸.innerHTML = "";
  저장칸.append(글줄("p", "설명", `«${f.이름}» 분야를 같은 주문서로 다시 모아요. 기간만 고르세요.`));
  const 표 = document.createElement("table");
  for (const [이름, 값] of 분야줄들(f)) {
    const 줄 = document.createElement("tr");
    줄.append(글줄("th", "", 이름), 글줄("td", "", 값));
    표.append(줄);
  }
  const 이름표 = 글줄("label", "이름표", "기간");
  이름표.htmlFor = "저장기간";
  const 고르기 = document.createElement("select");
  고르기.id = "저장기간";
  for (const [값, 글] of 기간고르기들(기간들)) {
    const 칸 = 글줄("option", "", 글);
    칸.value = 값;
    고르기.append(칸);
  }
  if ([...고르기.options].some((o) => o.value === 기본기간)) 고르기.value = 기본기간;
  const 단추 = 글줄("button", "", "이 기간으로 모으기");
  단추.type = "button";
  단추.disabled = 새분야막힘(지갑);
  단추.onclick = () => 분야로모으기(f.field, 고르기.value, 단추);
  저장칸.append(표, 이름표, 고르기, 단추, 글줄("p", "흐림", "모으기는 10~40분쯤 걸려요."));
  const 지우기표 = 표꺼내기(f.field);
  if (지우기표) {  // 저장한 이 브라우저에서만 — 한 번 누르면 묻고, 한 번 더 누르면 지운다(확인 창은 쓰지 않는다)
    const 지우기 = 글줄("button", "버금", "이 분야 지우기");  // 버금 단추 — 위험한 일이 «모으기» 처럼 보이지 않게(UX 점검 2-1)
    지우기.type = "button";
    let 물은때 = 0;
    지우기.onclick = async () => {
      if (!물은때) {
        물은때 = Date.now();
        지우기.textContent = "모두의 목록에서 사라져요 — 한 번 더 누르면 지워요";
        // 5초 안에 안 누르면 묻기를 푼다 — 몇 분 뒤 한 번 눌러 지워지지 않게(최종 검토)
        setTimeout(() => { if (!지우기.disabled) { 물은때 = 0; 지우기.textContent = "이 분야 지우기"; } }, 5000);
        return;
      }
      if (Date.now() - 물은때 < 800) return;  // 습관처럼 두 번 누른 것(더블클릭)은 «한 번 더» 가 아니다(UX 점검 2-1)
      지우기.disabled = true;
      const { 상태, 몸 } = await 부르기(`/topic/fields/${encodeURIComponent(f.field)}/delete`, 보낼몸({ 표: 지우기표 }));
      if (상태 !== 200) {
        지우기.disabled = false;
        지우기.textContent = 몸.error || `지우기 실패 (${상태})`;
        return;
      }
      표버리기(f.field);
      await 분야채우기();
      갈래고르기("새");
      말하기(`«${f.이름}» 분야를 지웠어요 — 그 분야로 만든 지난 결과는 그대로 있어요`, true);
    };
    저장칸.append(지우기);
  }
}

async function 분야로모으기(분야, 값, 단추) {
  단추.disabled = true;
  말하기("");
  const 기간 = 기간몸(값);
  const { 상태, 몸 } = await 부르기("/topic/make", 보낼몸({ field: 분야, 기간 }));
  if (상태 !== 202) {
    단추.disabled = false;
    return 말하기(몸.error || `모으기 실패 (${상태})`);
  }
  보기(몸.job);
  목록그리기();
}

// 카드만 다시 굽기(계획 4 D-4) — 누르면 «만드는 중» 으로 바뀌어 진행이 보인다
function 카드다시칸(job, 다시) {
  const 칸 = document.createElement("div");
  칸.className = "저장하기";
  const 단추 = 글줄("button", "버금", "카드 다시 굽기");
  단추.type = "button";
  단추.onclick = async () => {
    단추.disabled = true;
    const { 상태, 몸 } = await 부르기(`/topic/jobs/${encodeURIComponent(job.job)}/cards`, 보낼몸({}));
    if (상태 !== 202) {
      단추.disabled = false;
      단추.textContent = 몸.error || `다시 굽기 실패 (${상태})`;
      return;
    }
    보기(job.job);
    목록그리기();
  };
  칸.append(단추, 글줄("p", "흐림", 다시.글));
  return 칸;
}

function 분야저장칸(job) {
  const f = 분야들.find((x) => x.field === job.field || x.job === job.job);
  const 칸 = document.createElement("div");
  칸.className = "저장하기";
  if (f) {
    칸.append(글줄("p", "흐림", `저장된 분야 «${f.이름}» — 분야 목록(«AI 소식» 옆)에서 고르면 기간만 골라 다시 모을 수 있어요`));
    const 표 = job.field === f.field ? 표꺼내기(f.field) : null;
    if (표 && (job.result.목록후보 || []).length) {  // 저장한 이 브라우저에서만 — 이 판의 후보로 매주 볼 곳을 바꾼다(계획 4)
      const 바꾸기 = 글줄("button", "버금", "매주 볼 곳 바꾸기");
      바꾸기.type = "button";
      바꾸기.onclick = () => 바꾸기.replaceWith(목록펼침(job, true, (남길, 단추) => 목록바꾸기(f, job, 표, 남길, 단추)));
      칸.append(바꾸기);
    }
    return 칸;
  }
  const 단추 = 글줄("button", "", `«${job.order?.분야이름}» 분야로 저장`);
  단추.type = "button";
  // 누르면 그 자리에 매주 볼 곳이 펼쳐진다 — 줄을 빼고 «이대로 저장»(계획 4 설계 A-3)
  단추.onclick = () => 단추.replaceWith(목록펼침(job, false, (남길, 저장) => 분야저장(job, 남길, 저장)));
  칸.append(단추, 글줄("p", "흐림", "결과가 마음에 들면 저장해 두세요. 분야 목록(«AI 소식» 옆)에 생기고, 다음부터는 대화 없이 기간만 골라 "
    + "모을 수 있어요. 저장한 분야는 모두에게 보여요."));
  return 칸;
}

// 매주 볼 곳 펼침 — 줄마다 ✕(빼기)·되살리기·넣기, 위에 남길 곳 수, 아래에 저장(바꾸기) 단추
function 목록펼침(job, 바꾸기, 보내기) {
  const 줄들 = 목록펼침줄들(job.result.목록후보);
  const 칸 = document.createElement("div");
  칸.className = "목록펼침";
  const 머리 = 글줄("p", "설명", "");
  const 목록칸 = document.createElement("ul");
  목록칸.className = "목록줄들";
  const 보낼단추 = 글줄("button", "", 바꾸기 ? "이대로 바꾸기" : "이대로 저장");
  보낼단추.type = "button";
  const 새로 = () => {
    머리.textContent = 목록머리(줄들, 바꾸기);
    보낼단추.disabled = 남길번호들(줄들).length > 목록최대;
  };
  for (const 줄 of 줄들) {
    const li = document.createElement("li");
    li.className = "목록줄" + (줄.켬 ? "" : " 뺌");
    const 글칸 = document.createElement("div");
    글칸.className = "글";
    글칸.append(글줄("span", "", 줄.글));
    if (줄.갈래) 글칸.append(글줄("span", "딱지", 줄.갈래));
    if (줄.숫자) 글칸.append(글줄("span", "흐림 숫자", 줄.숫자));
    const 단추 = 글줄("button", "버금", 줄단추글(줄));
    단추.type = "button";
    const 이름표 = () => 단추.setAttribute("aria-label", `${줄.글} — ${줄.켬 ? "빼기" : "넣기"}`);
    이름표();
    단추.onclick = () => {
      줄.켬 = !줄.켬;
      li.classList.toggle("뺌", !줄.켬);
      단추.textContent = 줄단추글(줄);
      이름표();
      새로();
    };
    li.append(글칸, 단추);
    목록칸.append(li);
  }
  보낼단추.onclick = () => 보내기(남길번호들(줄들), 보낼단추);
  새로();
  칸.append(머리, 목록칸, 보낼단추);
  return 칸;
}

async function 분야저장(job, 남길, 단추) {
  단추.disabled = true;
  const { 상태, 몸 } = await 부르기("/topic/fields", 보낼몸({ job: job.job, 남길줄: 남길 }));
  if (상태 !== 201 && 상태 !== 200) {
    단추.disabled = false;
    단추.textContent = 몸.error || `저장 실패 (${상태})`;
    return;
  }
  if (몸.표) 표두기(몸.field, 몸.표);
  await 분야채우기();
  한번보기();
}

async function 목록바꾸기(f, job, 표, 남길, 단추) {
  단추.disabled = true;
  const { 상태, 몸 } = await 부르기(`/topic/fields/${encodeURIComponent(f.field)}/list`, 보낼몸({ 표, job: job.job, 남길줄: 남길 }));
  if (상태 !== 200) {
    단추.disabled = false;
    단추.textContent = 몸.error || `바꾸기 실패 (${상태})`;
    return;
  }
  await 분야채우기();
  말하기("매주 볼 곳을 바꿨어요 — 다음 판부터 이 목록으로 봐요", true);
  await 한번보기();
  알림.scrollIntoView({ block: "center", behavior: "smooth" });  // 아래에서 누른 사람이 위에 뜬 알림을 못 봤다(과제 35)
}

// 지우기 표 — 브라우저가 막으면(사생활 보호 창 등) 그냥 지우기 단추가 안 보일 뿐
function 표두기(field, 표) { try { localStorage.setItem(지우기표열쇠(field), 표); } catch (e) { /* 못 둠 */ } }
function 표꺼내기(field) { try { return localStorage.getItem(지우기표열쇠(field)); } catch (e) { return null; } }
function 표버리기(field) { try { localStorage.removeItem(지우기표열쇠(field)); } catch (e) { /* 못 버림 */ } }

async function 지갑보기() {
  const { 상태, 몸 } = await 부르기("/wallet");
  if (상태 !== 200) return;
  지갑 = 몸;
  const 글 = 지갑띠글(몸);
  지갑띠.textContent = 글;
  지갑띠.hidden = !글;
  대화그리기();
  if (지금분야) 저장칸그리기();
}

// ── AI 소식 (그대로) ──────────────────────────────────────────────────────
async function 주차채우기() {
  const { 상태, 몸 } = await 부르기("/weeks");
  if (상태 !== 200) return 말하기(몸.error || "주차 목록을 못 불러옴");
  주차칸.innerHTML = "";
  for (const w of 몸.weeks) {
    const 칸 = document.createElement("option");
    칸.value = JSON.stringify({ week: w.label, year: w.year });
    칸.textContent = 주차글(w);
    주차칸.append(칸);
  }
}

async function 만들기(주, 해) {
  만들기단추.disabled = true;
  말하기("");
  const { 상태, 몸 } = await 부르기("/make", 보낼몸({ week: 주, year: 해 }));
  만들기단추.disabled = false;
  if (상태 !== 202) return 말하기(몸.error || `만들기 실패 (${상태})`);
  보기(몸.job);
  목록그리기();
}

만들기단추.onclick = () => {
  const { week, year } = JSON.parse(주차칸.value);
  만들기(week, year);
};

// ── 새 분야: 대화 → 주문서 → 모으기 ─────────────────────────────────────────
async function 말보내기() {
  const 글 = 말칸.value.trim();
  if (!글) return;
  보내기단추.disabled = true;
  말하기("");
  const { 상태, 몸 } = await 부르기("/topic/chat", 보낼몸({ chat: 지금대화 || undefined, text: 글 }));
  보내기단추.disabled = false;
  if (상태 !== 202) return 말하기(몸.error || `보내기 실패 (${상태})`);
  말칸.value = "";
  지금대화 = 몸.chat;
  주소고치기();
  대화보기();
}
보내기단추.onclick = 말보내기;
말칸.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) 말보내기(); });
새대화단추.onclick = () => {
  clearTimeout(대화타이머);
  지금대화 = null;
  지금대화몸 = null;
  주소고치기();
  대화그리기();
  말칸.focus();
};

async function 대화보기() {
  clearTimeout(대화타이머);
  if (!지금대화) return 대화그리기();
  const 볼 = 지금대화;
  const { 상태, 몸 } = await 부르기("/topic/chat/" + encodeURIComponent(볼));
  if (볼 !== 지금대화) return;
  if (상태 !== 200) {  // 잠깐 끊겨도 대화가 사라진 채로 남지 않게 다시 본다(UX 점검 — 새로고침 직후 502)
    말하기(몸.error || `대화를 못 불러옴 (${상태}) — 잠시 뒤 다시 볼게요`);
    대화타이머 = setTimeout(대화보기, 3000);
    return;
  }
  if (알림.textContent.startsWith("대화를 못 불러옴")) 말하기("");  // 다시 불러왔으면 그 알림만 지운다
  지금대화몸 = 몸;
  대화그리기();
  if (몸.state === "생각 중") 대화타이머 = setTimeout(대화보기, 2000);
}

function 대화그리기() {
  const d = 지금대화몸;
  clearInterval(대화초타이머);
  대화목록.innerHTML = "";
  주문서칸.innerHTML = "";
  주문서칸.hidden = true;
  if (!d) {
    대화목록.append(글줄("li", "흐림", "어떤 소식을 모을까요? 예: «코르티스 이번 주 소식», «엔비디아 주가 지난주 소식»"));
    보내기단추.disabled = 새분야막힘(지갑);  // 지갑이 막혔으면 대화부터 막는다 — 끝까지 말하고 나서야 모으기가 막힌 걸 알지 않게(UX 점검)
    return;
  }
  for (const m of d.messages || []) 대화목록.append(글줄("li", m.who === "사람" ? "나" : "그쪽", 대화줄(m)));
  if (대화돈줄(d.cost)) 대화목록.append(글줄("li", "흐림", 대화돈줄(d.cost)));
  if (d.state === "생각 중") {  // 보낸 때(updated)부터 흐르는 초 — 1초마다 고쳐 쓴다
    const 줄 = 글줄("li", "흐림", 생각중줄(d.updated, new Date().toISOString()));
    대화목록.append(줄);
    대화초타이머 = setInterval(() => { 줄.textContent = 생각중줄(d.updated, new Date().toISOString()); }, 1000);
  }
  if (d.state === "실패") 대화목록.append(글줄("li", "알림", d.error || "실패했어요 — 다시 보내 주세요"));
  보내기단추.disabled = d.state === "생각 중" || 새분야막힘(지갑);
  if (!d.order) return;
  주문서칸.hidden = false;
  주문서칸.append(글줄("h3", "", "주문서"));
  const 표 = document.createElement("table");
  for (const [이름, 값] of 주문서줄들(d.order)) {
    const 줄 = document.createElement("tr");
    줄.append(글줄("th", "", 이름), 글줄("td", "", 값));
    표.append(줄);
  }
  // 이 주문서로 이미 만든 판이 있으면 다시 모으지 않고 그 판을 보여 준다 — 새로고침 뒤 두 번 눌러 돈이 두 번 나가던 것(UX 점검)
  const 모으기 = 글줄("button", "", d.job ? "모으는 판 보기" : "이대로 모으기");
  모으기.type = "button";
  // 생각 중엔 주문서가 곧 바뀐다 — 옛것으로 모으지 않게 잠근다(최종 검토)
  모으기.disabled = d.state === "생각 중" || (!d.job && 새분야막힘(지갑));
  모으기.onclick = () => (d.job ? 보기(d.job) : 모으기시작(지금대화, 모으기));
  주문서칸.append(표, 모으기, 글줄("p", "흐림", "고칠 점이 있으면 위 칸에 말로 적어 보내 주세요. 모으기는 10~40분쯤 걸려요."));
}

async function 모으기시작(대화번호, 단추) {
  if (단추) 단추.disabled = true;
  말하기("");
  const { 상태, 몸 } = await 부르기("/topic/make", 보낼몸({ chat: 대화번호 }));
  if (상태 !== 202 && 상태 !== 200) {  // 200 = 이미 만든 판
    if (단추) 단추.disabled = false;
    return 말하기(몸.error || `모으기 실패 (${상태})`);
  }
  보기(몸.job);
  목록그리기();
}

// ── 지난 결과 · 한 판 보기 ─────────────────────────────────────────────────
async function 목록그리기() {
  const { 상태, 몸 } = await 부르기("/jobs");
  if (상태 !== 200) return;
  목록.innerHTML = "";
  if (!몸.jobs.length) { 목록.append(글줄("li", "흐림", "아직 만든 결과가 없어요")); return; }
  for (const job of 몸.jobs) {
    const 줄 = 글줄("li", job.job === 지금번호 ? "고름" : "", 목록줄(job));
    줄.dataset.job = job.job;
    줄.onclick = () => 보기(job.job);
    목록.append(줄);
  }
}

async function 이어서다시(번호, 단추) {
  단추.disabled = true;
  const { 상태, 몸 } = await 부르기("/jobs/" + encodeURIComponent(번호) + "/retry", { method: "POST" });
  if (상태 !== 202) {
    단추.disabled = false;
    단추.textContent = 몸.error || `이어서 다시 실패 (${상태})`;
    return;
  }
  보기(번호);
  목록그리기();
}

function 보기(번호) {
  지금번호 = 번호;
  주소고치기();
  for (const 줄 of 목록.children) 줄.classList.toggle("고름", 줄.dataset.job === 번호);
  clearTimeout(보는타이머);
  clearInterval(초타이머);
  한번보기();
  // 폰에선 오른쪽 칸이 왼쪽 칸 아래에 쌓여 — 누르고도 화면이 안 바뀌어 보이지 않게, 다 그린 뒤 그 칸으로 내려간다(UX 점검)
  내려가기 = matchMedia("(max-width: 760px)").matches;
}

async function 한번보기() {
  if (!지금번호) return;
  const 볼번호 = 지금번호;
  const { 상태, 몸 } = await 부르기("/jobs/" + encodeURIComponent(볼번호));
  if (볼번호 !== 지금번호) return;
  if (상태 === 404) {
    오른쪽.innerHTML = "";
    오른쪽.append(글줄("p", "흐림", "없는 결과입니다. «지난 결과» 목록에서 골라 주세요."));
    return;
  }
  if (상태 !== 200) {
    오른쪽.innerHTML = "";
    오른쪽.append(글줄("p", "알림", 몸.error || `불러오기 실패 (${상태})`));
    보는타이머 = setTimeout(한번보기, 5000);
    return;
  }
  그리기(몸);
  if (내려가기) {
    내려가기 = false;
    오른쪽.scrollIntoView({ block: "start" });
  }
  if (계속볼까(몸)) 보는타이머 = setTimeout(한번보기, 3000);
}

function 소식카드(d) {
  const 카드 = document.createElement("article");
  카드.className = "소식";
  카드.append(글줄("h3", "", 소식머리(d)));
  const m = d.미디어;
  if (m && 안전주소(m.주소)) {
    const 판 = document.createElement(m.갈래 === "영상" ? "video" : "img");
    if (m.갈래 === "영상") {
      판.controls = true;
      판.preload = "metadata";
      if (안전주소(m.대표주소)) 판.poster = m.대표주소;
    } else {
      판.alt = d.사건;
    }
    판.src = m.주소;
    판.className = "소식그림";
    카드.append(판);
  } else if (m && 안전주소(m.원주소)) {
    카드.append(링크(`${m.갈래} 원본 보기 (옮기지 못함 — 주소가 곧 만료될 수 있어요)`, m.원주소, "흐림"));
  }
  카드.append(글줄("p", "", 사람말(d.요약)));
  const 밑 = 글줄("p", "흐림", 소식밑줄(d) + " · ");
  밑.append(링크("원문", d.출처.주소));
  카드.append(밑, 글줄("blockquote", "", d.발췌));
  for (const t of d.딱지 || []) 카드.append(글줄("span", "딱지", t === "2차" ? "2차 출처" : t));
  return 카드;
}

function 주제그리기(job) {
  if (job.state === "만드는 중") {
    const 표 = document.createElement("ol");
    표.className = "단계표";
    for (const s of 단계표(job.board?.단계)) 표.append(글줄("li", s.상태, `${s.표} ${s.이름}`));
    오른쪽.append(표);
    if (예산줄(job.board)) 오른쪽.append(글줄("p", "흐림", "남은 예산: " + 예산줄(job.board)));
    const 칸들 = document.createElement("ul");
    칸들.className = "칸들";
    for (const 칸 of job.board?.칸 || []) 칸들.append(글줄("li", "", 칸줄(칸)));
    오른쪽.append(칸들);
  }
  if (job.state === "됨" && job.result) {
    const 목록글 = 목록결과줄(job.result);  // 매주 볼 곳으로 돈 판 — 맨 위에 몇 곳을 봤나(계획 4)
    if (목록글) 오른쪽.append(글줄("p", (job.result.목록.못본곳 || []).length ? "빠진것" : "흐림", 목록글));
    const 카 = 카드줄(job.result);  // 새 분야도 카드뉴스까지(계획 3) — 맨 위에 보기, 못 만들었으면 까닭 한 줄
    if (카?.보기) 보기붙이기(카.보기, `${job.order?.분야이름 || "새 분야"} 카드뉴스`);
    if (카) 오른쪽.append(글줄("p", 카.보기 ? "흐림" : "빠진것", 카.글));
    const 다시 = 카드다시(job);  // 카드가 실패했거나 빠진 장이 있으면 카드만 다시(계획 4 D-4)
    if (다시) 오른쪽.append(카드다시칸(job, 다시));
    if (!job.result.bundle.length) {
      오른쪽.append(글줄("p", "흐림", "이 기간에 조건에 맞는 소식을 찾지 못했어요. 아래에 어디까지 찾아봤는지 적었어요."));
    }
    for (const d of job.result.bundle) 오른쪽.append(소식카드(d));
    for (const 글 of 빠진것들(job.result)) 오른쪽.append(글줄("p", "빠진것", 글));
    for (const 글 of 수리줄들(job.result)) 오른쪽.append(글줄("p", "흐림", 글));  // 고친·못 고친 도구(계획 4)
    if (job.result.bundle.length) 오른쪽.append(분야저장칸(job));
  }
  if (job.lines?.length) {
    const 판단 = document.createElement("details");
    판단.className = "자세히";
    판단.open = job.state === "만드는 중";
    판단.append(글줄("summary", "", `지휘자 판단 기록 (${job.lines.length}줄, 최근 것부터)`));
    const 줄들 = document.createElement("ol");
    줄들.className = "판단줄";
    줄들.reversed = true;  // 최근 것이 위 — 번호도 큰 것부터
    줄들.start = job.lines.length;
    for (const 줄 of [...job.lines].reverse().slice(0, 60)) 줄들.append(글줄("li", "", 판단말(줄)));
    판단.append(줄들);
    오른쪽.append(판단);
  }
  if (job.spend?.length) {
    const 돈 = document.createElement("details");
    돈.className = "자세히";
    돈.open = job.state === "만드는 중";
    돈.append(글줄("summary", "", `걸음마다 쓴 돈 (${job.spend.length}줄, 최근 것부터)`));
    const 줄들 = document.createElement("ol");
    줄들.className = "판단줄";
    줄들.reversed = true;
    줄들.start = job.spend.length;
    for (const x of [...job.spend].reverse()) 줄들.append(글줄("li", "", 걸음돈줄(x)));
    돈.append(줄들);
    오른쪽.append(돈);
  }
}

function 주간결과그리기(job) {
  보기붙이기(job.result.viewer, `${job.week} 카드뉴스`);
  for (const 글 of 빠진것들(job.result)) 오른쪽.append(글줄("p", "빠진것", 글));
}

// 카드뉴스 넘겨보기 틀 + «주소 복사»·«새 창으로» — AI 소식과 새 분야가 같이 쓴다
function 보기붙이기(주소, 제목) {
  const 틀 = document.createElement("iframe");
  틀.className = "보기틀";
  틀.src = 주소;
  틀.title = 제목;
  const 줄 = document.createElement("div");
  줄.className = "줄단추";
  const 복사 = 글줄("button", "", "주소 복사");
  복사.type = "button";
  복사.onclick = async () => {
    try { await navigator.clipboard.writeText(주소); 복사.textContent = "복사했어요"; }
    catch { 복사.textContent = "복사가 막혔어요 — 새 창으로 열어 주세요"; }
  };
  const 열기 = 글줄("button", "", "새 창으로");
  열기.type = "button";
  열기.onclick = () => window.open(주소, "_blank", "noopener");
  줄.append(복사, 열기);
  오른쪽.append(틀, 줄);
}

function 그리기(job) {
  오른쪽.innerHTML = "";
  clearInterval(초타이머);
  const 주제 = job.kind === "주제";
  const 제목 = 글줄("h2", "", 제목줄(job, new Date().toISOString()));
  오른쪽.append(제목);
  if (job.state === "만드는 중") {
    초타이머 = setInterval(() => { 제목.textContent = 제목줄(job, new Date().toISOString()); }, 1000);
    const 막대 = document.createElement("div");
    막대.className = "막대";
    const 속 = document.createElement("div");
    속.style.width = `${job.pct || 0}%`;
    막대.append(속);
    오른쪽.append(막대, 글줄("p", "흐림", "창을 닫아도 계속 만들어집니다. «지난 결과» 목록에서 다시 볼 수 있어요."));
  }
  if (job.state === "실패" || job.state === "멈춤") {
    오른쪽.append(글줄("p", "알림", job.error || job.state));
    const 줄 = document.createElement("div");
    줄.className = "줄단추";
    const 이어 = 글줄("button", "", "이어서 다시");
    이어.type = "button";
    이어.onclick = () => 이어서다시(job.job, 이어);
    줄.append(이어);
    if (!주제 || job.chat) {
      const 처음 = 글줄("button", "버금", "처음부터 다시");
      처음.type = "button";
      처음.onclick = () => (주제 ? 모으기시작(job.chat, 처음) : 만들기(job.week, job.year));
      줄.append(처음);
    }
    오른쪽.append(줄, 글줄("p", "흐림", 주제 ? "«이어서 다시» 는 멈춘 단계부터 합니다 — 모은 증거와 작업판은 그대로예요."
      : "«이어서 다시» 는 멈춘 단계부터 합니다 — 긁은 소식과 써 둔 대본은 다시 안 만들어요."));
  }
  if (주제) 주제그리기(job);
  else if (job.state === "됨" && job.result) 주간결과그리기(job);
  const 자세히 = document.createElement("details");
  자세히.className = "자세히";
  자세히.open = job.state !== "됨";
  자세히.append(글줄("summary", "", "상세 보기"));
  if (총시간줄(job)) 자세히.append(글줄("p", "", 총시간줄(job)));
  const 단계들 = document.createElement("ul");
  단계들.className = "단계들";
  for (const 단계 of job.steps || []) 단계들.append(글줄("li", "", 단계줄({ ...단계, note: 판단말(단계.note) }) + (단계.sec ? ` (${단계.sec}초)` : "")));
  자세히.append(단계들);
  오른쪽.append(자세히);
}

// 폰 화면을 껐다 켜거나 다른 앱에 다녀오면 바로 다시 본다
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  목록그리기();
  if (지금번호) { clearTimeout(보는타이머); 한번보기(); }
  if (지금대화) 대화보기();
});

주차채우기();
목록그리기();
setInterval(목록그리기, 15000);
분야채우기().then(() => { if (지금번호) 한번보기(); });  // 저장 단추·«저장된 분야» 줄이 처음부터 맞게
if (지금대화) { 갈래고르기("새"); 대화보기(); } else 대화그리기();
