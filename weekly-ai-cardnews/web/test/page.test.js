import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("탭 아이콘이 있다 — 없어서 열 때마다 favicon.ico 404 가 났다(판 3, 2026-10-03)", () => {
  const 글 = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(글, /<link rel="icon" href="data:image\/svg\+xml,/);
});
