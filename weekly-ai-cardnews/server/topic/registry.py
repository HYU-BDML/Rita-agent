# -*- coding: utf-8 -*-
"""도구 장부 — 지휘자가 부르는 도구 이름 → 지금 쓸 Apify 도구·입력 틀·건당 값(설계 3장 «바꿔 끼운다»).

씨앗(registry.json)은 저장소에 있고, 판은 창고에 둔 장부(`장부`, 계획 4)를 읽는다 — 수리공이 고치고 되돌리는 곳.
틀의 «{자리}» 가 통째면 값의 꼴(숫자·참거짓·목록) 그대로, 글 안에 섞여 있으면 글로 넣는다."""
import hashlib
import json
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

씨앗 = Path(__file__).with_name("registry.json")


def 읽기() -> dict:
    return json.loads(씨앗.read_text(encoding="utf-8"))


def 채우기(틀, 값: dict):
    if isinstance(틀, dict):
        return {k: 채우기(v, 값) for k, v in 틀.items()}
    if isinstance(틀, list):
        return [채우기(v, 값) for v in 틀]
    if not isinstance(틀, str):
        return 틀

    def 꺼내(이름):
        if 이름 not in 값:
            raise KeyError(f"장부 틀에 모르는 자리: {{{이름}}}")
        return 값[이름]

    통째 = re.fullmatch(r"\{(\w+)\}", 틀)
    if 통째:
        return 꺼내(통째.group(1))
    return re.sub(r"\{(\w+)\}", lambda m: str(꺼내(m.group(1))), 틀)


def 값셈(항목: dict, 청구: dict, 건수: int) -> float:
    """청구된 사건 수 × 장부 값과 받은 건수 × 장부 값 가운데 큰 쪽. 막 끝난 실행은 청구 건수가 0으로 올 때가 많아
    그 0을 믿으면 예산 «돈» 을 1/3 로 셌다(진짜 한 판 10-01) — 예산은 모자라게 세는 것보다 넉넉히 세는 게 안전하다."""
    건수로 = 항목.get("시작삯", 0) + 항목["건당"] * 건수
    if not 청구:
        return round(건수로, 5)
    시작 = 청구.get("actor-start", 0)
    나머지 = sum(v for k, v in 청구.items() if k != "actor-start")
    return round(max(항목.get("시작삯", 0) * 시작 + 항목["건당"] * 나머지, 건수로), 5)


# ── 창고 장부(계획 4 설계 C-1) ─────────────────────────────────────────────

운영키 = "memory/registry.json"
바꿀칸 = ("도구", "입력", "건당", "시작삯", "최소상한")
캐시초 = 60
예전최대, 기록최대 = 5, 30


def _지금글() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _씨앗지문() -> str:
    return hashlib.sha1(씨앗.read_bytes()).hexdigest()[:12]


def _씨앗칸(칸: dict) -> dict:
    return {**칸, "예전": [], "고친기록": [], "계정예외": {}}


class 못읽음(Exception):
    """창고 장부를 못 읽었다 — «없다» 와 다르다. 씨앗으로 덮어쓰지 않는다(가지 전체 검토 I-1)."""


