# -*- coding: utf-8 -*-
"""판정관 — 좁은 질문 하나씩만 묻는다(설계 5장). 딥시크 flash, 생각 끔, JSON 한 줄로 답.

글을 쓴 모델(v4-pro)과 다른 모델이다. 초안 전체를 넣지 않고 «문장 하나 + 발췌 하나» 만 넣는다.
**애매하면 빼는 쪽** — 답을 못 읽으면 «모자람», 사진이 두 번 엇갈리면 «불확실»."""
import base64
import json
import re
from concurrent.futures import ThreadPoolExecutor, wait

import deepseek
from topic import page

판정한도 = 400
판정읽기초 = 60  # flash 생각 끔은 몇 초면 답한다 — 걸음 전 남길 시간 안에(최종 검토)
그림최대바이트 = 2_000_000
사진갈래 = ("장면", "공식그림", "로고", "기자얼굴", "광고", "무관")
받는꼴 = ("image/jpeg", "image/png", "image/webp", "image/gif")  # 딥시크 flash 가 받는 그림 꼴 — 계획 4 과제 11 에서 실제로 확인해 맞춘다
묶음크기 = 4
사진글자최대 = 100
사진보기한도 = 1200  # 갈래 + 받아 적은 글자 넉 장 몫 — 판정한도(400)로는 글자가 잘린다
# 꾸밈·작은 그림은 모델에 묻지 않고 «무관»(계획 4 과제 42+ B) — 메이플 공지 옆 띠 180×1200, 이벤트 배너 285×120
꾸밈비, 작은변 = 3, 150
_크기표 = (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF)  # JPEG 의 크기가 적힌 덩이

# 지어 넣은 새 사실만 본다 — 말투·추측까지 붙잡아 좋은 소식을 버렸다(판 3). 날짜·숫자·발췌 글자는 관문 코드가 따로 엄격히 본다.
# 판 3 질문 20개를 이 지시문·흔들림 0 으로 세 번씩 다시 물어 20개 모두 같은 답, 버린 2건 통과·지어 넣은 2건 걸러냄(2026-10-02).
문장지시 = ("너는 사실 확인 판정관이다. «문장» 이 «발췌»·«출처 정보» 에 없는 새 사실을 지어 넣었는지만 본다. 배경지식은 쓰지 않는다.\n"
          "새 사실 = 발췌·출처 정보 어디에도 없는 사람·그룹, 다른 사건, 장소, 함께한 회사·브랜드, 숫자, 날짜.\n"
          "새 사실이 아닌 것(받쳐줌): 바꿔 말하기·번역·줄여 말하기, 사진·영상이 붙은 글에서 바로 알 수 있는 것"
          "(행사 이름과 사진이면 그 행사에 나갔다), 공식 계정 글의 주인공은 그 계정 주인, 프로그램·행사의 종류(예능·콘서트 등), "
          "출처 정보에 있는 사실(어느 계정이 어디에 언제 영상·사진을 올렸나).\n"
          "- 새 사실이 없으면 «받쳐줌»\n"
          "- 새 사실이 있으면 «모자람» — 까닭에 그 새 사실을 적는다\n"
          "- 발췌와 반대되면 «어긋남»\n"
          'JSON 한 줄로만 답한다: {"판정": "받쳐줌|모자람|어긋남", "까닭": "한 문장"}')
얼굴지시 = ("너는 사진 판정관이다. 사진 한 장에서 얼굴이 크고 또렷하게 보이는 사람이 몇 명인지 센다 — 눈·코·입을 알아볼 만큼 "
        "크게 보이는 앞모습이나 비스듬한 얼굴만. 멀리 작게 서 있는 사람·뒷모습·가려진 얼굴·관객은 세지 않는다. "
        "JSON 한 줄로만 답한다: {\"사람\": 숫자}")
