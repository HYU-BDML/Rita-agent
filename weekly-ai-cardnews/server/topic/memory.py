# -*- coding: utf-8 -*-
"""기억 — 판이 끝나도 남겨 모든 판이 같이 쓴다(설계서 8장, 계획 2-1 설계 2장).

출처 성적표는 출처 하나 = 파일 하나(판 둘이 동시에 써도 서로 덮지 않게), 긁은 결과는 지문 하나 = 파일 하나.
기억은 없으면 없는 대로 — 창고가 흔들려 읽기·쓰기가 터져도 판을 멈추지 않는다(읽기는 None·빈 목록)."""
import hashlib
import json
import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta

import store

진행중시간, 끝난시간 = 6, 24 * 7  # 다시 쓰는 한도(시간) — 설계서 8장
판성적최대 = 10
다시확인일 = 30


def 곳키(곳: str) -> str:
    """«X:@Hearts2Hearts» → «x:hearts2hearts» — 작업판·증거·기억이 같은 꼴로 만나게."""
    return re.sub(r":[@#]", ":", str(곳 or "").strip().lower())


def 이름꼴(이름: str) -> str:
    return re.sub(r"[\s@#_.\-]", "", str(이름 or "")).lower()


def _파일이름(곳: str) -> str:
    원 = 곳키(곳).replace(":", "_", 1)
    이름 = re.sub(r"[^0-9a-z가-힣._-]", "_", 원)
    # 바꾼 글자가 있으면 원래 꼴의 지문을 붙인다 — 일본어·전각 계정이 «_» 로 겹쳐 한 파일이 되지 않게(작은 것 2)
    return 이름 if 이름 == 원 else f"{이름}_{hashlib.sha1(원.encode('utf-8')).hexdigest()[:8]}"


class 기억창고:
    def __init__(self, s3, 통: str, 앞: str = "weekly/"):
        self.s3, self.통, self.앞 = s3, 통, 앞

    def _읽기(self, 키: str):
        try:
            return json.loads(self.s3.get_object(Bucket=self.통, Key=키)["Body"].read())
        except Exception:
            return None

    def _쓰기(self, 키: str, d) -> None:
        self.s3.put_object(Bucket=self.통, Key=키, Body=json.dumps(d, ensure_ascii=False).encode("utf-8"),
                           ContentType="application/json; charset=utf-8")

    # ── 출처 성적표 ──
    def 출처읽기(self, 곳: str) -> dict | None:
        return self._읽기(f"{self.앞}memory/sources/{_파일이름(곳)}.json")

    def 출처쓰기(self, 카드: dict) -> None:
        self._쓰기(f"{self.앞}memory/sources/{_파일이름(카드['출처'])}.json", 카드)

    def _목록(self, 앞: str) -> list[dict]:
        것들, 이어 = [], None
        while True:
            kw = {"Bucket": self.통, "Prefix": 앞}
            if 이어:
                kw["ContinuationToken"] = 이어
            답 = self.s3.list_objects_v2(**kw)
            것들 += 답.get("Contents", [])
            if not 답.get("IsTruncated"):
                return 것들
            이어 = 답["NextContinuationToken"]

    def 출처들(self) -> list[dict]:
        try:
            열쇠들 = [x["Key"] for x in self._목록(f"{self.앞}memory/sources/")]
        except Exception:
            return []
        with ThreadPoolExecutor(max_workers=16) as 일꾼:  # 나란히 — 하나씩 읽어 쌓일수록 느려졌다(작은 것 4)
            return [c for c in 일꾼.map(self._읽기, 열쇠들) if c]

    def 분야명단들(self, 이름들: list) -> list[tuple[str, list]]:
        """이름이 맞는 저장한 분야와 그 출처 명단 — 분야 목록은 한 번만 읽는다(이름마다 다시 읽었다, 작은 것 4)."""
        try:
            분야들 = store.창고(self.s3, self.통, self.앞).분야목록()
        except Exception:
            return []
        찾을 = {이름꼴(x) for x in 이름들}
        return [(f["이름"], list(f.get("출처명단") or [])) for f in 분야들 if 이름꼴(f.get("이름")) in 찾을]

    # ── 긁은 결과 ──
    def 긁은것읽기(self, 지문: str, 지금: datetime, 진행중: bool) -> tuple[list, float] | None:
        d = self._읽기(f"{self.앞}memory/scrapes/{지문}.json")
        if not d:
            return None
        나이 = round((지금 - datetime.fromisoformat(d["가져온때"])).total_seconds() / 3600, 1)
        if 나이 < 0 or 나이 > (진행중시간 if 진행중 else 끝난시간):
            return None
        if d.get("진행중") and not 진행중:  # 진행 중에 긁은 것은 기간이 끝난 뒤의 판에 모자란다(최종 검토 I1)
            return None
        return d["것들"], 나이

    def 긁은것쓰기(self, 지문: str, 것들: list, 지금: datetime, 진행중: bool = False) -> None:
        if 것들:  # 0건은 남기지 않는다 — 다음 판이 계속 0건을 받지 않게
            self._쓰기(f"{self.앞}memory/scrapes/{지문}.json",
                      {"가져온때": 지금.isoformat(), "진행중": 진행중, "것들": 것들})

    def 묵은것치우기(self, 지금: datetime) -> int:
        """다시 쓸 일 없는 긁은 결과(끝난 기간 한도보다 묵은 것)를 지운다 — 판이 끝날 때 한 번(작은 것 11)."""
        한도, 지운 = 지금 - timedelta(hours=끝난시간), 0
        for x in self._목록(f"{self.앞}memory/scrapes/"):
            if x.get("LastModified") and x["LastModified"] < 한도:
                self.s3.delete_object(Bucket=self.통, Key=x["Key"])
                지운 += 1
        return 지운


