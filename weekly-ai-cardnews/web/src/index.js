// 주간 AI 소식 카드뉴스 — 화면 워커.
// /api/* 는 지휘 서버(API_BASE)로 그대로 넘긴다. 화면과 같은 주소라 리타 안에서도 막히지 않는다.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const base = (env.API_BASE || "").replace(/\/$/, "");
      if (!base) return 제이슨(503, { error: "API_BASE 가 비어 있다 — 지휘 서버 주소를 wrangler.jsonc 에 적어라" });
      const init = { method: request.method, headers: { "content-type": "application/json" } };
      if (request.method === "POST") init.body = await request.text();
      try {
        const r = await fetch(base + url.pathname.slice(4) + url.search, init);
        return new Response(r.body, {
          status: r.status,
          headers: { "content-type": r.headers.get("content-type") || "application/json; charset=utf-8", "cache-control": "no-store" },
        });
      } catch (e) {
        return 제이슨(502, { error: `지휘 서버에 못 닿음 — ${e.message}` });
      }
    }
    return env.ASSETS.fetch(request);
  },
};

function 제이슨(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
