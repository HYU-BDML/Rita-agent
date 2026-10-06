# -*- coding: utf-8 -*-
"""예산 — 도구 호출 수·돈·시간 세 겹(설계 7장). 매 도구 결과 끝에 «남은 양» 한 줄을 붙인다.

90% 를 넘으면 «새 검색 그만, 정리», 100% 면 submit_result 만 남긴다(그 처리는 conductor).
같은 호출(도구 + 인자 지문)은 다시 하지 않고, 같은 도구에서 새로 나오는 게 두 번 연속 20% 아래면 경고한다."""
import hashlib
import json
from collections import Counter
from datetime import datetime

import cost

외부도구 = {"web_search": "웹", "x_search": "X 검색", "x_account": "X 계정", "instagram_search": "인스타 검색",
          "instagram_account": "인스타 계정", "threads_account": "스레드", "read_page": "페이지", "view_images": "그림 보기",
          "image_search": "그림 검색"}
정리선, 끝선, 새로움선 = 0.9, 1.0, 0.2


def 지문(도구: str, 인자: dict) -> str:
    글 = json.dumps({"도구": 도구, "인자": 인자}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(글.encode("utf-8")).hexdigest()[:16]


class 예산:
    def __init__(self, 한도: dict, 재료: dict, 시작: datetime, 지금):
        self.한도, self.재료, self.시작, self.지금 = 한도, 재료, 시작, 지금
        재료.setdefault("호출기록", [])

    @property
    def 기록(self) -> list:
        return self.재료["호출기록"]

    def 호출수(self) -> int:
        return sum(1 for x in self.기록 if not x.get("저장해둔"))  # 긁은 결과를 다시 쓴 것은 호출이 아니다(계획 2-1)

    def 돈(self) -> float:
        return cost.합계(self.재료)["합계"]

    def 경과분(self) -> float:
        return (self.지금() - self.시작).total_seconds() / 60

    def 남은분(self) -> float:
        return self.한도["분"] - self.경과분()

    def 상태(self) -> str:
        # 시간은 «지난 분 ÷ 한도» 로 센다 — «1 - 남은/한도» 는 소수 오차로 90% 를 놓친다(36/40 이 0.8999…)
        비율 = max(self.호출수() / self.한도["호출"], self.돈() / self.한도["돈"], self.경과분() / self.한도["분"])
        return "끝" if 비율 >= 끝선 else "정리" if 비율 >= 정리선 else "여유"

    def 한줄(self) -> str:
        셈 = Counter(x["도구"] for x in self.기록 if not x.get("저장해둔"))
        나눔 = " · ".join(f"{외부도구.get(k, k)} {v}" for k, v in 셈.items())
        줄 = (f"[남은 예산] 도구 {self.호출수()}/{self.한도['호출']}번" + (f" ({나눔})" if 나눔 else "")
             + f" · 돈 ${self.돈():.2f}/${self.한도['돈']:.2f} · {max(0, self.남은분()):.0f}분 남음")
        return 줄 + {"정리": " — 90% 넘음: 새 검색은 그만, 지금까지 모은 것으로 정리해 submit_result",
                    "끝": " — 예산을 다 썼다: submit_result 만 부를 수 있다"}.get(self.상태(), "")

    def 했나(self, 지문값: str) -> dict | None:
        return next((x for x in self.기록 if x["지문"] == 지문값), None)

    def 적기(self, 줄: dict) -> None:
        self.기록.append({**줄, "번": len(self.기록) + 1})

    def 경고(self) -> list[str]:
        난것 = []
        for 도구, 이름 in 외부도구.items():
            최근 = [x for x in self.기록 if x["도구"] == 도구 and x.get("증거")][-2:]
            if len(최근) == 2 and all(x["새것"] / len(x["증거"]) < 새로움선 for x in 최근):
                난것.append(f"{이름}에서 새로 나오는 게 두 번 연속 20% 아래 — 다른 출처로 옮겨라")
        return 난것
