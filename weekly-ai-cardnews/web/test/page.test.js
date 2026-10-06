import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("탭 아이콘이 있다 — 없어서 열 때마다 favicon.ico 404 가 났다(판 3, 2026-10-03)", () => {
  const 글 = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(글, /<link rel="icon" href="data:image\/svg\+xml,/);
});

test("저장한 분야는 15~20분, 새 분야 주문서는 10~40분 — 저장한 분야는 매주 볼 곳만 본다(사용자 10-05)", () => {
  const 글 = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(글, /저장칸\.append\(표, 이름표, 고르기, 단추, 글줄\("p", "흐림", "모으기는 15~20분쯤 걸려요\."\)\)/);
  assert.match(글, /주문서칸\.append\(.*모으기는 10~40분쯤 걸려요\./);
  assert.match(글, /매주 볼 곳만 봐요/);
});