def _카드한줄(c: dict, 오늘: str) -> str:
    날 = c.get("확인한날") or ""
    지남 = bool(날) and (date.fromisoformat(오늘) - date.fromisoformat(날)).days > 다시확인일
    판들 = c.get("판들") or []
    최근 = 판들[-1] if 판들 else None
    return (f"{c['출처']} · {c.get('판정') or '판정 없음'}" + (f" ({c['근거'][:60]})" if c.get("근거") else "")
            + f" · 확인 {날 or '모름'}" + (" — 30일 지남, 다시 확인 필요" if 지남 else "") + f" · 판 {len(판들)}번"
            + (f" · 최근 판: 가져온 글 {최근['가져온글']} · 결과에 쓰임 {최근['쓰인']} · 영상 {round(최근['영상비율'] * 100)}%"
               if 최근 else ""))


def 꺼내기글(기억, 이름들: list, 오늘: str) -> str:
    """recall_sources 의 결과 글 — 저장한 분야면 그 출처 명단을 맨 앞에, 그다음 이름이 맞는 출처들."""
    찾을 = {이름꼴(x) for x in 이름들} - {""}
    if not 찾을:
        raise ValueError("names 에 이름을 하나 이상")
    줄, 앞곳 = [], []
    for 분야, 명단 in 기억.분야명단들(이름들):
        줄.append(f"저장한 분야 «{분야}» 의 출처 명단: {', '.join(명단) or '없음'}")
        앞곳 += [곳키(x) for x in 명단]

    def 맞나(c):
        이름들_ = {이름꼴(x) for x in c.get("이름들") or []} | {이름꼴(곳키(c["출처"]).split(":", 1)[-1])}
        return bool(찾을 & 이름들_) or 곳키(c["출처"]) in 앞곳

    카드들 = sorted((c for c in 기억.출처들() if 맞나(c)), key=lambda c: (곳키(c["출처"]) not in 앞곳, c["출처"]))
    머리 = f"기억 꺼내기 «{', '.join(이름들)}» — 아는 출처 {len(카드들)}곳"
    if not 카드들 and not 줄:
        return 머리 + "\n처음 보는 주제다 — ② 지도를 새로 그려라."
    return "\n".join([머리, *줄, *(_카드한줄(c, 오늘) for c in 카드들),
                      "늘 새 출처도 20% 쯤 떠 본다 — 기억에 없는 곳에 소식이 있을 수 있다."])


def 판끝적기(기억, 기록: dict, 것들: dict, 오늘: str) -> int:
    """판이 «됨» 으로 끝날 때 코드가 적는다(AI 가 직접 쓰지 않는다). 이름들은 판정이 «공식» 인 출처에만."""
    판, o, r = 기록["재료"]["작업판"], 기록.get("order") or {}, 기록.get("result") or {}
    판정 = {곳키(k): v for k, v in (판.get("출처판정") or {}).items()}
    쓰인, 주인공 = Counter(), {}
    for d in r.get("bundle") or []:
        곳 = 곳키(f"{d['출처']['플랫폼']}:{d['출처']['계정']}")
        쓰인[곳] += 1
        이름 = d.get("주인공") or ""
        if 이름 and 이름 != "그룹":  # 칩 «그룹» 은 이름이 아니다
            주인공.setdefault(곳, []).append(이름)
    가져옴, 영상 = Counter(), Counter()
    for x in 것들.values():
        곳 = 곳키(f"{x.get('플랫폼')}:{x.get('계정')}")
        가져옴[곳] += 1
        영상[곳] += any(m.get("갈래") == "영상" for m in x.get("미디어") or [])
    대상 = set(판정) | set(쓰인)
    for 곳 in sorted(대상):
        판줄 = {"판": 기록["job"], "가져온글": 가져옴[곳], "쓰인": 쓰인[곳], "영상비율": round(영상[곳] / max(1, 가져옴[곳]), 2)}
        for _ in range(3):  # 다른 판이 그사이 덮어써 이 판 기록이 빠졌으면 다시 합친다(작은 것 3)
            카드 = 기억.출처읽기(곳) or {"출처": 곳, "이름들": [], "판정": "", "근거": "", "확인한날": "", "판들": []}
            if 곳 in 판정:
                카드.update(판정=판정[곳]["판정"], 근거=판정[곳].get("근거", ""), 확인한날=오늘)
            if 카드.get("판정") == "공식":
                for 이름 in [o.get("분야이름"), *주인공.get(곳, [])]:
                    if 이름 and 이름꼴(이름) not in {이름꼴(x) for x in 카드["이름들"]}:
                        카드["이름들"].append(이름)
            # 같은 판은 한 줄 — 정리를 다시 돌리면 두 번 적혔다(작은 것 3)
            카드["판들"] = ([p for p in 카드["판들"] if p.get("판") != 기록["job"]] + [판줄])[-판성적최대:]
            기억.출처쓰기(카드)
            다시 = 기억.출처읽기(곳)
            if 다시 and any(p.get("판") == 기록["job"] for p in 다시.get("판들") or []):
                break
    return len(대상)
