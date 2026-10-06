# -*- coding: utf-8 -*-
import sys
from pathlib import Path

서버 = Path(__file__).resolve().parents[1] / "server"
시험 = Path(__file__).resolve().parent
for 길 in (서버, 시험):
    if str(길) not in sys.path:
        sys.path.insert(0, str(길))
