# -*- coding: utf-8 -*-
"""판정관 — 좁은 질문 하나씩만 묻는다(설계 5장). 딥시크 flash, 생각 끔, JSON 한 줄로 답.

글을 쓴 모델(v4-pro)과 다른 모델이다. 초안 전체를 넣지 않고 «문장 하나 + 발췌 하나» 만 넣는다.
**애매하면 빼는 쪽** — 답을 못 읽으면 «모자람», 사진이 두 번 엇갈리면 «불확실»."""
import base64
import json
import re

import deepseek
from topic import page

판정한도 = 400
판정읽기초 = 60  # flash 생각 끔은 몇 초면 답한다 — 걸음 전 남길 시간 안에(최종 검토)
그림최대바이트 = 2_000_000
사진갈래 = ("장면", "로고", "기자얼굴", "광고", "무관")

문장지시 = ("너는 사실 확인 판정관이다. «문장» 이 «발췌» 만으로 받쳐지는지 본다. 배경지식은 쓰지 않는다.\n"
          "- 발췌가 문장의 사실(누가·무엇을·언제·숫자)을 모두 담으면 «받쳐줌»\n"
          "- 문장에 발췌에 없는 사실·숫자·날짜가 있으면 «모자람»\n"
          "- 문장이 발췌와 반대되면 «어긋남»\n"
          'JSON 한 줄로만 답한다: {"판정": "받쳐줌|모자람|어긋남", "까닭": "한 문장"}')
사진지시 = ("너는 뉴스 사진 판정관이다. 그림마다 갈래 하나를 고른다 — 장면(그 소식의 실제 장면·인물·제품·무대), "
          "로고(회사·방송사·언론사 로고나 글자뿐인 그림), 기자얼굴(기자·필자 얼굴), 광고, 무관(소식과 상관없음). "
          '그림 앞에 적힌 번호로, JSON 한 줄로만 답한다: {"번호": "갈래", ...}')
같은지시 = ("두 글이 같은 사건(같은 일·같은 발표·같은 공연)을 다루는지 본다. "
          'JSON 한 줄로만 답한다: {"같다": true 또는 false, "까닭": "한 문장"}')


def _제이슨(글: str) -> dict:
    m = re.search(r"\{.*\}", 글 or "", re.S)
    try:
        d = json.loads(m.group(0)) if m else {}
    except ValueError:
        return {}
    return d if isinstance(d, dict) else {}


class 판정관:
    def __init__(self, 대화, 적기, 받기=page.받기):
        self.대화, self.적기, self.받기 = 대화, 적기, 받기

    def _묻기(self, 지시: str, 내용) -> dict:
        답 = self.대화([{"role": "system", "content": 지시}, {"role": "user", "content": 내용}], 판정한도,
                     모델=deepseek.MODEL_빠름, 생각=False, 읽기=판정읽기초)
        self.적기(답, "판정")
        return _제이슨(답["글"])

    def 문장(self, 문장: str, 발췌: str) -> dict:
        d = self._묻기(문장지시, f"문장: {문장}\n발췌: {발췌}")
        판정 = d.get("판정") if d.get("판정") in ("받쳐줌", "모자람", "어긋남") else "모자람"
        return {"판정": 판정, "까닭": str(d.get("까닭") or "")[:200]}

    def _사진한번(self, 그림들: list) -> dict:
        내용 = [{"type": "text", "text": "아래 그림들의 갈래를 골라라."}]
        for 번, 데이터 in 그림들:
            내용 += [{"type": "text", "text": f"번호 {번}"}, {"type": "image_url", "image_url": {"url": 데이터}}]
        return self._묻기(사진지시, 내용)

    def 사진들(self, 후보: list) -> dict:
        결과, 그림들 = {}, []
        for x in 후보[:4]:
            try:
                몸, 꼴, _ = self.받기(x["주소"], 그림최대바이트)
            except Exception:
                몸, 꼴 = b"", ""
            if not 꼴.startswith("image/") or not 몸 or len(몸) >= 그림최대바이트:
                결과[x["번호"]] = "못받음"
                continue
            그림들.append((x["번호"], f"data:{꼴.split(';')[0]};base64,{base64.b64encode(몸).decode()}"))
        if 그림들:
            첫, 둘 = self._사진한번(그림들), self._사진한번(list(reversed(그림들)))
            for 번, _ in 그림들:
                결과[번] = 첫.get(번) if 첫.get(번) == 둘.get(번) and 첫.get(번) in 사진갈래 else "불확실"
        return 결과

    def 같은사건(self, 가: str, 나: str) -> bool:
        return self._묻기(같은지시, f"가: {가}\n나: {나}").get("같다") is True
