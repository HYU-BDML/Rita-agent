# -*- coding: utf-8 -*-
"""옛 서버 창고에 남아 있는 «소식 긁기» 결과를 시험 재료로 받아 둔다.
돈 안 든다 — 이미 긁은 번호표를 읽기만 한다.

    python weekly/tests/grab_procure.py efbe7c38ab31403ba9f6f411a7e0dee4
"""
import json
import sys
import urllib.request
from pathlib import Path

번호 = sys.argv[1]
주소 = f"<옛 서버 주소>/render/compose/{번호}?wait=0"
with urllib.request.urlopen(주소, timeout=30) as r:
    d = json.load(r)
if d.get("state") != "됨":
    raise SystemExit(f"이 번호표는 «{d.get('state')}» 다 — 재료로 못 쓴다. 짐작하지 말고 사람에게 알린다")
나갈곳 = Path(__file__).resolve().parent / "재료" / f"procure_{번호[:8]}.json"
나갈곳.parent.mkdir(exist_ok=True)
나갈곳.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
print(f"받음: {나갈곳.name} · X {d['count']['x']}건 · 블로그 {d['count']['blog']}건")
