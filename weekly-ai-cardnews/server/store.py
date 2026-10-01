# -*- coding: utf-8 -*-
"""창고(S3) — 작업 기록(한 판에 파일 하나)과 소식 그림.

앞자리 `weekly/` 만 쓴다. 옛 서버(`jobs/` · `viewer/` · `out/` …)와 같은 통을 쓰지만 안 겹친다.
"""
import json
import secrets
from datetime import datetime, timezone

보일칸 = ("job", "kind", "week", "year", "order", "field", "state", "pct", "step", "steps", "result", "error", "started",
        "updated", "cost")
자세한칸 = ("board", "lines", "spend")  # 주제 판의 작업판 요약·판단 줄·걸음별 돈 — 한 판 볼 때만(목록엔 무겁다)


def 지금시각() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def 새번호표() -> str:
    """이름 순서가 곧 시간 순서 — 목록 파일을 따로 안 두고 앞자리로 훑는다(동시에 여러 판이 돌아도 안 덮는다)."""
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-") + secrets.token_hex(4)


def 요약(기록: dict, 자세히: bool = True) -> dict:
    """화면에 보낼 것만. 대본 재료(`재료`)는 크고 안 보여도 된다."""
    return {k: 기록.get(k) for k in 보일칸 + (자세한칸 if 자세히 else ())}


class 창고:
    def __init__(self, s3, 통: str, 앞: str = "weekly/"):
        self.s3, self.통, self.앞 = s3, 통, 앞

    def _키(self, job: str) -> str:
        return f"{self.앞}jobs/{job}.json"

    def 쓰기(self, 기록: dict) -> None:
        기록["updated"] = 지금시각()
        self.s3.put_object(Bucket=self.통, Key=self._키(기록["job"]),
                           Body=json.dumps(기록, ensure_ascii=False).encode("utf-8"),
                           ContentType="application/json; charset=utf-8")

    def 읽기(self, job: str) -> dict | None:
        return self._읽기키(self._키(job))

    def _읽기키(self, 키: str) -> dict | None:
        try:
            몸 = self.s3.get_object(Bucket=self.통, Key=키)["Body"].read()
        except Exception as e:
            # 이 역할에 ListBucket 이 앞자리로만 있어, 없는 파일이 AccessDenied 로 올 수도 있다
            if getattr(e, "response", {}).get("Error", {}).get("Code", "") in ("NoSuchKey", "404", "AccessDenied"):
                return None
            raise
        return json.loads(몸)

    def 대화쓰기(self, d: dict) -> None:
        d["updated"] = 지금시각()
        self.s3.put_object(Bucket=self.통, Key=f"{self.앞}chats/{d['chat']}.json",
                           Body=json.dumps(d, ensure_ascii=False).encode("utf-8"),
                           ContentType="application/json; charset=utf-8")

    def 대화읽기(self, 번호: str) -> dict | None:
        return self._읽기키(f"{self.앞}chats/{번호}.json")

    def 분야쓰기(self, f: dict) -> None:
        self.s3.put_object(Bucket=self.통, Key=f"{self.앞}fields/{f['field']}.json",
                           Body=json.dumps(f, ensure_ascii=False).encode("utf-8"),
                           ContentType="application/json; charset=utf-8")

    def 분야읽기(self, 번호: str) -> dict | None:
        return self._읽기키(f"{self.앞}fields/{번호}.json")

    def 분야목록(self) -> list[dict]:
        """저장된 분야 — 새것부터. 모두가 같이 본다(설계 8장)."""
        열쇠들, 이어 = [], None
        while True:
            kw = {"Bucket": self.통, "Prefix": f"{self.앞}fields/"}
            if 이어:
                kw["ContinuationToken"] = 이어
            답 = self.s3.list_objects_v2(**kw)
            열쇠들 += [x["Key"] for x in 답.get("Contents", [])]
            if not 답.get("IsTruncated"):
                break
            이어 = 답["NextContinuationToken"]
        return [f for f in (self._읽기키(k) for k in sorted(열쇠들, reverse=True)) if f]

    def 미디어올리기(self, job: str, 이름: str, 바이트: bytes, 꼴: str) -> str:
        """주제 판의 소식 미디어 — 인스타·스레드 주소는 며칠이면 만료돼서 정리 때 옮겨 둔다."""
        키 = f"{self.앞}topic/{job}/media/{이름}"
        self.s3.put_object(Bucket=self.통, Key=키, Body=바이트, ContentType=꼴)
        return 키

    def 서명주소(self, 키: str, 초: int = 3600) -> str:
        return self.s3.generate_presigned_url("get_object", Params={"Bucket": self.통, "Key": 키}, ExpiresIn=초)

    def 목록(self, 몇개: int = 50) -> list[dict]:
        열쇠들, 이어 = [], None
        while True:
            kw = {"Bucket": self.통, "Prefix": f"{self.앞}jobs/"}
            if 이어:
                kw["ContinuationToken"] = 이어
            답 = self.s3.list_objects_v2(**kw)
            열쇠들 += [x["Key"] for x in 답.get("Contents", [])]
            if not 답.get("IsTruncated"):
                break
            이어 = 답["NextContinuationToken"]
        난것 = []
        for 열쇠 in sorted(열쇠들, reverse=True)[:몇개]:
            기록 = self.읽기(열쇠.rsplit("/", 1)[-1].removesuffix(".json"))
            if 기록:
                난것.append(요약(기록, 자세히=False))
        return 난것

    def 그림올리기(self, job: str, no: int, 바이트: bytes) -> str:
        self.s3.put_object(Bucket=self.통, Key=self._그림키(job, no), Body=바이트, ContentType="image/png")
        return self.그림주소(job, no)

    def 그림주소(self, job: str, no: int) -> str:
        """옛 서버가 몇 분 안에 받아 간다 — 한 시간이면 넉넉하다. «이어서 다시» 로 늦게 구울 때는
        굽기 직전에 다시 받는다. 주소 끝(물음표 앞)이 .png 라 옛 서버가 «이미 미디어 주소» 로
        알아보고 그대로 쓴다(render-server/app.py one_slide)."""
        return self.s3.generate_presigned_url("get_object", Params={"Bucket": self.통, "Key": self._그림키(job, no)},
                                              ExpiresIn=3600)

    def _그림키(self, job: str, no: int) -> str:
        return f"{self.앞}img/{job}/{int(no):02d}.png"
