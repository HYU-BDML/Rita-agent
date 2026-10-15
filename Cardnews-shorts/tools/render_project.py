"""소스 폴더(project.json 이 있는 폴더)를 다시 영상으로 만든다.

    python tools/render_project.py <소스 폴더>

project.json 에서 고친 장면만 새로 만들고, 나머지 장면은 cache/ 를 그대로 쓴다.
음성 생성 키(FAL_KEY)는 환경 변수 또는 ~/.config/llmgw/.env 에서 읽는다.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
import engine  # noqa: E402

if len(sys.argv) != 2:
    print(__doc__)
    sys.exit(1)
d = Path(sys.argv[1]).resolve()
if not (d / "project.json").exists():
    sys.exit(f"{d} 에 project.json 이 없습니다.")
spec = engine.load_project(d)
chk = engine.check_project(d, spec)
for w in chk["warnings"]:
    print("주의:", w)
if chk["errors"]:
    sys.exit("고칠 것: " + " / ".join(chk["errors"]))
out = engine.render(d)
print("완성:", out)
for x in engine.speech_report(d, spec):
    print(f"발음 확인 필요 {x['scene']}장: {x['sentence']} → 들린 소리: {x['heard']}")
