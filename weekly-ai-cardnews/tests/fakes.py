# -*- coding: utf-8 -*-
"""시험용 가짜들 — 돈 드는 것(딥시크·OpenAI·옛 서버 굽기)과 S3 를 대신한다."""
import io
from types import SimpleNamespace


class 없음탈(Exception):
    def __init__(self):
        super().__init__("NoSuchKey")
        self.response = {"Error": {"Code": "NoSuchKey"}}


class 가짜S3:
    def __init__(self):
        self.것들 = {}

    def put_object(self, Bucket, Key, Body, ContentType=None):
        self.것들[Key] = Body if isinstance(Body, bytes) else Body.encode("utf-8")

    def get_object(self, Bucket, Key):
        if Key not in self.것들:
            raise 없음탈()
        return {"Body": io.BytesIO(self.것들[Key])}

    def list_objects_v2(self, Bucket, Prefix, ContinuationToken=None):
        열쇠들 = sorted(k for k in self.것들 if k.startswith(Prefix))
        시작 = int(ContinuationToken or 0)
        조각 = 열쇠들[시작:시작 + 2]  # 두 개씩 끊어 «이어 받기» 도 시험한다
        답 = {"Contents": [{"Key": k} for k in 조각], "IsTruncated": 시작 + 2 < len(열쇠들)}
        if 답["IsTruncated"]:
            답["NextContinuationToken"] = str(시작 + 2)
        return 답

    def generate_presigned_url(self, 방법, Params, ExpiresIn):
        return f"https://fake-s3/{Params['Key']}?X-Amz-Signature=abc"


class 시계:
    def __init__(self):
        self.t = 1000.0

    def 지금(self):
        return self.t

    def 자기(self, s):
        self.t += s


class 가짜옛서버:
    """부른 것을 순서대로 적어 두고, 정해 둔 대로 답한다."""

    def __init__(self, 소식들=None, 굽기=None, 넘겨보기주소="https://fake-s3/viewer/abc.html"):
        self.소식들 = list(소식들 or [])
        self.굽기 = 굽기 or {}
        self.넘겨보기주소 = 넘겨보기주소
        self.부른것 = []
        self._표 = {}
        self._셈 = 0

    def _새표(self, 내용):
        self._셈 += 1
        번 = f"job{self._셈}"
        self._표[번] = {**내용, "물음": 0}
        return 번

    def 소식긁기(self, 주, 해):
        self.부른것.append(("소식긁기", 주, 해))
        return self._새표({"종류": "소식", "몸통": self.소식들.pop(0)})

    def 번호표(self, 번):
        표 = self._표[번]
        표["물음"] += 1
        if 표["종류"] == "소식":
            return {**표["몸통"], "done": True}
        상태, 언제 = 표["결과"]
        if 상태 == "영원히" or 표["물음"] < 언제:
            return {"state": "굽는 중", "done": False}
        if 상태 == "됨":
            답 = {"state": "됨", "done": True, "no": 표["no"], "url": f"https://fake-s3/out/{표['no']:02d}.jpg"}
            if 표.get("표지"):  # 고친 옛 서버는 표지를 그린 GPT 사용량을 싣는다
                답["사용량"] = {"입력글토큰": 900, "입력그림토큰": 3000, "출력토큰": 1600}
            return 답
        return {"state": "실패", "done": True, "error": "굽다 죽음"}

    def 장굽기(self, 장, 틀):
        self.부른것.append(("장굽기", 장["no"], 장.get("media_url"), 장.get("gen")))
        return self._새표({"종류": "장", "no": 장["no"], "결과": self.굽기.get(장["no"], ("됨", 1))})

    def 표지굽기(self, 표지, 틀):
        self.부른것.append(("표지굽기", 표지["no"]))
        return self._새표({"종류": "장", "no": 표지["no"], "표지": True,
                          "결과": self.굽기.get(표지["no"], ("됨", 1))})

    def 폭검사(self, 장들, 틀):
        self.부른것.append(("폭검사", len(장들)))
        return {"ok": True}

    def 넘겨보기(self, 제목, 장들):
        self.부른것.append(("넘겨보기", 제목, [(x["no"], x["url"]) for x in 장들]))
        return self.넘겨보기주소


넘침 = object()
"""가짜딥시크 답 목록에 넣으면 «생각하다 한도를 넘김» 으로 답한다."""


class 가짜딥시크:
    """정해 둔 답을 차례로 준다. 받은 사용자 지시문과 한도를 적어 둔다."""

    def __init__(self, 답들):
        self.답들 = list(답들)
        self.받은것 = []
        self.한도들 = []

    def __call__(self, 시스템, 사용자, 한도):
        self.받은것.append(사용자)
        self.한도들.append(한도)
        답 = self.답들.pop(0)
        if 답 is 넘침:
            return {"글": "", "넘침": True, "입력토큰": 1000, "캐시토큰": 0, "출력토큰": 한도, "생각토큰": 한도, "초": 60}
        return {"글": 답, "넘침": False, "입력토큰": 1000, "캐시토큰": 0, "출력토큰": 5000, "생각토큰": 4000, "초": 30}


def 가짜그림(빠질말=None):
    def 만들기(지시문):
        if 빠질말 and 빠질말 in 지시문:
            from image import 그림탈
            raise 그림탈("OpenAI 잔액 부족")
        return b"\x89PNG fake", {"입력글토큰": 40, "입력그림토큰": 0, "출력토큰": 1600}
    return 만들기


def 손만들기(옛서버=None, 딥시크=None, 그림=None, 남은초=900.0):
    import runs
    import store
    from nodes import check_body, check_hook, design_tpl, merge_script, pick_news
    시 = 시계()
    부른다음 = []
    손 = runs.손(옛서버=옛서버 or 가짜옛서버(), 딥시크=딥시크 or 가짜딥시크([]), 그림=그림 or 가짜그림(),
               창고=store.창고(가짜S3(), "통"),
               노드=SimpleNamespace(design_tpl=design_tpl, pick_news=pick_news, check_body=check_body,
                                  check_hook=check_hook, merge_script=merge_script),
               잠자기=시.자기, 지금=시.지금, 다음부르기=lambda job, 단계: 부른다음.append((job, 단계)),
               남은초=lambda: 남은초)
    return 손, 시, 부른다음
