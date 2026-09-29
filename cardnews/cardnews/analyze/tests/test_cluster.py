import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import cluster


def test_measure_files_excludes_old_backup(tmp_path):
    """merge_labeled.py 가 남기는 `<코드>.old.json` 백업은 다른 게시물이 아니다.

    글롭이 이걸 같이 주우면 게시물 하나가 둘로 세여 MIN_MEMBERS 판정과 표본 수가
    조용히 부풀어 오른다 — 죽지 않고 이상한 값만 나오는, 이 프로젝트가 제일 경계하는 실패다.
    """
    (tmp_path / "ABC.json").write_text("{}", encoding="utf-8")
    (tmp_path / "ABC.old.json").write_text("{}", encoding="utf-8")
    (tmp_path / "XYZ.json").write_text("{}", encoding="utf-8")

    got = [p.name for p in cluster.measure_files(tmp_path)]

    assert got == ["ABC.json", "XYZ.json"]


def test_measure_files_only_json(tmp_path):
    (tmp_path / "note.txt").write_text("x", encoding="utf-8")
    (tmp_path / "REAL.json").write_text("{}", encoding="utf-8")

    got = [p.name for p in cluster.measure_files(tmp_path)]

    assert got == ["REAL.json"]
