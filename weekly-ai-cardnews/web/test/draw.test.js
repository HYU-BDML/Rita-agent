import { test } from "node:test";
import assert from "node:assert/strict";
import { 주차글, 시각, 걸린시간, 목록줄, 단계줄, 빠진것들, 계속볼까, 총시간줄, 제목줄 } from "../public/draw.js";

test("주차에 날짜를 붙인다", () => {
  assert.equal(주차글({ label: "9월 3주차", start: "2026-09-21", end: "2026-09-27" }), "9월 3주차 (9/21~9/27)");
  assert.equal(주차글({ label: "8월 5주차", start: "2026-08-31", end: "2026-09-06" }), "8월 5주차 (8/31~9/6)");
});

test("시각은 한국 시간", () => {
  assert.equal(시각("2026-09-30T02:39:36Z"), "9/30 11:39");
  assert.equal(시각(""), "");
});

test("걸린 시간", () => {
  assert.equal(걸린시간("2026-09-30T02:00:00Z", "2026-09-30T02:06:12Z"), "6분 12초");
});

test("목록 한 줄은 상태마다 다르다", () => {
  const 바탕 = { week: "9월 3주차", started: "2026-09-30T02:39:36Z" };
  assert.equal(목록줄({ ...바탕, state: "됨", result: { slides: 9 } }), "✅ 9월 3주차 · 9/30 11:39 · 9장");
  assert.equal(목록줄({ ...바탕, state: "만드는 중", pct: 62 }), "⏳ 9월 3주차 · 9/30 11:39 · 만드는 중 62%");
  assert.equal(목록줄({ ...바탕, state: "실패", error: "소식 0건" }), "❌ 9월 3주차 · 9/30 11:39 · 소식 0건");
  assert.equal(목록줄({ ...바탕, state: "멈춤", error: "30분 넘게 진행이 없음" }), "⏸ 9월 3주차 · 9/30 11:39 · 30분 넘게 진행이 없음");
});

test("단계 줄", () => {
  assert.equal(단계줄({ name: "소식 긁기", state: "됨", note: "X 185건 · 블로그 28건" }), "✅ 소식 긁기 — X 185건 · 블로그 28건");
  assert.equal(단계줄({ name: "카드 굽기", state: "하는 중", note: "" }), "⏳ 카드 굽기");
  assert.equal(단계줄({ name: "본문 대본", state: "실패", note: "" }), "❌ 본문 대본");
});

test("빠진 것들", () => {
  assert.deepEqual(빠진것들({ missing_slides: [{ no: 5, why: "영상, 시간 초과(6분)" }],
                             missing_brands: [{ brand: "Grok", why: "X 계정을 못 읽음" }] }),
    ["빠진 장: 5번 (영상, 시간 초과(6분))", "빠진 브랜드: Grok — X 계정을 못 읽음"]);
  assert.deepEqual(빠진것들(null), []);
});

test("만드는 중일 때만 계속 본다", () => {
  assert.equal(계속볼까({ state: "만드는 중" }), true);
  assert.equal(계속볼까({ state: "됨" }), false);
  assert.equal(계속볼까({ state: "멈춤" }), false);
});

test("상세 보기 맨 위에 총 걸린 시간", () => {
  const 판 = { started: "2026-09-30T15:28:12Z", updated: "2026-09-30T15:38:37Z" };
  assert.equal(총시간줄({ ...판, state: "됨" }), "총 걸린 시간: 10분 25초");
  assert.equal(총시간줄({ ...판, state: "만드는 중" }), "");  // 만드는 중엔 제목에서 1초마다 흐른다
  assert.equal(총시간줄({ state: "됨" }), "");
});

test("총 걸린 시간 옆에 쓴 돈 — 딥시크와 그림만, Apify 뺌", () => {
  const 판 = { started: "2026-09-30T15:28:12Z", updated: "2026-09-30T15:38:37Z", state: "됨",
    cost: { 딥시크: 0.0972, 그림: 0.0561, 그림장수: 1, 합계: 0.1533, 표지값모름: false } };
  assert.equal(총시간줄(판), "총 걸린 시간: 10분 25초 · 쓴 돈 약 $0.15 (딥시크 $0.097 · 그림 1장 $0.056, Apify 뺌)");
  const 모름 = { ...판, cost: { ...판.cost, 그림: 0, 합계: 0.0972, 표지값모름: true } };
  assert.equal(총시간줄(모름), "총 걸린 시간: 10분 25초 · 쓴 돈 약 $0.097 (딥시크 $0.097 · 그림 1장 $0.000, 표지 값 모름, Apify 뺌)");
});

test("만드는 중 제목의 시간은 기록이 아니라 지금 시각으로 센다", () => {
  const 판 = { week: "9월 3주차", started: "2026-09-30T15:28:12Z", updated: "2026-09-30T15:30:00Z" };
  assert.equal(제목줄({ ...판, state: "만드는 중" }, "2026-09-30T15:33:20Z"), "9월 3주차 · 만드는 중 · 5분 8초");
  assert.equal(제목줄({ ...판, state: "됨" }, "2026-09-30T15:33:20Z"), "9월 3주차 · 됨");
});