사진보기지시 = ("너는 뉴스 사진 판정관이다. 그림마다 두 가지를 적는다.\n"
            "1) 갈래 하나 — 장면(그 소식의 실제 장면·인물·제품·무대), "
            "공식그림(공식 계정·회사·방송사가 만든 포스터·트랙리스트·일정표·티저·출연 안내처럼 글자와 디자인으로 소식을 알리는 "
            "그림, 사진이 아니어도 된다), 로고(상표·마크·이름만 있는 그림), "
            "기자얼굴(기자·필자 얼굴), 광고, 무관(소식과 상관없음).\n"
            "2) 글자 — 그림 안에 보이는 글자 가운데 소식에 쓸 것(점수·날짜·제목·이름·순위)을 보이는 그대로 100자까지. "
            "없으면 빈 글. 지어내거나 고쳐 쓰지 않는다.\n"
            '그림 앞에 적힌 번호로, JSON 한 줄로만 답한다: {"번호": {"갈래": "…", "글자": "…"}, ...}')
같은지시 = ("두 글이 같은 사건(같은 일·같은 발표·같은 공연)을 다루는지 본다. "
          'JSON 한 줄로만 답한다: {"같다": true 또는 false, "까닭": "한 문장"}')


def _제이슨(글: str) -> dict:
    m = re.search(r"\{.*\}", 글 or "", re.S)
    try:
        d = json.loads(m.group(0)) if m else {}
    except ValueError:
        return {}
    return d if isinstance(d, dict) else {}


def _jpeg크기(몸: bytes) -> tuple[int, int] | None:
    i = 2
    while i + 4 <= len(몸):
        if 몸[i] != 0xFF:
            return None
        표 = 몸[i + 1]
        if 표 == 0xFF:  # 채움 바이트
            i += 1
        elif 표 == 0x01 or 0xD0 <= 표 <= 0xD8:  # 길이 없는 표
            i += 2
        elif 표 in _크기표:
            return (int.from_bytes(몸[i + 7:i + 9], "big"), int.from_bytes(몸[i + 5:i + 7], "big")) if i + 9 <= len(몸) else None
        elif 표 in (0xD9, 0xDA):  # 끝·그림 몸 — 그 앞에 크기가 없었다
            return None
        else:
            i += 2 + int.from_bytes(몸[i + 2:i + 4], "big")
    return None


def 그림크기(몸: bytes) -> tuple[int, int] | None:
    """그림 머리에서 (가로, 세로) — PNG·JPEG·GIF·WebP, 표준 라이브러리만(계획 4 과제 42+ B). 못 읽으면 None."""
    크기 = None
    if 몸[:8] == b"\x89PNG\r\n\x1a\n" and 몸[12:16] == b"IHDR" and len(몸) >= 24:
        크기 = int.from_bytes(몸[16:20], "big"), int.from_bytes(몸[20:24], "big")
    elif 몸[:6] in (b"GIF87a", b"GIF89a") and len(몸) >= 10:
        크기 = int.from_bytes(몸[6:8], "little"), int.from_bytes(몸[8:10], "little")
    elif 몸[:4] == b"RIFF" and 몸[8:12] == b"WEBP":
        덩이 = 몸[12:16]
        if 덩이 == b"VP8 " and 몸[23:26] == b"\x9d\x01\x2a" and len(몸) >= 30:
            크기 = int.from_bytes(몸[26:28], "little") & 0x3FFF, int.from_bytes(몸[28:30], "little") & 0x3FFF
        elif 덩이 == b"VP8L" and 몸[20:21] == b"\x2f" and len(몸) >= 25:
            b = int.from_bytes(몸[21:25], "little")
            크기 = (b & 0x3FFF) + 1, ((b >> 14) & 0x3FFF) + 1
        elif 덩이 == b"VP8X" and len(몸) >= 30:
            크기 = int.from_bytes(몸[24:27], "little") + 1, int.from_bytes(몸[27:30], "little") + 1
    elif 몸[:2] == b"\xff\xd8":
        크기 = _jpeg크기(몸)
    return 크기 if 크기 and min(크기) > 0 else None


def _꾸밈(크기) -> bool:
    """긴 변이 짧은 변의 3배를 넘거나 짧은 변이 150 아래 — 공지 꾸밈 띠·작은 배너."""
    return max(크기) > 꾸밈비 * min(크기) or min(크기) < 작은변


def _못받는그림(e: Exception) -> bool:
    """딥시크가 그림 꼴을 거절했나 — 그때만 한 장씩 다시 묻는다(평가 «다시1-아이브» 사진 보기, 계획 4 D-13)."""
    return isinstance(e, deepseek.모델탈) and e.코드 == "400" and "unsupported image" in str(e).lower()


