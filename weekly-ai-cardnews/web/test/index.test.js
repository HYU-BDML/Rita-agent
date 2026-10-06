import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

test("/api/* 는 지휘 서버로 길과 물음표 뒤를 그대로 넘긴다", async () => {
  const 받은 = [];
  globalThis.fetch = async (주소, init) => {
    받은.push([주소, init.method, init.body]);
    return new Response('{"job":"x"}', { status: 202, headers: { "content-type": "application/json" } });
  };
  const env = { API_BASE: "https://api.example/", ASSETS: { fetch: () => new Response("화면") } };
  const r = await worker.fetch(new Request("https://weekly-ai.test/api/make", { method: "POST", body: '{"week":"9월 3주차"}' }), env);
  assert.equal(r.status, 202);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(받은[0], ["https://api.example/make", "POST", '{"week":"9월 3주차"}']);
  await worker.fetch(new Request("https://weekly-ai.test/api/jobs/20260930-000000-deadbeef?x=1"), env);
  assert.equal(받은[1][0], "https://api.example/jobs/20260930-000000-deadbeef?x=1");
});

test("나머지는 화면 파일", async () => {
  const env = { API_BASE: "https://api.example", ASSETS: { fetch: () => new Response("화면") } };
  const r = await worker.fetch(new Request("https://weekly-ai.test/"), env);
  assert.equal(await r.text(), "화면");
});

test("API_BASE 가 비면 503 으로 말한다", async () => {
  const r = await worker.fetch(new Request("https://weekly-ai.test/api/jobs"), { API_BASE: "", ASSETS: {} });
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /API_BASE/);
});

test("지휘 서버에 못 닿으면 502", async () => {
  globalThis.fetch = async () => { throw new Error("down"); };
  const r = await worker.fetch(new Request("https://weekly-ai.test/api/jobs"), { API_BASE: "https://api.example", ASSETS: {} });
  assert.equal(r.status, 502);
});