class 장부:
    """창고에 둔 도구 장부 — 모든 판이 같이 읽고 수리공만 고친다(계획 4 설계 C-1).

    없으면 씨앗을 복사해 시작한다. 씨앗이 바뀌면(사람이 저장소에서 고침) 수리공이 안 고친 칸만 씨앗을 따른다.
    잇단 실패 수는 따로 둔다(`…-fails/`) — 판이 실패를 적다가 수리공이 막 고친 장부를 옛것으로 덮지 않게."""

    def __init__(self, s3, 통: str, 앞: str = "weekly/", 키: str = 운영키, 지금=time.monotonic):
        self.s3, self.통, self.앞, self.키, self.지금 = s3, 통, 앞, 키, 지금
        self._값, self._때 = None, 0.0

    def _가져오기(self, 키: str):
        try:
            return json.loads(self.s3.get_object(Bucket=self.통, Key=self.앞 + 키)["Body"].read())
        except Exception as e:
            # 없는 파일만 «없음» — 이 역할은 ListBucket 이 앞자리로만 있어 없는 파일이 AccessDenied 로 올 수도 있다
            # (store._읽기키 와 같은 셈). 잠깐 막힘·시간 초과는 «없음» 으로 보면 수리 기록을 씨앗으로 덮어쓴다(검토 I-1)
            if getattr(e, "response", {}).get("Error", {}).get("Code", "") in ("NoSuchKey", "404", "AccessDenied"):
                return None
            raise 못읽음(f"{type(e).__name__}: {str(e)[:80]}") from e

    def _두기(self, 키: str, d) -> None:
        self.s3.put_object(Bucket=self.통, Key=self.앞 + 키, Body=json.dumps(d, ensure_ascii=False).encode("utf-8"),
                           ContentType="application/json; charset=utf-8")

    def 읽기(self, 새로: bool = False, 엄격: bool = False) -> dict:
        """엄격이면 못 읽을 때 올린다(고치기·되돌리기 — 옛것·씨앗 위에 써서 남의 고침을 지우지 않게). 아니면 받아 둔 것,
        그것도 없으면 씨앗으로 돌되 창고에는 쓰지 않는다(검토 I-1)."""
        if not 새로 and self._값 is not None and self.지금() - self._때 < 캐시초:
            return self._값
        try:
            d = self._가져오기(self.키)
        except 못읽음 as e:
            if 엄격:
                raise
            print(f"!! 장부를 못 읽음 — {'받아 둔 것' if self._값 is not None else '씨앗'}으로 돈다(덮어쓰지 않음): {e}")
            if self._값 is not None:
                return self._값
            return {**{이름: _씨앗칸(칸) for 이름, 칸 in 읽기().items()}, "_씨앗": _씨앗지문()}
        지문 = _씨앗지문()
        if not isinstance(d, dict) or not d or d.get("_씨앗") != 지문:
            d = self._씨앗맞추기(d if isinstance(d, dict) else {}, 지문)
        self._값, self._때 = d, self.지금()
        return d

    def _씨앗맞추기(self, d: dict, 지문: str) -> dict:
        for 이름, 칸 in 읽기().items():
            if 이름 not in d or not d[이름].get("고친기록"):
                d[이름] = _씨앗칸(칸)
        d["_씨앗"] = 지문
        try:
            self._두기(self.키, d)
        except Exception as e:  # 못 남겨도 이번엔 씨앗으로 돈다
            print(f"!! 장부 씨앗 맞추기 실패 {type(e).__name__}: {str(e)[:80]}")
        return d

    def 항목(self, 장부이름: str, 계정: str | None = None) -> dict:
        칸 = self.읽기()[장부이름]
        예외 = (칸.get("계정예외") or {}).get(str(계정 or "").lower())
        return {**칸, **예외} if 예외 else 칸

    def _고쳐두기(self, 장부이름: str, 바꾸기) -> bool:
        """새로 읽고 → 바꾸고 → 쓰고 → 다시 읽어 내 표가 남았나 본다. 장부가 파일 하나라 다른 도구 수리공이 사이에
        통째로 쓰면 앞 고침이 지워졌다(검토 I-2) — 그러면 그 사람 것 위에 다시(세 번까지). 바꿀 것이 없으면 False."""
        for _ in range(3):
            d = self.읽기(새로=True, 엄격=True)
            표 = uuid.uuid4().hex[:12]
            if 바꾸기(d[장부이름]) is False:
                return False
            d[장부이름]["_표"] = 표
            self._두기(self.키, d)
            확인 = self._가져오기(self.키) or {}
            if (확인.get(장부이름) or {}).get("_표") == 표:
                self._값, self._때 = 확인, self.지금()
                return True
        raise 못읽음(f"장부의 {장부이름} 고침을 세 번 써도 남지 않음")

    def 고치기(self, 장부이름: str, 새칸: dict, 까닭: str, 돈: float, 계정: str | None = None) -> None:
        def 바꾸기(칸):
            전 = {k: 칸[k] for k in 바꿀칸 if k in 칸}
            후 = {k: 새칸[k] for k in 바꿀칸 if k in 새칸}
            if 계정:
                칸.setdefault("계정예외", {})[str(계정).lower()] = 후
            else:
                칸["예전"] = [전, *(칸.get("예전") or [])][:예전최대]
                if "도구" in 후 and "최소상한" not in 후:
                    칸.pop("최소상한", None)  # 갈아탄 도구에 옛 도구의 최저 상한을 안 물린다
                칸.update(후)
            칸["고친기록"] = [*(칸.get("고친기록") or []), {"때": _지금글(), "까닭": str(까닭)[:200], "전": 전, "후": 후,
                                                        "돈": round(float(돈), 4), "계정": str(계정 or "").lower()}][-기록최대:]
        self._고쳐두기(장부이름, 바꾸기)
        if not 계정:
            self._실패두기(장부이름, 0)

    def _실패키(self, 장부이름: str) -> str:
        return f"{self.키.removesuffix('.json')}-fails/{장부이름}.json"

    def _실패두기(self, 장부이름: str, n: int) -> None:
        try:
            self._두기(self._실패키(장부이름), {"연속실패": n, "때": _지금글()})
        except Exception as e:  # 못 세도 판은 계속
            print(f"!! 잇단 실패 못 적음 {장부이름} {type(e).__name__}: {str(e)[:80]}")

    def 실패적기(self, 장부이름: str) -> int:
        try:
            n = int((self._가져오기(self._실패키(장부이름)) or {}).get("연속실패") or 0) + 1
        except 못읽음 as e:  # 못 세면 이번엔 안 센다(되돌리기는 다음 실패에)
            print(f"!! 잇단 실패 못 읽음 {장부이름}: {e}")
            return 0
        self._실패두기(장부이름, n)
        return n

    def 성공적기(self, 장부이름: str) -> None:
        try:
            있던 = (self._가져오기(self._실패키(장부이름)) or {}).get("연속실패")
        except 못읽음:
            return
        if 있던:
            self._실패두기(장부이름, 0)

    def 되돌릴까(self, 장부이름: str) -> bool:
        """수리공이 바꾼 칸(마지막 기록이 되돌림·계정예외가 아님)이고 예전 것이 있으면."""
        칸 = self.읽기()[장부이름]
        기록 = 칸.get("고친기록") or []
        return bool(칸.get("예전")) and bool(기록) and not 기록[-1].get("되돌림") and not 기록[-1].get("계정")

    def 되돌리기(self, 장부이름: str) -> bool:
        def 바꾸기(칸):
            if not 칸.get("예전"):
                return False
            옛 = 칸["예전"].pop(0)
            지금칸 = {k: 칸[k] for k in 바꿀칸 if k in 칸}
            for k in 바꿀칸:
                칸.pop(k, None)
            칸.update(옛)
            칸["고친기록"] = [*(칸.get("고친기록") or []), {"때": _지금글(), "까닭": "바꾼 칸이 두 번 잇달아 실패해 예전 것으로 되돌림",
                                                        "전": 지금칸, "후": 옛, "돈": 0.0, "계정": "", "되돌림": True}][-기록최대:]
        if not self._고쳐두기(장부이름, 바꾸기):
            return False
        self._실패두기(장부이름, 0)
        return True
