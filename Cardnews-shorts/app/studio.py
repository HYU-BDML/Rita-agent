"""카드뉴스 → 숏츠 스튜디오(웹 서버).

경계
- 학생: 프로젝트 주소(추측할 수 없는 32자 번호)를 아는 사람만 그 프로젝트를 열 수 있다.
  다른 프로젝트 목록을 보는 길은 없다.
- 교수·조교: ADMIN_TOKEN 을 아는 사람만 전체 목록, 소스 받기, 소스 올리기를 쓸 수 있다.

실행: python app/studio.py   (http://127.0.0.1:8090)
"""
from __future__ import annotations

import io
import json
import os
import re
import secrets
import shutil
import sys
import threading
import time
import traceback
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, Response
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import engine  # noqa: E402

APP_DIR = Path(__file__).resolve().parent
DATA = Path(os.environ.get("PROJECTS_DIR", str(APP_DIR.parent / "data" / "projects"))).resolve()
DATA.mkdir(parents=True, exist_ok=True)
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")
MAX_RENDERS = int(os.environ.get("MAX_RENDERS_PER_PROJECT", "30"))
MAX_AI_IMAGES = int(os.environ.get("MAX_AI_IMAGES_PER_PROJECT", "30"))
WORKERS = int(os.environ.get("RENDER_WORKERS", "2"))
VERSION = "1.0.0"

app = FastAPI(title="카드뉴스 숏츠 스튜디오")
pool = ThreadPoolExecutor(max_workers=WORKERS)
_locks: dict = {}
_glock = threading.Lock()
_ID = re.compile(r"^[0-9a-f]{32}$")


# ── 경계 확인 ───────────────────────────────────────────────
def pdir_of(pid: str) -> Path:
    if not _ID.match(pid or ""):
        raise HTTPException(404, "프로젝트를 찾을 수 없습니다.")
    d = DATA / pid
    if not (d / "project.json").exists():
        raise HTTPException(404, "프로젝트를 찾을 수 없습니다.")
    return d


def require_admin(token: Optional[str]) -> None:
    if not ADMIN_TOKEN or not token or not secrets.compare_digest(token, ADMIN_TOKEN):
        raise HTTPException(403, "교수·조교 전용 기능입니다.")


def lock_of(pid: str) -> threading.Lock:
    with _glock:
        return _locks.setdefault(pid, threading.Lock())


def state_path(d: Path) -> Path:
    return d / "render_state.json"


def read_state(d: Path) -> dict:
    p = state_path(d)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"status": "idle", "log": [], "renders": 0, "ai_images": 0}


def write_state(d: Path, st: dict) -> None:
    tmp = state_path(d).with_suffix(".tmp")
    tmp.write_text(json.dumps(st, ensure_ascii=False), encoding="utf-8")
    tmp.replace(state_path(d))


def safe_rel(d: Path, rel: str) -> Path:
    p = (d / rel).resolve()
    if d.resolve() not in p.parents:
        raise HTTPException(404, "파일을 찾을 수 없습니다.")
    if not p.exists():
        raise HTTPException(404, "파일을 찾을 수 없습니다.")
    return p


def public_view(d: Path) -> dict:
    spec = engine.load_project(d)
    st = read_state(d)
    out = d / "out" / "video.mp4"
    return {
        "id": d.name,
        "project": spec,
        "check": engine.check_project(d, spec),
        "state": st,
        "video": f"/api/projects/{d.name}/video.mp4?t={int(out.stat().st_mtime)}" if out.exists() else None,
        "speech_issues": engine.speech_report(d, spec) if out.exists() else [],
        "voices": list(engine.VOICES),
        "limits": {"renders": MAX_RENDERS, "ai_images": MAX_AI_IMAGES},
    }


# ── 화면 ────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
def index():
    return (APP_DIR / "static" / "index.html").read_text(encoding="utf-8")


@app.get("/admin", response_class=HTMLResponse)
def admin_page():
    return (APP_DIR / "static" / "admin.html").read_text(encoding="utf-8")


@app.get("/static/{name}")
def static_file(name: str):
    p = (APP_DIR / "static" / name).resolve()
    if p.parent != (APP_DIR / "static").resolve() or not p.exists():
        raise HTTPException(404)
    return FileResponse(p)


@app.get("/api/version")
def version():
    return {"version": VERSION, "layout": engine.LAYOUT_VERSION}


# ── 프로젝트 ────────────────────────────────────────────────
@app.post("/api/projects")
async def create_project(request: Request):
    body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    pid = uuid.uuid4().hex
    d = DATA / pid
    (d / "cards").mkdir(parents=True)
    spec = engine.new_project(str(body.get("title", ""))[:80], str(body.get("owner", ""))[:80])
    engine.save_project(d, spec)
    write_state(d, read_state(d))
    return {"id": pid}


