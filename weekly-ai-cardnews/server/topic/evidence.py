# -*- coding: utf-8 -*-
"""증거 창고 — 이번 판에서 도구가 가져온 모든 것에 번호(E1, E2 …)를 달아 둔다.

지휘자의 대화는 구간마다 지워지지만 여기는 안 지워진다(설계 2장 «원본은 안 사라진다»). 최종 결과도
이 번호로만 증거를 댄다. S3 `weekly/topic/{job}/evidence.json` 한 파일 — 한 판은 한 번에 람다 하나만
돌아서(이어 달리기) 통째로 덮어써도 된다."""
import json
import re
import statistics
import unicodedata

from topic.normalize import 반응점수

_따옴표 = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "「": '"', "」": '"', " ": " "})


def _고르게(글: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", 글 or "").translate(_따옴표)).strip().lower()


class 증거창고:
    def __init__(self, s3, 통: str, job: str, 앞: str = "weekly/"):
        self.s3, self.통, self.job, self.앞 = s3, 통, job, 앞
        self.것들: dict[str, dict] = {}
        self._주소번호: dict[str, str] = {}
        self._읽기()

    def _키(self) -> str:
        return f"{self.앞}topic/{self.job}/evidence.json"

    def _읽기(self) -> None:
        try:
            몸 = self.s3.get_object(Bucket=self.통, Key=self._키())["Body"].read()
        except Exception as e:
            if getattr(e, "response", {}).get("Error", {}).get("Code", "") in ("NoSuchKey", "404", "AccessDenied"):
                return
            raise
        self.것들 = json.loads(몸)
        self._주소번호 = {x["주소"]: k for k, x in self.것들.items() if x.get("주소")}

    def 쓰기(self) -> None:
        self.s3.put_object(Bucket=self.통, Key=self._키(), ContentType="application/json; charset=utf-8",
                           Body=json.dumps(self.것들, ensure_ascii=False).encode("utf-8"))

    def 넣기(self, 항목: dict, 출처: str) -> tuple[str, bool]:
        """같은 주소면 새 번호를 안 만들고 빈 칸만 채운다(검색 결과 → 계정 보기로 더 자세해질 때)."""
        주소 = 항목.get("주소") or ""
        if 주소 in self._주소번호:
            번 = self._주소번호[주소]
            for k, v in 항목.items():
                기존 = self.것들[번].get(k)
                # 빈 칸만 채우되, 본문은 더 긴 쪽으로 — 검색 요약 뒤에 기사를 읽으면 본문이 남게(판 4, 계획 2-1)
                if v and (not 기존 or (k == "글" and isinstance(v, str) and len(v) > len(기존))):
                    if k == "글" and 기존 and _고르게(기존) not in _고르게(v):
                        # 옛 글(검색 요약)도 남긴다 — 요약에서 따온 발췌가 «원문에 없음» 이 됐다(작은 것 9)
                        self.것들[번]["앞글"] = "\n".join(x for x in (self.것들[번].get("앞글"), 기존) if x)
                    self.것들[번][k] = v
            return 번, False
        번 = f"E{len(self.것들) + 1}"
        self.것들[번] = {**항목, "번호": 번, "출처": 출처}
        if 주소:
            self._주소번호[주소] = 번
        return 번, True

    def 꺼내기(self, 번: str) -> dict | None:
        return self.것들.get(str(번).split("#")[0])

    def 발췌있나(self, 번: str, 발췌: str) -> bool:
        """발췌가 원문에 글자 그대로 있나 — 띄어쓰기·따옴표 모양·대소문자만 봐준다."""
        x = self.꺼내기(번)
        if not x or not _고르게(발췌):
            return False
        return _고르게(발췌) in _고르게("\n".join(x.get(k) or "" for k in ("제목", "글", "앞글")))

    def 배수(self, 번: str) -> float:
        """«평소의 몇 배 인기» — 그 글 반응 ÷ 같은 계정·같은 플랫폼의 기간 안 글 반응 가운데값(주간 AI 소식과 같은 셈)."""
        x = self.꺼내기(번)
        if not x or x.get("플랫폼") in ("web", "page"):
            return 0.0
        같은것 = [반응점수(y) for y in self.것들.values()
                if y.get("계정") == x.get("계정") and y.get("플랫폼") == x.get("플랫폼") and not y.get("기간밖")]
        return round(반응점수(x) / max(statistics.median(같은것 or [0]), 1), 1)
