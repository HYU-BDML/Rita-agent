"""Mirror the blank workbook and assemble a student bundle; never package responses."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
OUTPUTS = REPO.parent.parent / "outputs"
DEST = OUTPUTS / HERE.name
SOURCE = OUTPUTS / "Cora_유경_첫사용_2026-10-04" / "Cora_첫사용_소스.zip"
SOURCE_SHA = "78ca06b9dddf6230bf7ef06319685b4e53ae932797b4b2c8fa458622c1c7fc51"

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

assert sha(SOURCE) == SOURCE_SHA, "Source ZIP changed; inspect before distributing."
with zipfile.ZipFile(SOURCE) as z:
    assert z.testzip() is None
    assert "SOURCE_VERSION.json" in z.namelist()
    source_version = json.loads(z.read("SOURCE_VERSION.json"))
    forbidden = ("node_modules", ".next", ".git", "data")
    for name in z.namelist():
        p = Path(name)
        assert not any(part in forbidden or part.startswith(".env") for part in p.parts), name
        assert p.suffix not in (".db", ".sqlite", ".sqlite3", ".pem", ".key"), name

DEST.mkdir(parents=True, exist_ok=True)
deliverables = ["00_유경_2시간_워크북.html", "01_유경에게_보낼말.md", "README.md", "02_워크북_검증.md", "workbook-proof.json"]
for name in deliverables:
    shutil.copy2(HERE / name, DEST / name)
    assert sha(HERE / name) == sha(DEST / name)
shutil.copy2(SOURCE, DEST / SOURCE.name)

manifest = {
    "workbookVersion": "2026-10-05.1",
    "sourceProductCode": "b7d2a95",
    "sourceVersion": source_version,
    "studentResponsesIncluded": False,
    "studentTestPerformed": False,
    "files": {name: sha(DEST / name) for name in deliverables + [SOURCE.name]},
}
(DEST / "전달파일_목록.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
bundle = DEST / "Cora_유경_2시간_전달.zip"
names = ["00_유경_2시간_워크북.html", "01_유경에게_보낼말.md", "README.md", SOURCE.name, "02_워크북_검증.md", "workbook-proof.json", "전달파일_목록.json"]
with zipfile.ZipFile(bundle, "w", compression=zipfile.ZIP_DEFLATED) as z:
    for name in names:
        z.write(DEST / name, name)
with zipfile.ZipFile(bundle) as z:
    assert z.testzip() is None
    assert sorted(z.namelist()) == sorted(names)
    assert hashlib.sha256(z.read(SOURCE.name)).hexdigest() == SOURCE_SHA
(DEST / "전달ZIP_SHA256.txt").write_text(sha(bundle) + "  " + bundle.name + "\n", encoding="utf-8")
submit = OUTPUTS / "조유경_10주" / "제출"
submit.mkdir(parents=True, exist_ok=True)
guide = submit / "00_제출안내.md"
if not guide.exists():
    guide.write_text("""# 첫 사용 제출 공간

시험일_조유경_첫사용 폴더를 만들고 아래 파일을 넣습니다.

1. 워크북 피드백 JSON + 읽기용 보고서(.md)
2. Cora 카드 PNG ZIP + Cora 작업 JSON (제작 성공 시)
3. 오류·불편 화면 캡처 (있을 때만)

예: 2026-10-05_조유경_첫사용/. 피드백 JSON과 작업 JSON은 서로 다른 파일입니다.
DB/.env/API 키/비밀번호는 제출하지 않습니다. 이 폴더는 실제 응답 공간이며 Git에 넣지 않습니다.
교수님은 워크북 제출 단계에서 피드백 JSON을 불러와 봅니다. 캡처와 PNG는 별도 파일로 확인합니다.
폴더가 보인다는 사실만으로 학생에게 공유 권한이 생기는 것은 아닙니다. 교수님이 Drive 권한을 확인합니다.
""", encoding="utf-8")
print(json.dumps({"mirror": str(DEST), "bundleBytes": bundle.stat().st_size, "mirroredFiles": len(deliverables), "sourceSha256": SOURCE_SHA, "submission": str(submit)}, ensure_ascii=False))