@app.get("/api/projects/{pid}")
def get_project(pid: str):
    return public_view(pdir_of(pid))


@app.put("/api/projects/{pid}")
async def update_project(pid: str, request: Request):
    d = pdir_of(pid)
    body = await request.json()
    with lock_of(pid):
        spec = engine.load_project(d)
        for k in ("title", "owner"):
            if k in body:
                spec[k] = str(body[k])[:80]
        if body.get("template") in ("band", "full"):
            spec["template"] = body["template"]
        if "voice" in body and body["voice"] in engine.VOICES:
            spec["voice"] = body["voice"]
        if "speed" in body:
            spec["speed"] = round(min(1.15, max(0.85, float(body["speed"]))), 2)
        if "bgm_volume" in body:
            spec.setdefault("bgm", {})["volume"] = round(min(0.3, max(0.0, float(body["bgm_volume"]))), 2)
        if "pronounce" in body and isinstance(body["pronounce"], dict):
            spec["pronounce"] = {str(k)[:40]: str(v)[:40] for k, v in list(body["pronounce"].items())[:50]}
        if "scenes" in body:
            scenes = []
            for sc in body["scenes"][:12]:
                card = str(sc.get("card", ""))
                if card and not (d / card).resolve().is_relative_to((d / "cards").resolve()):
                    raise HTTPException(400, "잘못된 이미지 경로입니다.")
                extra = []
                for x in (sc.get("extra") or [])[:3]:
                    x = str(x)
                    if not (d / x).resolve().is_relative_to((d / "cards").resolve()):
                        raise HTTPException(400, "잘못된 이미지 경로입니다.")
                    extra.append(x)
                scenes.append({"card": card, "extra": extra, "narration": str(sc.get("narration", ""))[:400]})
            spec["scenes"] = scenes
        engine.save_project(d, spec)
    return public_view(d)


ALLOWED_IMG = {"image/png", "image/jpeg", "image/webp"}


@app.post("/api/projects/{pid}/images")
async def upload_images(pid: str, files: list[UploadFile] = File(...), scene: int = -1, mode: str = "new"):
    """mode=new: 새 장면으로 붙임 / replace: scene 장의 대표 이미지 교체 / extra: scene 장에 추가 이미지"""
    d = pdir_of(pid)
    added = []
    with lock_of(pid):
        spec = engine.load_project(d)
        for f in files:
            data = await f.read()
            if len(data) > 15 * 1024 * 1024:
                raise HTTPException(400, f"{f.filename}: 15MB 이하 이미지만 올릴 수 있습니다.")
            try:
                im = Image.open(io.BytesIO(data))
                im.load()
                im = im.convert("RGB")
            except Exception:
                raise HTTPException(400, f"{f.filename}: 이미지 파일이 아닙니다(PNG·JPG·WEBP만 가능).")
            name = f"up_{time.strftime('%Y%m%d-%H%M%S')}_{uuid.uuid4().hex[:6]}.png"
            im.save(d / "cards" / name)
            rel = f"cards/{name}"
            added.append(rel)
            sc_ok = 0 <= scene < len(spec["scenes"])
            if mode == "replace" and sc_ok:
                spec["scenes"][scene]["card"] = rel
            elif mode == "extra" and sc_ok:
                ex = spec["scenes"][scene].setdefault("extra", [])
                if len(ex) >= 3:
                    raise HTTPException(400, "한 장면에 추가 이미지는 3장까지 넣을 수 있습니다.")
                ex.append(rel)
            elif len(spec["scenes"]) < 12:
                spec["scenes"].append({"card": rel, "extra": [], "narration": ""})
        engine.save_project(d, spec)
    return {"added": added, **public_view(d)}


@app.post("/api/projects/{pid}/ai-image")
async def ai_image(pid: str, request: Request):
    d = pdir_of(pid)
    body = await request.json()
    st = read_state(d)
    if st.get("ai_images", 0) >= MAX_AI_IMAGES:
        raise HTTPException(429, f"AI 이미지는 프로젝트당 {MAX_AI_IMAGES}장까지 만들 수 있습니다.")
    try:
        rel = engine.generate_image(d, str(body.get("prompt", ""))[:1000], str(body.get("aspect", "9:16")))
    except engine.RenderError as e:
        raise HTTPException(400, str(e))
    with lock_of(pid):
        st = read_state(d)
        st["ai_images"] = st.get("ai_images", 0) + 1
        write_state(d, st)
        spec = engine.load_project(d)
        idx = body.get("scene_index")
        mode = body.get("mode", "replace")
        if isinstance(idx, int) and 0 <= idx < len(spec["scenes"]):
            if mode == "extra":
                ex = spec["scenes"][idx].setdefault("extra", [])
                if len(ex) < 3:
                    ex.append(rel)
            else:
                spec["scenes"][idx]["card"] = rel
        elif len(spec["scenes"]) < 12:
            spec["scenes"].append({"card": rel, "extra": [], "narration": ""})
        engine.save_project(d, spec)
    return {"image": rel, **public_view(d)}


