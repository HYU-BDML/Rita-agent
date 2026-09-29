# 글꼴 — 저장소에 안 넣는다

`analyze/fonts` 와 같은 이유다. **재배포 금지 라이선스가 섞여 있고 16MB 다.**
없으면 `template_render` 가 글자를 못 그리고 `폭표.py` 가 표를 못 굽는다.

| 파일 | 어디서 |
|---|---|
| `Pretendard-Bold.otf` · `Pretendard-Medium.otf` | https://github.com/orioncactus/pretendard 배포판 |
| `WantedSans-Bold.otf` · `WantedSans-Medium.otf` | https://github.com/wanteddev/wanted-sans 배포판 |
| `NotoColorEmoji.ttf` | https://github.com/googlefonts/noto-emoji |

받아 놓고 `python 폭표.py > 폭표.json` 을 한 번 돌리면 폭 검사가 다시 산다.
