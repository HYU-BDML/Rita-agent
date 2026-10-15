"""카드뉴스 → 정보형 숏츠 조립 엔진.

프로젝트 폴더 하나가 숏츠 한 편의 «소스»다.

    <project>/
      project.json        숏츠 설계도(카드 순서, 장별 내레이션, 목소리, 배경음악)
      cards/              학생이 올린 카드 이미지 원본
      bgm/                학생이 올린 배경음악(선택)
      cache/tts/          문장별 음성(문장·목소리가 같으면 다시 만들지 않는다)
      cache/scenes/       장면별 영상(카드·내레이션·목소리·화면 규격이 같으면 다시 만들지 않는다)
      history/            project.json 을 저장할 때마다 남기는 이전 판
      out/video.mp4       완성 영상

project.json 의 한 장만 고치면 그 장면만 다시 만들고 나머지는 캐시를 쓴다.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import Callable, Dict, List, Optional

from PIL import Image

import compose
import speech_text
from typing import Tuple

# ── 화면 규격 ────────────────────────────────────────────────
W, H = 1080, 1920
FPS = 30
LAYOUT_VERSION = "v7"          # 화면 배치를 바꾸면 올린다 → 장면 캐시가 전부 새로 만들어진다


FIRST_LEAD_S = 0.12                # 영상 첫 장면: 말이 0.15초 안에 시작한다(조사 9건 모두 0.36초 이내)
LEAD_S = 0.06                      # 다른 장면 시작 뒤 말을 시작하기까지
TAIL_S = 0.30                      # 말이 끝난 뒤 다음 장면까지
LAST_TAIL_S = 0.9                  # 마지막 장면은 마지막 말을 읽을 시간을 조금 더 준다
SENT_GAP_S = 0.14                  # 같은 장 안 문장 사이 쉼

TTS_MODEL = "fal-ai/elevenlabs/tts/multilingual-v2"
VOICES = {                          # 화면에 보이는 이름 → ElevenLabs 목소리 이름
    "여성 차분": "Rachel",
    "여성 밝음": "Aria",
    "남성 차분": "Brian",
    "남성 또렷": "Daniel",
}
DEFAULT_VOICE = "여성 차분"

APP_DIR = Path(__file__).resolve().parent


class RenderError(Exception):
    """학생 화면에 그대로 보여 줄 수 있는 실패 이유."""


# ── 설계도 ──────────────────────────────────────────────────
def new_project(title: str = "", owner: str = "") -> dict:
    return {
        "schema": 1,
        "title": title,
        "owner": owner,                 # 학번·이름(학생이 적음)
        "template": "band",            # band(제목 띠형) / full(전체 화면형)
        "voice": DEFAULT_VOICE,
        "speed": 1.0,
        "bgm": {"file": None, "volume": 0.12},
        "scenes": [],                   # [{"card": "cards/01.png", "narration": "..."}]
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "updated_at": None,
    }


def load_project(pdir: Path) -> dict:
    return json.loads((pdir / "project.json").read_text(encoding="utf-8"))


def save_project(pdir: Path, spec: dict) -> None:
    """저장할 때마다 이전 판을 history/ 에 남긴다."""
    pj = pdir / "project.json"
    if pj.exists():
        hist = pdir / "history"
        hist.mkdir(exist_ok=True)
        shutil.copy2(pj, hist / f"project_{time.strftime('%Y%m%d-%H%M%S')}_{int(time.time()*1000)%1000:03d}.json")
    spec["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    tmp = pj.with_suffix(".tmp")
    tmp.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(pj)


# ── 문장·자막 나누기 ─────────────────────────────────────────
_SENT_RE = re.compile(r"(?<=[.!?。…])\s+|\n+")


def split_sentences(text: str) -> List[str]:
    text = re.sub(r"[ \t]+", " ", (text or "").strip())
    return [s.strip() for s in _SENT_RE.split(text) if s and s.strip()]


def syllables(s: str) -> int:
    """읽는 시간의 근사치. 한글 음절·숫자·영문 글자를 센다."""
    n = 0
    for ch in s:
        if "가" <= ch <= "힣":
            n += 1
        elif ch.isdigit():
            n += 1.4        # 숫자는 읽으면 길어진다(240 → 이백사십)
        elif ch.isalpha():
            n += 0.5
    return max(1, int(round(n)))


def estimate_seconds(text: str, speed: float = 1.0) -> float:
    return sum(syllables(s) for s in split_sentences(text)) / (6.2 * speed)


def _visual_len(s: str) -> float:
    s = s.replace("*", "")
    return sum(1.0 if ("가" <= c <= "힣" or c.isdigit()) else 0.55 for c in s)


_BREAK_STRONG = ("는", "은", "고", "며", "서", "면", "지만", "는데", "은데", "니다", "어요", "죠", "데도")
_BREAK_WEAK = ("이", "가", "을", "를", "에게", "에서", "으로", "로", "와", "과", "도", "까지", "부터", "보다", "처럼", "에")
_NO_BREAK = ("의", "한", "두", "세", "네", "몇", "새", "그", "이런", "그런", "저런", "어떤", "모든", "약", "총", "단", "원래", "바로", "가장", "꼭", "더", "잘", "안", "못")


def _good_break(word: str) -> float:
    """이 단어 뒤에서 끊기 좋은 정도. 2=문장부호, 1.5=주제·연결 어미, 1=격조사, 음수=끊으면 안 됨."""
    w = word.rstrip("\"'”’)»")
    if w.endswith((",", "，", ":", ";", "·")):
        return 2
    if w in _NO_BREAK or w.endswith("의") or re.search(r"\d[\d.,]*(만|천|억|조|백)?$", w):
        return -1
    if len(w) >= 2 and w.endswith(_BREAK_STRONG):
        return 1.5
    if len(w) >= 2 and w.endswith(_BREAK_WEAK):
        return 1
    return 0


# ── 검사(무료, 만들기 전에) ─────────────────────────────────
def check_project(pdir: Path, spec: dict) -> Dict[str, list]:
    errors, warnings = [], []
    scenes = spec.get("scenes") or []
    if len(scenes) < 3:
        errors.append(f"카드가 {len(scenes)}장입니다. 3장 이상 올려야 합니다.")
    if len(scenes) > 12:
        errors.append(f"카드가 {len(scenes)}장입니다. 12장 이하로 줄여야 합니다.")
    total = 0.0
    for i, sc in enumerate(scenes, 1):
        nar = (sc.get("narration") or "").strip()
        card = pdir / (sc.get("card") or "")
        if not sc.get("card") or not card.exists():
            errors.append(f"{i}장: 카드 이미지가 없습니다.")
        else:
            try:
                with Image.open(card) as im:
                    w, h = im.size
                if w < 600:
                    warnings.append(f"{i}장: 이미지 가로가 {w}px입니다. 1080px 이미지를 쓰면 글자가 선명해집니다.")
                r = h / w
                if r >= 1.5:
                    if w < 1000:
                        warnings.append(f"{i}장: 세로 이미지 가로가 {w}px라 화면 전체로 키우면 조금 흐려집니다. 1080px 이상을 권장합니다.")
                elif not (0.95 <= r <= 1.30):
                    warnings.append(f"{i}장: 이미지 비율이 {w}×{h}입니다. 카드는 4:5나 1:1, 전체 화면 이미지는 9:16으로 만들어야 빈 여백이 없습니다.")
            except Exception:
                errors.append(f"{i}장: 이미지를 열 수 없습니다. PNG나 JPG로 다시 올려 주세요.")
        if not nar:
            errors.append(f"{i}장: 내레이션이 비어 있습니다.")
            continue
        if len(nar) > 160:
            errors.append(f"{i}장: 내레이션이 {len(nar)}자입니다. 한 장에 160자 이하로 줄여야 합니다(권장 40~110자).")
        elif len(nar) > 110:
            warnings.append(f"{i}장: 내레이션이 {len(nar)}자입니다. 110자를 넘으면 한 장이 너무 길어집니다.")
        sec = estimate_seconds(compose.strip_marks(nar), spec.get("speed", 1.0))
        total += sec + LEAD_S + TAIL_S
        for x in sc.get("extra") or []:
            if not (pdir / x).exists():
                errors.append(f"{i}장: 추가 이미지 파일이 없습니다({x}).")
    if scenes and total > 90:
        errors.append(f"예상 길이 {total:.0f}초입니다. 90초 이하로 줄여야 합니다(권장 30~60초).")
    elif scenes and total > 60:
        warnings.append(f"예상 길이 {total:.0f}초입니다. 숏츠는 30~60초가 권장입니다.")
    elif scenes and 0 < total < 15:
        warnings.append(f"예상 길이 {total:.0f}초입니다. 15초보다 짧으면 내용이 전달되기 어렵습니다.")
    tl = compose.split_title(spec.get("title", ""))
    if not tl:
        errors.append("상단 제목을 적어 주세요. 영상 내내 위쪽에 고정되는 제목입니다(예: 240만 명에게 물었는데 / 완전히 틀린 이유).")
    elif max(compose._vlen(x) for x in tl) > 16:
        warnings.append("상단 제목 한 줄이 16자를 넘어 글자가 작아집니다. 두 줄로 나누거나(/ 사용) 줄여 주세요.")
    if spec.get("voice") not in VOICES:
        errors.append("목소리를 골라 주세요.")
    return {"errors": errors, "warnings": warnings, "estimated_seconds": round(max(total, 0), 1)}


# ── 음성 ────────────────────────────────────────────────────
def _fal_key() -> str:
    k = os.environ.get("FAL_KEY", "").strip()
    if not k:
        env = Path.home() / ".config" / "llmgw" / ".env"     # 로컬 개발용(키는 코드에 두지 않는다)
        if env.exists():
            for line in env.read_text(encoding="utf-8").splitlines():
                if line.startswith("FAL_KEY="):
                    k = line.split("=", 1)[1].strip()
    if not k:
        raise RenderError("서버에 음성 생성 키(FAL_KEY)가 설정되지 않았습니다. 담당 조교에게 알려 주세요.")
    return k


def _fal(model: str, payload: dict, timeout: int = 180) -> dict:
    req = urllib.request.Request(
        "https://fal.run/" + model, data=json.dumps(payload).encode(),
        headers={"Authorization": "Key " + _fal_key(), "Content-Type": "application/json"})
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except Exception as e:      # 일시 오류는 다시 시도한다
            last = e
            time.sleep(2 * (attempt + 1))
    raise RenderError(f"외부 생성 서비스 호출에 실패했습니다({type(last).__name__}). 잠시 뒤 다시 눌러 주세요.")


def _download(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def _tts_call(text: str, voice: str, speed: float, stability: float) -> bytes:
    out = _fal(TTS_MODEL, {"text": text, "voice": voice, "stability": stability, "similarity_boost": 0.75,
                           "speed": max(0.8, min(1.2, speed))})
    return _download(out["audio"]["url"])


def transcribe(audio: Path) -> str:
    """발음 검사용 받아 적기(Whisper)."""
    import base64
    small = audio.with_suffix(".check.mp3")
    _ff(["-i", str(audio), "-ac", "1", "-ar", "16000", "-b:a", "48k", str(small)])
    uri = "data:audio/mpeg;base64," + base64.b64encode(small.read_bytes()).decode()
    small.unlink(missing_ok=True)
    out = _fal("fal-ai/whisper", {"audio_url": uri, "language": "ko", "task": "transcribe"})
    return (out.get("text") or "").strip()


VERIFY_SPEECH = os.environ.get("VERIFY_SPEECH", "1") != "0"
SPEECH_OK = 0.90


def tts_sentence(pdir: Path, text: str, spec: dict) -> Path:
    """문장 하나의 음성. 만든 뒤 받아 적어 원고와 대조하고, 어긋나면 최대 두 번 다시 만든다."""
    voice = VOICES[spec["voice"]]
    speed = float(spec.get("speed", 1.0))
    spoken = speech_text.speakable(text, spec.get("pronounce"))
    key = hashlib.sha1(f"{TTS_MODEL}|{voice}|{speed}|{spoken}".encode()).hexdigest()[:20]
    d = pdir / "cache" / "tts"
    d.mkdir(parents=True, exist_ok=True)
    wav = d / f"{key}.wav"
    meta = d / f"{key}.json"
    if wav.exists() and meta.exists():
        return wav
    best = None
    for attempt, stability in enumerate((0.55, 0.70, 0.40)):
        mp3 = d / f"{key}.try{attempt}.mp3"
        mp3.write_bytes(_tts_call(spoken, voice, speed, stability))
        cand = d / f"{key}.try{attempt}.wav"
        # 앞뒤 무음을 잘라 문장 길이를 정확히 맞춘다
        _ff(["-i", str(mp3), "-af",
             "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,"
             "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,"
             "aresample=48000", "-ac", "2", str(cand)])
        mp3.unlink(missing_ok=True)
        heard, ratio = "", 1.0
        if VERIFY_SPEECH:
            try:
                heard = transcribe(cand)
                ratio = speech_text.match_ratio(text, heard)
            except RenderError:
                heard, ratio = "(받아 적기 실패)", None
        if best is None or (ratio or 0) > (best[1] or 0):
            best = (cand, ratio, heard, attempt)
        if ratio is None or ratio >= SPEECH_OK:
            break
    cand, ratio, heard, attempt = best
    cand.replace(wav)
    for f in d.glob(f"{key}.try*.wav"):
        f.unlink(missing_ok=True)
    meta.write_text(json.dumps({"script": text, "spoken": spoken, "heard": heard, "match": ratio,
                                "attempts": attempt + 1, "voice": voice}, ensure_ascii=False, indent=1),
                    encoding="utf-8")
    return wav


def speech_report(pdir: Path, spec: dict) -> List[dict]:
    """발음 검사에서 기준(0.90)에 못 미친 문장 목록."""
    bad = []
    for i, sc in enumerate(spec["scenes"], 1):
        for sent in split_sentences(compose.strip_marks(sc.get("narration", ""))):
            spoken = speech_text.speakable(sent, spec.get("pronounce"))
            key = hashlib.sha1(f"{TTS_MODEL}|{VOICES[spec['voice']]}|{float(spec.get('speed', 1.0))}|{spoken}"
                               .encode()).hexdigest()[:20]
            m = pdir / "cache" / "tts" / f"{key}.json"
            if m.exists():
                info = json.loads(m.read_text(encoding="utf-8"))
                if info.get("match") is not None and info["match"] < SPEECH_OK:
                    bad.append({"scene": i, "sentence": sent, "heard": info.get("heard"),
                                "match": round(info["match"], 2)})
    return bad


# ── ffmpeg 도우미 ───────────────────────────────────────────
def _ff(args: List[str]) -> None:
    r = subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"] + args,
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RenderError("영상 합성 단계에서 오류가 났습니다: " + r.stderr.strip()[-300:])


def duration(path: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", str(path)], capture_output=True, text=True)
    return float(r.stdout.strip())


# ── 화면 그리기 ─────────────────────────────────────────────
def _fit(im: Image.Image, box_w: int, box_h: int) -> Image.Image:
    s = min(box_w / im.width, box_h / im.height)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def scene_images(sc: dict) -> List[str]:
    return [x for x in [sc.get("card")] + list(sc.get("extra") or []) if x]


def _caption_timeline(sents: List[str], durs: List[float], lead: float) -> Tuple[list, float]:
    """문장 음성 길이로 자막 구절의 시각을 정한다. 반환: ([(시작, 끝, 구절)], 말이 끝난 시각)"""
    timeline = []
    t = lead
    for s, dur in zip(sents, durs):
        ph = compose.phrases(s, _good_break)
        weights = [max(1, syllables(compose.strip_marks(x))) for x in ph]
        tot = sum(weights)
        ct = t
        for x, w in zip(ph, weights):
            cd = dur * w / tot
            timeline.append([ct, ct + cd, x])
            ct += cd
        t += dur + SENT_GAP_S
    end = t - SENT_GAP_S
    for k in range(len(timeline) - 1):          # 구절 사이 빈틈을 메운다
        timeline[k][1] = timeline[k + 1][0]
    if timeline:
        timeline[-1][1] = end + 0.15
    return timeline, end


def preview_frame(pdir: Path, spec: dict, idx: int, sub_lines: Optional[List[str]] = None) -> Image.Image:
    """비용 없는 배치 미리보기: 그 장면의 첫 컷과 첫 자막 구절."""
    sc = spec["scenes"][idx]
    imgs = scene_images(sc)
    fr = compose.Frame(pdir, spec.get("template", "band"), spec.get("title", ""), imgs)
    cards = {r: compose.is_card(fr.imgs[r]) for r in imgs}
    shots = compose.plan_shots(imgs, cards, 3.0, [])
    sents = split_sentences(sc.get("narration", ""))
    cap = None
    if sents:
        ph = compose.phrases(sents[0], _good_break)
        cap = compose.caption_image(ph[0], fr.t["cap_size"]) if ph else None
    return fr.draw(shots[0], 0.8, cap)


# ── 장면 만들기 ─────────────────────────────────────────────
def _scene_key(pdir: Path, sc: dict, spec: dict, idx: int, n: int) -> str:
    h = hashlib.sha1()
    for rel in scene_images(sc):
        h.update((pdir / rel).read_bytes())
    h.update(json.dumps([LAYOUT_VERSION, spec.get("template", "band"), spec.get("title", ""),
                         spec.get("pronounce"), sc["narration"].strip(), spec["voice"], spec.get("speed", 1.0),
                         idx == 0], ensure_ascii=False).encode())
    return h.hexdigest()[:20]


def build_scene(pdir: Path, spec: dict, idx: int, log: Callable[[str], None]) -> Path:
    sc = spec["scenes"][idx]
    n = len(spec["scenes"])
    key = _scene_key(pdir, sc, spec, idx, n)
    d = pdir / "cache" / "scenes"
    d.mkdir(parents=True, exist_ok=True)
    out = d / f"{key}.mp4"
    if out.exists():
        log(f"{idx+1}장: 이전에 만든 장면을 그대로 씁니다")
        return out

    sents = split_sentences(sc["narration"])
    log(f"{idx+1}장: 음성 만드는 중({len(sents)}문장)")
    wavs = [tts_sentence(pdir, compose.strip_marks(s), spec) for s in sents]
    durs = [duration(w) for w in wavs]
    lead = FIRST_LEAD_S if idx == 0 else LEAD_S
    timeline, speech_end = _caption_timeline(sents, durs, lead)

    # 장면 오디오: 앞 쉼 + 문장1 + 쉼 + 문장2 … + 뒤 쉼
    aud = d / f"{key}.wav"
    inputs = []
    for w in wavs:
        inputs += ["-i", str(w)]
    fc = f"aevalsrc=0:d={lead}:s=48000:c=stereo[lead];"
    seq = "[lead]"
    for k in range(len(wavs)):
        seq += f"[{k}:a]"
        if k < len(wavs) - 1:
            fc += f"aevalsrc=0:d={SENT_GAP_S}:s=48000:c=stereo[g{k}];"
            seq += f"[g{k}]"
    tail = LAST_TAIL_S if idx == n - 1 else TAIL_S
    fc += f"aevalsrc=0:d={tail}:s=48000:c=stereo[tail];"
    seq += "[tail]"
    cnt = 2 + len(wavs) + max(0, len(wavs) - 1)
    fc += f"{seq}concat=n={cnt}:v=0:a=1[a]"
    _ff(inputs + ["-filter_complex", fc, "-map", "[a]", "-ar", "48000", "-ac", "2", str(aud)])
    total = duration(aud)

    log(f"{idx+1}장: 화면 그리는 중({total:.1f}초)")
    imgs = scene_images(sc)
    fr = compose.Frame(pdir, spec.get("template", "band"), spec.get("title", ""), imgs)
    cards = {r: compose.is_card(fr.imgs[r]) for r in imgs}
    shots = compose.plan_shots(imgs, cards, total, [a for a, _, _ in timeline])
    caps = [(a, b, compose.caption_image(x, fr.t["cap_size"])) for a, b, x in timeline]

    vid = d / f"{key}.video.mp4"
    nframes = int(round(total * FPS))
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
         "-pix_fmt", "yuv420p", str(vid)], stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        si = 0
        for f in range(nframes):
            tt = f / FPS
            while si < len(shots) - 1 and tt >= shots[si].end:
                si += 1
            cap = next((im for a, b, im in caps if a <= tt < b), None)
            proc.stdin.write(fr.draw(shots[si], tt, cap).tobytes())
        proc.stdin.close()
        err = proc.stderr.read().decode(errors="ignore")
        if proc.wait() != 0:
            raise RenderError("장면 영상 인코딩 실패: " + err[-300:])
    finally:
        if proc.poll() is None:
            proc.kill()

    _ff(["-i", str(vid), "-i", str(aud), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac",
         "-b:a", "192k", "-shortest", str(out)])
    vid.unlink(missing_ok=True)
    (d / f"{key}.subs.json").write_text(json.dumps(
        {"captions": [{"start": round(a, 3), "end": round(b, 3), "text": x} for a, b, x in timeline],
         "shots": [{"image": s.image, "start": s.start, "end": s.end, "zoom": [s.z0, s.z1]} for s in shots]},
        ensure_ascii=False, indent=1), encoding="utf-8")
    return out


# ── 전체 조립 ───────────────────────────────────────────────
def render(pdir: Path, log: Callable[[str], None] = print) -> Path:
    spec = load_project(pdir)
    chk = check_project(pdir, spec)
    if chk["errors"]:
        raise RenderError(" / ".join(chk["errors"]))
    n = len(spec["scenes"])
    clips = [build_scene(pdir, spec, i, log) for i in range(n)]

    log("장면 이어 붙이는 중")
    out_dir = pdir / "out"
    out_dir.mkdir(exist_ok=True)
    joined = out_dir / "joined.mp4"
    inputs = []
    for c in clips:
        inputs += ["-i", str(c)]
    # 장면 사이는 바로 바꾼다(조사한 고조회 쇼츠의 기본 전환)
    fc = "".join(f"[{i}:v][{i}:a]" for i in range(n)) + f"concat=n={n}:v=1:a=1[v][a]"
    _ff(inputs + ["-filter_complex", fc, "-map", "[v]", "-map", "[a]",
                  "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
                  "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(joined)])

    final = out_dir / "video.mp4"
    bgm = (spec.get("bgm") or {}).get("file")
    if bgm and (pdir / bgm).exists():
        log("배경음악 섞는 중")
        vol = float((spec.get("bgm") or {}).get("volume", 0.12))
        total = duration(joined)
        # 내레이션이 나올 때 배경음악을 자동으로 낮춘다(사이드체인)
        fc = (f"[1:a]aloop=loop=-1:size=2e9,atrim=0:{total:.3f},volume={vol},"
              f"afade=t=in:d=1,afade=t=out:st={max(0,total-1.5):.3f}:d=1.5[m];"
              f"[0:a]asplit[n1][n2];[m][n2]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=400[md];"
              f"[n1][md]amix=inputs=2:normalize=0[a]")
        _ff(["-i", str(joined), "-i", str(pdir / bgm), "-filter_complex", fc, "-map", "0:v", "-map", "[a]",
             "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final)])
        joined.unlink(missing_ok=True)
    else:
        joined.replace(final)
    # 소리 크기를 숏츠 표준(-14 LUFS 근처)으로 맞춘다
    norm = out_dir / "video_norm.mp4"
    _ff(["-i", str(final), "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "48000",
         "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(norm)])
    norm.replace(final)
    log(f"완성: {duration(final):.1f}초")
    return final


# ── 장면 이미지 생성(선택) ───────────────────────────────────
IMAGE_MODEL = "fal-ai/nano-banana-pro"
IMAGE_STYLE_GUARD = ("no text, no letters, no captions, no watermark, no logo. "
                     "High quality, sharp focus, natural lighting, vertical composition with the main subject "
                     "in the upper two-thirds and calm space at the bottom.")


def generate_image(pdir: Path, prompt: str, aspect: str = "9:16") -> str:
    """학생 설명으로 장면 이미지를 만들어 cards/ 에 저장하고 프로젝트 상대 경로를 돌려준다.
    글자는 넣지 않게 한다(AI가 그린 한글은 깨지기 쉽다. 글자는 자막과 카드가 맡는다)."""
    prompt = (prompt or "").strip()
    if len(prompt) < 5:
        raise RenderError("이미지 설명을 다섯 글자 이상 적어 주세요.")
    if aspect not in ("9:16", "4:5", "1:1"):
        aspect = "9:16"
    out = _fal(IMAGE_MODEL, {"prompt": prompt + "\n\n" + IMAGE_STYLE_GUARD, "aspect_ratio": aspect,
                             "num_images": 1, "output_format": "png", "resolution": "2K"}, timeout=300)
    url = out["images"][0]["url"]
    data = _download(url)
    d = pdir / "cards"
    d.mkdir(exist_ok=True)
    name = f"ai_{time.strftime('%Y%m%d-%H%M%S')}_{hashlib.sha1(data).hexdigest()[:6]}.png"
    (d / name).write_bytes(data)
    log = pdir / "ai_images.jsonl"                  # 어떤 설명으로 만들었는지 남긴다(교수 확인·재현용)
    with log.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"file": f"cards/{name}", "prompt": prompt, "aspect": aspect, "model": IMAGE_MODEL,
                            "at": time.strftime("%Y-%m-%d %H:%M:%S")}, ensure_ascii=False) + "\n")
    return f"cards/{name}"
