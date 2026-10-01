# -*- coding: utf-8 -*-
"""Task 1 — 도구 7개·딥시크 셋·기사 셋의 진짜 원본을 받아 weekly/tests/재료/topic/ 에 둔다.

    python weekly/tests/grab_topic.py          # 값만 말하고 끝 (돈 0)
    python weekly/tests/grab_topic.py 받기     # 실제로 받는다 (약 $0.10)

열쇠는 머리글로만. Apify 는 옛 서버와 같이 쓰지 않는 열쇠 중 남은 돈이 가장 많은 것.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request
import winreg
from pathlib import Path

import boto3

sys.stdout.reconfigure(encoding="utf-8")
재료 = Path(__file__).resolve().parent / "재료" / "topic"
API = "https://api.apify.com/v2"
열쇠파일 = Path(r"C:\Users\david\project\trend\apify api.txt")

# (저장 이름, 도구, 입력) — 9월 3주차(9/21~9/27 KST) 기준. 시간은 KST 0시 = UTC 전날 15시
일감 = [
    ("x_search", "kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest",
     {"searchTerms": ["CORTIS since:2026-09-20_15:00:00_UTC until:2026-09-27_15:00:00_UTC"],
      "maxItems": 20, "queryType": "Top"}),
    ("x_search_ko", "kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest",
     {"searchTerms": ["코르티스 since:2026-09-20_15:00:00_UTC until:2026-09-27_15:00:00_UTC"],
      "maxItems": 20, "queryType": "Top"}),
    ("x_account", "kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest",
     {"searchTerms": ["from:NVIDIAAI"], "maxItems": 5, "queryType": "Latest"}),
    ("instagram_search", "apify~instagram-hashtag-scraper",
     {"hashtags": ["cortis"], "resultsType": "posts", "resultsLimit": 10}),
    ("instagram_account", "apify~instagram-profile-scraper", {"usernames": ["nvidia"]}),
    ("instagram_posts", "apify~instagram-post-scraper",
     {"username": ["nvidia"], "resultsLimit": 5, "onlyPostsNewerThan": "2026-09-20",
      "skipPinnedPosts": True, "dataDetailLevel": "basicData"}),
    ("web_search", "apify~google-search-scraper",
     {"queries": "CORTIS 컴백", "maxPagesPerQuery": 1, "countryCode": "kr", "searchLanguage": "ko",
      "afterDate": "2026-09-20", "beforeDate": "2026-09-28"}),
]


def _사용자변수(이름):
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
        return winreg.QueryValueEx(k, 이름)[0].strip()


def _부르기(방법, 길, 열쇠, 몸=None, 시간=90):
    요청 = urllib.request.Request(API + 길, method=방법, headers={"Authorization": "Bearer " + 열쇠,
                                                           "Content-Type": "application/json"},
                                data=None if 몸 is None else json.dumps(몸, ensure_ascii=False).encode("utf-8"))
    try:
        with urllib.request.urlopen(요청, timeout=시간) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"오류": e.code, "말": e.read().decode("utf-8", "replace")[:300]}


def 열쇠고르기():
    같이씀 = re.findall(r"apify_api_[A-Za-z0-9]+", boto3.client("lambda", region_name="ap-northeast-2")
                     .get_function_configuration(FunctionName="cardnews-render")["Environment"]["Variables"]
                     .get("APIFY_TOKEN", ""))
    후보 = []
    for i, k in enumerate(re.findall(r"apify_api_[A-Za-z0-9]+", 열쇠파일.read_text(encoding="utf-8")), 1):
        d = _부르기("GET", "/users/me/limits", k).get("data") or {}
        남은 = (d.get("limits") or {}).get("maxMonthlyUsageUsd", 0) - (d.get("current") or {}).get("monthlyUsageUsd", 0)
        print(f"열쇠 {i}: 남은 ${남은:.2f}" + (" (옛 서버와 같이 씀 — 안 씀)" if k in 같이씀 else ""))
        if k not in 같이씀:
            후보.append((남은, i, k))
    남은, i, k = max(후보)
    print(f"→ 열쇠 {i} 를 쓴다 (남은 ${남은:.2f})")
    return k


def 돌리기(이름, 도구, 입력, 열쇠):
    # 구글 검색 도구는 상한을 $0.50 아래로 못 잡는다(400 max-total-charge-usd-below-minimum, 2026-10-01).
    # 상한일 뿐 청구는 쪽 수만큼이다.
    상한 = 0.5 if "google-search" in 도구 else 0.05
    run = _부르기("POST", f"/acts/{도구}/runs?timeout=120&maxTotalChargeUsd={상한}&waitForFinish=60", 열쇠, 입력)
    if "오류" in run:
        print(f"  ✗ {이름} 시작 실패 {run}")
        return
    run = run["data"]
    시작 = time.time()
    while run["status"] in ("READY", "RUNNING") and time.time() - 시작 < 200:
        run = _부르기("GET", f"/actor-runs/{run['id']}?waitForFinish=60", 열쇠)["data"]
    것들 = _부르기("GET", f"/datasets/{run['defaultDatasetId']}/items?clean=true&format=json", 열쇠)
    (재료 / f"{이름}.json").write_text(json.dumps(것들, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  ✓ {이름}: 상태 {run['status']} · {len(것들) if isinstance(것들, list) else 것들} 건 · "
          f"청구 사건 {run.get('chargedEventCounts')} · usageTotalUsd {run.get('usageTotalUsd')}")


def 딥시크():
    열쇠 = _사용자변수("DEEPSEEK_API_KEY")

    def 보내기(몸):
        요청 = urllib.request.Request("https://api.deepseek.com/chat/completions",
                                    data=json.dumps(몸, ensure_ascii=False).encode("utf-8"),
                                    headers={"Authorization": "Bearer " + 열쇠, "Content-Type": "application/json"})
        with urllib.request.urlopen(요청, timeout=300) as r:
            return json.load(r)

    도구 = [{"type": "function", "function": {"name": "x_search", "description": "X 글을 검색어로 찾는다",
            "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}}]
    말 = [{"role": "system", "content": "너는 소식 수집 지휘자다. 도구 결과를 보고 다음 걸음을 정한다."},
         {"role": "user", "content": "코르티스 9월 3주차 소식을 찾기 시작해. 첫 걸음은 x_search 하나만."}]
    첫 = 보내기({"model": "deepseek-v4-pro", "max_tokens": 8000, "tools": 도구, "messages": 말})
    m = 첫["choices"][0]["message"]
    말.append({"role": "assistant", "content": m.get("content") or "", "reasoning_content": m.get("reasoning_content"),
              "tool_calls": m["tool_calls"]})
    말.append({"role": "tool", "tool_call_id": m["tool_calls"][0]["id"],
              "content": "E1 · X @cortis_official ✓인증 · 9/24 · ♥12,400 · 영상 · \"CORTIS 'FaSHioN' 뮤직비디오 공개\""})
    둘 = 보내기({"model": "deepseek-v4-pro", "max_tokens": 8000, "tools": 도구, "messages": 말})
    (재료 / "deepseek_loop.json").write_text(json.dumps({"첫": 첫, "둘": 둘}, ensure_ascii=False, indent=1), encoding="utf-8")
    print("  ✓ 딥시크 도구 두 걸음:", 둘["choices"][0]["finish_reason"], 둘.get("usage"))
    판 = 보내기({"model": "deepseek-flash", "max_tokens": 300, "thinking": {"type": "disabled"}, "messages": [
        {"role": "system", "content": "JSON 한 줄로만 답한다: {\"판정\": \"받쳐줌|모자람|어긋남\", \"까닭\": \"한 문장\"}"},
        {"role": "user", "content": "문장: 코르티스가 9월 24일 뮤직비디오를 공개했다.\n발췌: CORTIS 'FaSHioN' 뮤직비디오 공개 (9/24)"}]})
    (재료 / "deepseek_judge.json").write_text(json.dumps(판, ensure_ascii=False, indent=1), encoding="utf-8")
    print("  ✓ flash 생각 끔 판정:", 판["choices"][0]["message"]["content"][:120])


def _받기(주소):
    요청 = urllib.request.Request(주소, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0"})
    with urllib.request.urlopen(요청, timeout=30) as r:
        return r.read()


_SNS = r"naver\.com|instagram\.com|x\.com|twitter\.com|youtube\.com|threads\.|tiktok\.com|facebook\.com"


def _주소들(이름):
    결과 = json.loads((재료 / f"{이름}.json").read_text(encoding="utf-8"))
    return [o.get("url") or "" for 쪽 in 결과 for o in (쪽.get("organicResults") or [])]


def 기사들(열쇠):
    """기사 주소는 지어내지 않는다 — 방금 받은 구글 결과에서 네이버 기사 하나·다른 언론사 하나,
    엔비디아 블로그 RSS 의 맨 위 글 하나를 고른다. 구글 결과에 네이버 기사가 없으면(2026-10-01 실제로 없었다)
    네이버 뉴스만 찾는 검색을 한 번 더 한다(약 $0.0055)."""
    주소들 = _주소들("web_search")
    네이버 = next((u for u in 주소들 if "news.naver.com" in u), None)
    if not 네이버:
        돌리기("web_search_naver", "apify~google-search-scraper",
             {"queries": "코르티스 site:n.news.naver.com", "maxPagesPerQuery": 1, "countryCode": "kr",
              "searchLanguage": "ko"}, 열쇠)
        네이버 = next((u for u in _주소들("web_search_naver") if "news.naver.com" in u), None)
    # SNS·구인 같은 곳을 빼고 기사처럼 생긴 주소(news·article·trending·press)만
    언론 = next((u for u in 주소들 if u and not re.search(_SNS, u) and re.search(r"news|article|trending|press", u)), None)
    rss = _받기("https://blogs.nvidia.com/feed/").decode("utf-8", "replace")
    블로그 = re.findall(r"<item>.*?<link>([^<]+)</link>", rss, re.S)[0]
    for 이름, 주소 in (("page_naver", 네이버), ("page_news", 언론), ("page_blog", 블로그)):
        if not 주소:
            print(f"  ✗ {이름}: 구글 결과에 그런 주소가 없음 — 검색어를 바꿔 web_search 만 다시 받는다")
            continue
        try:
            (재료 / f"{이름}.html").write_bytes(_받기(주소))
            (재료 / f"{이름}.url").write_text(주소, encoding="utf-8")
            print(f"  ✓ {이름} 받음 ({주소[:60]})")
        except Exception as e:
            print(f"  ✗ {이름}: {e}")


if __name__ == "__main__":
    재료.mkdir(parents=True, exist_ok=True)
    print("값: kaito 45건×$0.00025 · 해시태그 10건×$0.0026 · 프로필 1×$0.0026 · 게시물 5×$0.0017 · 구글 $0.0055"
          " → Apify 약 $0.06 / 딥시크 세 번 약 $0.03")
    if sys.argv[1:] != ["받기"]:
        sys.exit()
    k = 열쇠고르기()
    for 이름, 도구, 입력 in 일감:
        돌리기(이름, 도구, 입력, k)
    딥시크()
    기사들(k)
