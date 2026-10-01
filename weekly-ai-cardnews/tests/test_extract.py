# -*- coding: utf-8 -*-
import json
from pathlib import Path

import yaml

import extract


def test_뽑은_코드가_yml_과_한글자도_안_다르다(tmp_path):
    extract.뽑기(나갈곳=tmp_path)
    d = yaml.safe_load(extract.원본.read_text(encoding="utf-8"))
    노드 = {n["data"]["title"]: n["data"] for n in d["workflow"]["graph"]["nodes"]}
    for 제목, 파일 in extract.코드이름.items():
        뽑은 = (tmp_path / "nodes" / f"{파일}.py").read_text(encoding="utf-8")
        assert 뽑은.split("\n", 1)[1].rstrip() == 노드[제목]["code"].rstrip(), 제목


def test_저장소에_있는_뽑은_파일이_지금_yml_과_같다(tmp_path):
    extract.뽑기(나갈곳=tmp_path)
    여기 = Path(extract.__file__).resolve().parent
    for 파일 in extract.코드이름.values():
        assert (tmp_path / "nodes" / f"{파일}.py").read_text(encoding="utf-8") == \
            (여기 / "nodes" / f"{파일}.py").read_text(encoding="utf-8"), 파일
    assert (tmp_path / "prompts.json").read_text(encoding="utf-8") == \
        (여기 / "prompts.json").read_text(encoding="utf-8")


def test_지시문에_dify_자리표가_안_남는다():
    지시문 = json.loads((Path(extract.__file__).resolve().parent / "prompts.json").read_text(encoding="utf-8"))
    assert set(지시문) == {"본문대본", "본문다시쓰기", "본문다시쓰기2", "표지훅", "훅다시쓰기", "훅다시쓰기2"}
    for 이름, 둘 in 지시문.items():
        for 글 in 둘.values():
            assert "{{#" not in 글, 이름
    assert "{{소식고르기.news}}" in 지시문["본문대본"]["user"]
    assert "{{본문검증3.slides}}" in 지시문["표지훅"]["user"]


def test_뽑은_코드를_불러_main_을_부를_수_있다():
    from nodes import check_body, check_hook, design_tpl, merge_script, pick_news
    assert isinstance(json.loads(design_tpl.main()["tpl"]), dict)
    for m in (pick_news, check_body, check_hook, merge_script):
        assert callable(m.main)


def test_표지검사는_2026_09_30_에_고친_사람판정이다():
    from nodes import check_hook
    assert "_인형낱말" in Path(check_hook.__file__).read_text(encoding="utf-8")