class 판정관:
    def __init__(self, 대화, 적기, 받기=page.받기):
        self.대화, self.적기, self.받기 = 대화, 적기, 받기

    def _묻기(self, 지시: str, 내용, 한도: int = 판정한도) -> dict:
        답 = self.대화([{"role": "system", "content": 지시}, {"role": "user", "content": 내용}], 한도,
                     모델=deepseek.MODEL_빠름, 생각=False, 읽기=판정읽기초, 온도=0)  # 같은 질문엔 같은 답(판 3 에서 뒤집힘)
        self.적기(답, "판정")
        return _제이슨(답["글"])

    def 문장(self, 문장: str, 발췌: str, 정보: str = "") -> dict:
        d = self._묻기(문장지시, f"문장: {문장}\n발췌: {발췌}" + (f"\n출처 정보(사실로 써도 됨): {정보}" if 정보 else ""))
        판정 = d.get("판정") if d.get("판정") in ("받쳐줌", "모자람", "어긋남") else "모자람"
        return {"판정": 판정, "까닭": str(d.get("까닭") or "")[:200]}

    def _사진한번(self, 그림들: list) -> dict:
        """{번호: (갈래 또는 None, 글자)} — 갈래만 «"장면"» 처럼 답해도 받는다."""
        내용 = [{"type": "text", "text": "아래 그림들의 갈래와 글자를 적어라."}]
        for 번, 데이터 in 그림들:
            내용 += [{"type": "text", "text": f"번호 {번}"}, {"type": "image_url", "image_url": {"url": 데이터}}]
        d = self._묻기(사진보기지시, 내용, 사진보기한도)
        난것 = {}
        for 번, _ in 그림들:
            v = d.get(번)
            갈래, 글자 = (v.get("갈래"), v.get("글자")) if isinstance(v, dict) else (v, "")
            난것[번] = (갈래 if 갈래 in 사진갈래 else None, re.sub(r"\s+", " ", str(글자 or "")).strip()[:사진글자최대])
        return 난것

    def _두번(self, 그림들: list) -> dict:
        """갈래는 순서를 바꿔 두 번 물어 같을 때만(다르면 «불확실»), 글자는 첫 물음."""
        첫, 둘 = self._사진한번(그림들), self._사진한번(list(reversed(그림들)))
        return {번: {"갈래": 첫[번][0] if 첫[번][0] and 첫[번][0] == 둘[번][0] else "불확실", "글자": 첫[번][1]}
                for 번, _ in 그림들}

    def _받아보기(self, 주소: str) -> tuple[bytes, str]:
        try:
            몸, 꼴, _ = self.받기(주소, 그림최대바이트)
        except Exception:
            return b"", ""
        return 몸 or b"", (꼴 or "").split(";")[0].strip().lower()

    def _그림(self, x: dict) -> tuple:
        """(몸, 꼴, 크기, 덧붙일 것). 원본을 못 받으면(4xx·그림 아님) 작은주소로 한 번 더 — 판정도 카드도 그 그림이라 «주소» 를
        알린다. 원본이 판정관에게 너무 크면 갈래만 작은 그림으로 보고 크기·주소는 원본 그대로(계획 4 과제 42+ C)."""
        몸, 꼴 = self._받아보기(x["주소"])
        원본그림 = 꼴 in 받는꼴 and bool(몸)
        크기 = 그림크기(몸) if 원본그림 else None  # 너무 커서 잘린 몸도 머리는 있다
        if x.get("작은주소") and (not 원본그림 or len(몸) >= 그림최대바이트):
            작몸, 작꼴 = self._받아보기(x["작은주소"])
            if 작꼴 in 받는꼴 and 작몸 and len(작몸) < 그림최대바이트:
                return (작몸, 작꼴, 크기, {}) if 원본그림 else (작몸, 작꼴, 그림크기(작몸), {"주소": x["작은주소"]})
        return 몸, 꼴, 크기, {}

    def _묶음(self, 후보: list) -> dict:
        """넉 장 한 묶음 — 받기·꼴 거르기·꾸밈 거르기 → 두 번 묻기. 답마다 머리에서 읽은 «크기»([가로, 세로], 못 읽으면
        None)를 싣는다(계획 4 과제 42+ B)."""
        결과, 그림들, 덧 = {}, [], {}
        for x in 후보:
            몸, 꼴, 크기, 더 = self._그림(x)
            덧[x["번호"]] = {"크기": list(크기) if 크기 else None, **더}
            if 크기 and _꾸밈(크기):
                결과[x["번호"]] = {"갈래": "무관", "글자": ""}
            elif 꼴 not in 받는꼴 or not 몸 or len(몸) >= 그림최대바이트:
                결과[x["번호"]] = {"갈래": "못받음", "글자": ""}
            else:
                그림들.append((x["번호"], f"data:{꼴};base64,{base64.b64encode(몸).decode()}"))
        결과.update(self._물어보기(그림들))
        return {번: {**d, **덧.get(번, {"크기": None})} for 번, d in 결과.items()}

    def _물어보기(self, 그림들: list) -> dict:
        """«지원하지 않는 그림» 으로 통째 거절되면 한 장씩 다시 — 나쁜 한 장만 «못받음»."""
        if not 그림들:
            return {}
        try:
            return self._두번(그림들)
        except deepseek.모델탈 as e:
            if not _못받는그림(e):
                raise
        결과 = {}
        for 한장 in 그림들:
            try:
                결과.update(self._두번([한장]) if len(그림들) > 1 else {한장[0]: {"갈래": "못받음", "글자": ""}})
            except deepseek.모델탈 as e2:
                if not _못받는그림(e2):
                    raise
                결과[한장[0]] = {"갈래": "못받음", "글자": ""}
        return 결과

    def _묶음안전(self, 후보: list) -> dict:
        try:
            return self._묶음(후보)
        except Exception as e:  # 묶음 하나가 터져도 판정 전체를 멈추지 않는다 — 비워 두면 나중에 다시 물을 수 있다
            print(f"!! 사진 판정 실패 {[x['번호'] for x in 후보]} {type(e).__name__}: {str(e)[:80]}")
            return {}

    def 사진보기(self, 후보: list, 마감초: float | None = None) -> dict:
        """사진마다 갈래와 사진 속 글자(계획 4 B) — 넉 장씩 묶어 나란히. 못 받은 그림·딥시크가 받지 않는 꼴은 «못받음».
        마감을 넘긴 묶음·다른 까닭으로 터진 묶음은 답에서 빠진다(나중에 다시 물을 수 있게)."""
        묶음들 = [후보[i:i + 묶음크기] for i in range(0, len(후보), 묶음크기)]
        if not 묶음들:
            return {}
        결과 = {}
        풀 = ThreadPoolExecutor(max_workers=4)
        try:
            미래들 = [풀.submit(self._묶음안전, 묶) for 묶 in 묶음들]
            끝난, _ = wait(미래들, timeout=마감초)
            for f in 미래들:
                if f in 끝난:
                    결과.update(f.result())
        finally:
            풀.shutdown(wait=False, cancel_futures=True)  # 마감을 넘긴 묶음은 기다리지 않는다
        return 결과

    def 사진들(self, 후보: list) -> dict:
        """갈래만 — 지휘자의 «사진 보기» 와 정리의 기사 사진 고르기(앞 4장)."""
        return {번: d["갈래"] for 번, d in self.사진보기(후보[:4]).items()}

    def 얼굴수(self, 주소: str) -> int | None:
        """표지 사진에 얼굴이 보이는 사람 수 — 0명이면 얼굴 없이, 1명이면 그 사람, 2명 넘으면 그룹으로 그린다(계획 3)."""
        try:
            몸, 꼴, _ = self.받기(주소, 그림최대바이트)
        except Exception:
            return None
        if not 꼴.startswith("image/") or not 몸 or len(몸) >= 그림최대바이트:
            return None
        그림 = f"data:{꼴.split(';')[0]};base64,{base64.b64encode(몸).decode()}"
        d = self._묻기(얼굴지시, [{"type": "text", "text": "얼굴이 보이는 사람 수"},
                            {"type": "image_url", "image_url": {"url": 그림}}])
        n = d.get("사람")
        return n if isinstance(n, int) and not isinstance(n, bool) and n >= 0 else None

    def 같은사건(self, 가: str, 나: str) -> bool:
        return self._묻기(같은지시, f"가: {가}\n나: {나}").get("같다") is True
