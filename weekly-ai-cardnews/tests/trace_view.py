# -*- coding: utf-8 -*-
"""나만 보는 전체 기록 보기 — 이 컴퓨터(AWS 로그인)에서만. 창고 것은 지우지 않는다(사용자 2026-10-01 «가»).

    python weekly/tests/trace_view.py            최근 판·대화 20개
    python weekly/tests/trace_view.py <번호>     그 판(이나 대화)을 한 장으로 만들어 브라우저에 띄운다

판 번호를 주면 그 판을 만든 대화 기록도 앞에 붙인다. 원본은 `_확인/기록/<번호>/원본/` 에 같이 내려받는다."""
import html
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

뿌리 = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(뿌리 / "weekly"))
from deploy import BUCKET, REGION  # noqa: E402

앞 = "weekly/"
겉 = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>전체 기록</title><style>
:root { --글: #1d1d1f; --바탕: #ffffff; --줄: #d0d0d5; --약: #f4f4f7; --생각: #fff8e6; --흐림: #6b6b75; }
@media (prefers-color-scheme: dark) { :root { --글: #e8e8ea; --바탕: #17171a; --줄: #3a3a40; --약: #222228;
  --생각: #2b2618; --흐림: #a0a0aa; } }
body { background: var(--바탕); color: var(--글); margin: 0; padding: 20px 16px 80px;
  font-family: "Pretendard", "Malgun Gothic", system-ui, sans-serif; line-height: 1.6; }
main { max-width: 1000px; margin: 0 auto; }
details { border: 1px solid var(--줄); border-radius: 6px; padding: 6px 10px; margin: 6px 0; }
summary { cursor: pointer; font-weight: 600; }
pre { background: var(--약); padding: 8px 10px; white-space: pre-wrap; word-break: break-word; font-size: 12.5px; }
pre.생각 { background: var(--생각); }
h4 { margin: 10px 0 4px; font-size: 13px; color: var(--흐림); }
.사람 { font-weight: 600; }
</style></head><body><main>본문자리</main></body></html>"""


def _s3():
    import boto3
    return boto3.client("s3", region_name=REGION)


def _읽기(s3, 키: str):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=키)["Body"].read())
    except Exception:
        return None


def 사건들(s3, 번호: str) -> list[dict]:
    키들, 이어 = [], None
    while True:
        kw = {"Bucket": BUCKET, "Prefix": f"{앞}trace/{번호}/"}
        if 이어:
            kw["ContinuationToken"] = 이어
        답 = s3.list_objects_v2(**kw)
        키들 += [x["Key"] for x in 답.get("Contents", [])]
        if not 답.get("IsTruncated"):
            break
        이어 = 답["NextContinuationToken"]
    난것 = []
    for 키 in sorted(키들):  # 파일 이름 앞머리가 나노초·차례 — 쓴 차례
        x = _읽기(s3, 키)
        if x is not None:
            난것.append({**x, "_키": 키.rsplit("/", 1)[-1]})
    return 난것


def 목록(s3, 몇개: int = 20) -> list[tuple]:
    번호들, 이어 = [], None
    while True:
        kw = {"Bucket": BUCKET, "Prefix": f"{앞}trace/", "Delimiter": "/"}
        if 이어:
            kw["ContinuationToken"] = 이어
        답 = s3.list_objects_v2(**kw)
        번호들 += [p["Prefix"].split("/")[-2] for p in 답.get("CommonPrefixes", [])]
        if not 답.get("IsTruncated"):
            break
        이어 = 답["NextContinuationToken"]
    난것 = []
    for 번호 in sorted(번호들, reverse=True)[:몇개]:
        판 = _읽기(s3, f"{앞}jobs/{번호}.json")
        if 판:
            o = 판.get("order") or {}
            난것.append((번호, "판", f"{o.get('분야이름', '')} {o.get('시작', '')}~{o.get('끝', '')} · {판.get('state')}"))
        else:
            d = _읽기(s3, f"{앞}chats/{번호}.json") or {}
            첫말 = next((m["text"] for m in d.get("messages") or [] if m.get("who") == "사람"), "")
            난것.append((번호, "대화", 첫말[:40]))
    return 난것


def _글(x) -> str:
    return html.escape(x if isinstance(x, str) else json.dumps(x, ensure_ascii=False, indent=1))


def _메시지(m: dict) -> str:
    이름 = {"system": "지시문", "user": "보낸 글", "assistant": "답", "tool": f"도구 결과 {m.get('tool_call_id', '')}"}.get(
        m.get("role"), str(m.get("role")))
    내용 = m.get("content") or ""
    if isinstance(내용, list):  # 판정관 — 글 조각과 그림 자리
        내용 = "\n".join(p.get("text", "") if p.get("type") == "text" else f"[그림] {(p.get('image_url') or {}).get('url', '')}"
                       for p in 내용)
    return f"<details><summary>{html.escape(이름)} ({len(str(내용)):,}자)</summary><pre>{_글(내용)}</pre></details>"


단계이름 = {"①": "이해하기", "②": "지도 그리기", "③": "넓게 훑기", "④": "들어가 보기", "⑤": "단서 따라 깊게",
          "⑥": "빈칸 점검", "⑦": "증거 다지기·정리"}


def _때(x: dict) -> str:
    """사건 시각을 한국 시간 «12:00:10» 으로 — 없으면 빈 글."""
    try:
        t = datetime.strptime(str(x.get("시각")), "%Y-%m-%dT%H:%M:%SZ") + timedelta(hours=9)
    except ValueError:
        return ""
    return t.strftime("%H:%M:%S")


def _딥시크(x: dict, 머리: str, 펼침: bool) -> str:
    토 = x.get("토큰") or {}
    요약 = (f"{머리} · 생각 {토.get('생각토큰', 0):,}토큰 · 출력 {토.get('출력토큰', 0):,} · {x.get('초', 0)}초"
          + (" · ⚠ 한도 넘침" if x.get("넘침") else "") + (f" · {_때(x)}" if _때(x) else ""))
    속 = [f"<h4>보낸 것 ({len(x.get('보낸것') or [])}개)</h4>"] + [_메시지(m) for m in x.get("보낸것") or []]
    if x.get("생각"):
        속.append(f"<h4>생각</h4><pre class='생각'>{_글(x['생각'])}</pre>")
    if x.get("답글"):
        속.append(f"<h4>답</h4><pre>{_글(x['답글'])}</pre>")
    if x.get("도구호출"):
        속.append("<h4>부른 도구</h4><ul>" + "".join(
            f"<li><strong>{html.escape(h['이름'])}</strong> <code>{_글(h.get('인자'))}</code></li>" for h in x["도구호출"])
                  + "</ul>")
    return f"<details{' open' if 펼침 else ''}><summary>{html.escape(요약)}</summary>{''.join(속)}</details>"


def _사건(x: dict) -> str:
    종 = x.get("종류")
    if 종 == "지휘":
        단 = f"{x.get('단계') or ''} {단계이름.get(x.get('단계'), '')}".strip()
        머리 = f"{x.get('걸음')}걸음 · {단} · 한도 {x.get('한도') or 0:,}" + ("" if x.get("이어짐") else " · 새 구간")
        return _딥시크(x, 머리, True)
    if 종 == "판정관":
        return _딥시크(x, "판정관" + (f" ({x['걸음']}걸음)" if x.get("걸음") else " (검증·정리)"), False)
    if 종 == "다듬기":
        return _딥시크(x, "주제 다듬기", True)
    if 종 == "구간끝":
        return (f"<details><summary>구간 끝 — {html.escape(str(x.get('끝')))} · 지휘자가 못 본 것 "
                f"{len(x.get('못본것') or [])}개</summary>" + "".join(_메시지(m) for m in x.get("못본것") or []) + "</details>")
    몸 = {k: v for k, v in x.items() if not k.startswith("_") and k not in ("종류", "시각")}
    머리 = str(종) + (f" · {_때(x)}" if _때(x) else "")
    return f"<details open><summary>{html.escape(머리)}</summary><pre>{_글(몸)}</pre></details>"


def 화면(번호: str, 판: dict | None, 대화: dict | None, 대화사건: list, 판사건: list) -> str:
    줄 = [f"<h1>전체 기록 — {html.escape(번호)}</h1>"]
    if 판:
        o, c = 판.get("order") or {}, 판.get("cost") or {}
        줄.append(f"<p>{html.escape(str(o.get('분야이름', '')))} · {html.escape(str(o.get('시작', '')))} ~ "
                 f"{html.escape(str(o.get('끝', '')))} · {html.escape(str(판.get('state')))} · 쓴 돈 약 ${c.get('합계', 0)}</p>")
    if 대화 or 대화사건:
        줄.append("<h2>주제 다듬기 — 사람과 나눈 말</h2>")
        if 대화:
            줄.append("<ol>" + "".join(f"<li><span class='사람'>{html.escape(m.get('who', ''))}</span> "
                                       f"{html.escape(m.get('text', ''))}</li>" for m in 대화.get("messages") or []) + "</ol>")
        줄 += [_사건(x) for x in 대화사건]
    if 판사건:
        줄.append("<h2>모으기 · 검증 · 정리</h2>")
        줄 += [_사건(x) for x in 판사건]
    if 판 and 판.get("result"):
        줄.append(f"<h2>결과</h2><pre>{_글(판['result'])}</pre>")
    return 겉.replace("본문자리", "\n".join(줄))


def main(인자: list) -> None:
    s3 = _s3()
    if not 인자:
        for 번호, 종류, 글 in 목록(s3):
            print(f"{번호}  {종류}  {글}")
        print("\n한 판을 보려면: python weekly/tests/trace_view.py <번호>")
        return
    번호 = 인자[0]
    판 = _읽기(s3, f"{앞}jobs/{번호}.json")
    대화번호 = (판 or {}).get("chat") if 판 else 번호
    대화 = _읽기(s3, f"{앞}chats/{대화번호}.json") if 대화번호 else None
    대화사건 = 사건들(s3, 대화번호) if 대화번호 else []
    판사건 = 사건들(s3, 번호) if 판 else []
    if not (판 or 대화 or 대화사건 or 판사건):
        raise SystemExit(f"{번호} — 그런 판·대화 기록이 없다")
    곳 = 뿌리 / "_확인" / "기록" / 번호
    원본 = 곳 / "원본"
    원본.mkdir(parents=True, exist_ok=True)
    for x in 대화사건 + 판사건:
        (원본 / x["_키"]).write_text(json.dumps(x, ensure_ascii=False, indent=1), encoding="utf-8")
    for 이름, x in (("판.json", 판), ("대화.json", 대화)):
        if x:
            (원본 / 이름).write_text(json.dumps(x, ensure_ascii=False, indent=1), encoding="utf-8")
    쪽 = 곳 / "기록.html"
    쪽.write_text(화면(번호, 판, 대화, 대화사건, 판사건), encoding="utf-8")
    print(f"만듦: {쪽} (사건 {len(대화사건) + len(판사건)}개, 원본은 {원본})")
    os.startfile(쪽)  # 윈도 기본 브라우저로 띄운다


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1:])