@app.post("/api/projects/{pid}/bgm")
async def upload_bgm(pid: str, file: UploadFile = File(...)):
    d = pdir_of(pid)
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(400, "배경음악은 20MB 이하만 올릴 수 있습니다.")
    (d / "bgm").mkdir(exist_ok=True)
    raw = d / "bgm" / ("upload_" + uuid.uuid4().hex[:6])
    raw.write_bytes(data)
    out = d / "bgm" / "bgm.m4a"
    try:
        engine._ff(["-i", str(raw), "-vn", "-ac", "2", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", str(out)])
    except engine.RenderError:
        raise HTTPException(400, "음악 파일을 읽을 수 없습니다(MP3·M4A·WAV 가능).")
    finally:
        raw.unlink(missing_ok=True)
    with lock_of(pid):
        spec = engine.load_project(d)
        spec.setdefault("bgm", {})["file"] = "bgm/bgm.m4a"
        spec["bgm"]["name"] = (file.filename or "")[:80]
        engine.save_project(d, spec)
    return public_view(d)


@app.delete("/api/projects/{pid}/bgm")
def delete_bgm(pid: str):
    d = pdir_of(pid)
    with lock_of(pid):
        spec = engine.load_project(d)
        spec.setdefault("bgm", {})["file"] = None
        engine.save_project(d, spec)
    return public_view(d)


@app.get("/api/projects/{pid}/file/{rel:path}")
def project_file(pid: str, rel: str):
    d = pdir_of(pid)
    p = safe_rel(d, rel)
    if not any(p.parent == (d / sub).resolve() for sub in ("cards", "bgm")):
        raise HTTPException(404)            # 이미지·음악 폴더 밖 파일은 열지 않는다
    return FileResponse(p)


@app.get("/api/projects/{pid}/preview/{idx}.jpg")
def preview(pid: str, idx: int):
    d = pdir_of(pid)
    spec = engine.load_project(d)
    if not (0 <= idx < len(spec["scenes"])) or not spec["scenes"][idx].get("card"):
        raise HTTPException(404)
    try:
        im = engine.preview_frame(d, spec, idx)
    except Exception:
        raise HTTPException(400, "미리보기를 만들 수 없습니다.")
    buf = io.BytesIO()
    im.resize((540, 960)).save(buf, "JPEG", quality=85)
    return Response(buf.getvalue(), media_type="image/jpeg", headers={"Cache-Control": "no-store"})


# ── 영상 만들기 ─────────────────────────────────────────────
def _run_render(pid: str) -> None:
    d = DATA / pid
    st = read_state(d)

    def log(msg: str) -> None:
        st["log"].append(time.strftime("%H:%M:%S ") + msg)
        st["log"] = st["log"][-40:]
        write_state(d, st)

    with lock_of(pid):
        st.update(status="running", started=time.time(), error=None, log=[])
        write_state(d, st)
        try:
            engine.render(d, log=log)
            st.update(status="done", finished=time.time())
        except engine.RenderError as e:
            st.update(status="error", error=str(e))
        except Exception as e:  # 예상 못 한 오류도 학생 화면에 남긴다
            traceback.print_exc()
            st.update(status="error", error=f"알 수 없는 오류({type(e).__name__}). 조교에게 프로젝트 주소를 알려 주세요.")
        write_state(d, st)


@app.post("/api/projects/{pid}/render")
def start_render(pid: str):
    d = pdir_of(pid)
    st = read_state(d)
    if st.get("status") in ("queued", "running"):
        return public_view(d)
    spec = engine.load_project(d)
    chk = engine.check_project(d, spec)
    if chk["errors"]:
        raise HTTPException(400, " / ".join(chk["errors"]))
    if st.get("renders", 0) >= MAX_RENDERS:
        raise HTTPException(429, f"영상 만들기는 프로젝트당 {MAX_RENDERS}번까지입니다. 조교에게 문의하세요.")
    st.update(status="queued", renders=st.get("renders", 0) + 1, error=None,
              log=[time.strftime("%H:%M:%S ") + "순서를 기다리는 중"])
    write_state(d, st)
    pool.submit(_run_render, pid)
    return public_view(d)


@app.get("/api/projects/{pid}/video.mp4")
def video(pid: str, download: int = 0):
    d = pdir_of(pid)
    p = d / "out" / "video.mp4"
    if not p.exists():
        raise HTTPException(404, "아직 영상이 없습니다.")
    spec = engine.load_project(d)
    name = re.sub(r"[^\w가-힣\- ]", "", f"{spec.get('owner','')}_{spec.get('title','숏츠')}").strip() or "shorts"
    return FileResponse(p, media_type="video/mp4", filename=(name + ".mp4") if download else None)


# ── 소스(편집 가능한 프로젝트 묶음) ─────────────────────────
SOURCE_README = """이 압축 파일은 숏츠 한 편의 «소스»입니다.

project.json    카드 순서, 장별 내레이션, 목소리, 속도, 배경음악, 발음 사전
cards/          장면 이미지 원본
bgm/            배경음악(있을 때)
ai_images.jsonl AI로 만든 이미지의 설명문 기록
history/        저장할 때마다 남긴 이전 판 project.json
cache/tts/      문장별 음성(지우면 다시 만들어지고 음성 비용이 다시 듭니다)
cache/scenes/   장면별 자막 시간표(장면 영상은 용량 때문에 빼고, 다시 만들 때 새로 만듭니다)
out/video.mp4   완성 영상

일부만 고치기
1. project.json 에서 고칠 장의 narration(내레이션)이나 card(이미지 경로)만 바꿉니다.
2. 교수용 화면(/admin)의 «소스 올리기»로 이 폴더를 다시 압축해 올리거나,
   저장소의 tools/render_project.py 로 다시 만듭니다:
       python tools/render_project.py <풀어 놓은 폴더>
3. 바뀐 장면만 새로 만들고 나머지 장면은 cache/ 에 있는 것을 그대로 씁니다.
"""


def _zip_project(d: Path) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("README_소스설명.txt", SOURCE_README)
        for p in sorted(d.rglob("*")):
            rel = p.relative_to(d).as_posix()
            if rel.startswith("cache/scenes/") and not rel.endswith(".subs.json"):
                continue                    # 장면 영상은 다시 만들 수 있어 뺀다(음성 캐시는 비용이 들어 남긴다)
            if p.is_file() and p.name not in ("render_state.json",) and not p.name.endswith(".tmp"):
                z.write(p, p.relative_to(d).as_posix())
    return buf.getvalue()


@app.get("/api/projects/{pid}/source.zip")
def source_zip(pid: str):
    d = pdir_of(pid)
    data = _zip_project(d)
    return Response(data, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="shorts_source_{pid[:8]}.zip"'})


# ── 교수·조교 전용 ──────────────────────────────────────────
@app.get("/api/admin/projects")
def admin_projects(x_admin_token: Optional[str] = Header(None)):
    require_admin(x_admin_token)
    rows = []
    for d in DATA.iterdir():
        pj = d / "project.json"
        if not pj.exists():
            continue
        try:
            spec = json.loads(pj.read_text(encoding="utf-8"))
        except Exception:
            continue
        st = read_state(d)
        out = d / "out" / "video.mp4"
        rows.append({"id": d.name, "title": spec.get("title"), "owner": spec.get("owner"),
                     "scenes": len(spec.get("scenes") or []), "updated_at": spec.get("updated_at"),
                     "status": st.get("status"), "renders": st.get("renders", 0),
                     "ai_images": st.get("ai_images", 0), "has_video": out.exists(),
                     "seconds": round(engine.duration(out), 1) if out.exists() else None})
    rows.sort(key=lambda r: r.get("updated_at") or "", reverse=True)
    return {"projects": rows}


@app.post("/api/admin/import")
async def admin_import(file: UploadFile = File(...), x_admin_token: Optional[str] = Header(None)):
    """소스 압축 파일을 새 프로젝트로 올린다(원래 학생 프로젝트는 그대로 둔다)."""
    require_admin(x_admin_token)
    data = await file.read()
    pid = uuid.uuid4().hex
    d = DATA / pid
    d.mkdir()
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            names = z.namelist()
            root = ""
            pj = [n for n in names if n.endswith("project.json") and "history/" not in n]
            if not pj:
                raise HTTPException(400, "project.json 이 들어 있는 소스 압축 파일이 아닙니다.")
            root = pj[0][: -len("project.json")]
            for n in names:
                if not n.startswith(root) or n.endswith("/"):
                    continue
                rel = n[len(root):]
                target = (d / rel).resolve()
                if d.resolve() not in target.parents:
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(z.read(n))
    except zipfile.BadZipFile:
        shutil.rmtree(d, ignore_errors=True)
        raise HTTPException(400, "압축 파일을 열 수 없습니다.")
    except HTTPException:
        shutil.rmtree(d, ignore_errors=True)
        raise
    (d / "cards").mkdir(exist_ok=True)
    write_state(d, {"status": "idle", "log": [], "renders": 0, "ai_images": 0})
    return {"id": pid}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "8090")))
