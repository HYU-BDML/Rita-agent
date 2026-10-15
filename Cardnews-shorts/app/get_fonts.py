"""자막·제목용 Pretendard 글꼴을 app/fonts 에 내려받는다(배포 이미지를 만들 때 실행)."""
import urllib.request
from pathlib import Path

BASE = "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/"
d = Path(__file__).resolve().parent / "fonts"
d.mkdir(exist_ok=True)
for w in ("ExtraBold", "Bold"):
    p = d / f"Pretendard-{w}.otf"
    if not p.exists():
        urllib.request.urlretrieve(BASE + p.name, p)
    print(p.name, p.stat().st_size)
