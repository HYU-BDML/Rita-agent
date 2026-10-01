import { 주차글, 목록줄, 단계줄, 빠진것들, 계속볼까, 총시간줄, 제목줄 } from "./draw.js";

const 주차칸 = document.getElementById("주차");
const 만들기단추 = document.getElementById("만들기");
const 알림 = document.getElementById("알림");
const 목록 = document.getElementById("목록");
const 오른쪽 = document.getElementById("오른쪽");
let 지금번호 = new URLSearchParams(location.search).get("job");
let 보는타이머 = null;
let 초타이머 = null;

async function 부르기(길, 설정) {
  try {
    const r = await fetch("/api" + 길, 설정);
    const 몸 = await r.json().catch(() => ({ error: `응답을 못 읽음 (${r.status})` }));
    return { 상태: r.status, 몸 };
  } catch (e) {
    return { 상태: 0, 몸: { error: "연결이 끊겼어요 — 잠시 뒤 다시 볼게요" } };
  }
}

function 말하기(글) { 알림.textContent = 글 || ""; 알림.hidden = !글; }

function 글줄(태그, 모양, 글) {
  const e = document.createElement(태그);
  if (모양) e.className = 모양;
  e.textContent = 글;
  return e;
}

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

async function 만들기(주, 해) {
  만들기단추.disabled = true;
  말하기("");
  const { 상태, 몸 } = await 부르기("/make", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ week: 주, year: 해 }),
  });
  만들기단추.disabled = false;
  if (상태 !== 202) return 말하기(몸.error || `만들기 실패 (${상태})`);
  보기(몸.job);
  목록그리기();
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

만들기단추.onclick = () => {
  const { week, year } = JSON.parse(주차칸.value);
  만들기(week, year);
};

function 보기(번호) {
  지금번호 = 번호;
  history.replaceState(null, "", "?job=" + encodeURIComponent(번호));
  for (const 줄 of 목록.children) 줄.classList.toggle("고름", 줄.dataset.job === 번호);
  clearTimeout(보는타이머);
  clearInterval(초타이머);
  한번보기();
}

async function 한번보기() {
  if (!지금번호) return;
  const 볼번호 = 지금번호;
  const { 상태, 몸 } = await 부르기("/jobs/" + encodeURIComponent(볼번호));
  if (볼번호 !== 지금번호) return; // 그사이 다른 판을 골랐다
  if (상태 === 404) {
    오른쪽.innerHTML = "";
    오른쪽.append(글줄("p", "흐림", "없는 결과입니다. 왼쪽 목록에서 골라 주세요."));
    return;
  }
  if (상태 !== 200) {
    오른쪽.innerHTML = "";
    오른쪽.append(글줄("p", "알림", 몸.error || `불러오기 실패 (${상태})`));
    보는타이머 = setTimeout(한번보기, 5000);
    return;
  }
  그리기(몸);
  if (계속볼까(몸)) 보는타이머 = setTimeout(한번보기, 3000);
}

function 그리기(job) {
  오른쪽.innerHTML = "";
  clearInterval(초타이머);
  const 제목 = 글줄("h2", "", 제목줄(job, new Date().toISOString()));
  오른쪽.append(제목);
  if (job.state === "만드는 중") 초타이머 = setInterval(() => { 제목.textContent = 제목줄(job, new Date().toISOString()); }, 1000);
  if (job.state === "만드는 중") {
    const 막대 = document.createElement("div");
    막대.className = "막대";
    const 속 = document.createElement("div");
    속.style.width = `${job.pct || 0}%`;
    막대.append(속);
    오른쪽.append(막대, 글줄("p", "흐림", "창을 닫아도 계속 만들어집니다. 왼쪽 «지난 결과» 에서 다시 볼 수 있어요."));
  }
  if (job.state === "실패" || job.state === "멈춤") {
    오른쪽.append(글줄("p", "알림", job.error || job.state));
    const 줄 = document.createElement("div");
    줄.className = "줄단추";
    const 이어 = 글줄("button", "", "이어서 다시");
    이어.type = "button";
    이어.onclick = () => 이어서다시(job.job, 이어);
    const 처음 = 글줄("button", "버금", "처음부터 다시");
    처음.type = "button";
    처음.onclick = () => 만들기(job.week, job.year);
    줄.append(이어, 처음);
    오른쪽.append(줄, 글줄("p", "흐림", "«이어서 다시» 는 멈춘 단계부터 합니다 — 긁은 소식과 써 둔 대본은 다시 안 만들어요."));
  }
  if (job.state === "됨" && job.result) {
    const 틀 = document.createElement("iframe");
    틀.className = "보기틀";
    틀.src = job.result.viewer;
    틀.title = `${job.week} 카드뉴스`;
    const 줄 = document.createElement("div");
    줄.className = "줄단추";
    const 복사 = 글줄("button", "", "주소 복사");
    복사.type = "button";
    복사.onclick = async () => {
      try { await navigator.clipboard.writeText(job.result.viewer); 복사.textContent = "복사했어요"; }
      catch { 복사.textContent = "복사가 막혔어요 — 새 창으로 열어 주세요"; }
    };
    const 열기 = 글줄("button", "", "새 창으로");
    열기.type = "button";
    열기.onclick = () => window.open(job.result.viewer, "_blank", "noopener");
    줄.append(복사, 열기);
    오른쪽.append(틀, 줄);
    for (const 글 of 빠진것들(job.result)) 오른쪽.append(글줄("p", "빠진것", 글));
  }
  const 자세히 = document.createElement("details");
  자세히.className = "자세히";
  자세히.open = job.state !== "됨";
  자세히.append(글줄("summary", "", "상세 보기"));
  if (총시간줄(job)) 자세히.append(글줄("p", "", 총시간줄(job)));
  const 단계들 = document.createElement("ul");
  단계들.className = "단계들";
  for (const 단계 of job.steps || []) 단계들.append(글줄("li", "", 단계줄(단계) + (단계.sec ? ` (${단계.sec}초)` : "")));
  자세히.append(단계들);
  오른쪽.append(자세히);
}

// 폰 화면을 껐다 켜거나 다른 앱에 다녀오면 바로 다시 본다
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  목록그리기();
  if (지금번호) { clearTimeout(보는타이머); 한번보기(); }
});

주차채우기();
목록그리기();
setInterval(목록그리기, 15000);
if (지금번호) 한번보기();
