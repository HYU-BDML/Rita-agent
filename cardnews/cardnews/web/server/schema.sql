-- 담긴 카드뉴스 한 건이 줄 하나다.
-- 칸 이름을 date 가 아니라 posted_at 으로 둔 것은 date 가 SQLite 함수 이름과 겹치기 때문이다.
CREATE TABLE IF NOT EXISTS picks (
  id          TEXT PRIMARY KEY,           -- 인스타 게시물 코드. 중복 담기를 막는 열쇠
  url         TEXT NOT NULL,              -- 인스타 원본 주소
  author      TEXT NOT NULL DEFAULT '',
  caption     TEXT NOT NULL DEFAULT '',
  posted_at   TEXT NOT NULL DEFAULT '',   -- 인스타에 올라온 날짜
  likes       INTEGER NOT NULL DEFAULT 0, -- 좋아요 비공개면 -1
  comments    INTEGER NOT NULL DEFAULT 0,
  slide_count INTEGER NOT NULL,           -- 실제로 창고에 들어간 장수
  slide_total INTEGER NOT NULL,           -- 인스타가 말한 원래 장수
  -- 자리마다 0(사진)·1(영상). 파일 이름의 확장자를 여기서 정한다.
  -- 빈 값이면 전부 사진으로 본다 — 영상을 받기 전에 담은 줄이 그렇다.
  slide_kinds TEXT NOT NULL DEFAULT '',
  tag         TEXT NOT NULL DEFAULT '',   -- 어떤 검색어로 찾았는지
  -- 고정한 것은 목록 맨 앞에 온다. 공동 목록은 같이 보는 자리라 고정도 같이 본다.
  pinned      INTEGER NOT NULL DEFAULT 0,
  picked_at   TEXT NOT NULL,              -- 담은 시각(ISO). 목록 정렬에 쓴다
  -- 릴스 추가 이전 줄은 전부 카드뉴스였다. 새 컬럼이 이미 있는 표에는 안 붙으므로
  -- (CREATE TABLE IF NOT EXISTS 는 기존 표를 안 건드린다) 로컬/원격 모두
  -- `wrangler d1 execute ... --command "ALTER TABLE picks ADD COLUMN ..."` 를 따로 돌려야 한다.
  content_type TEXT NOT NULL DEFAULT 'cardnews', -- 'cardnews' | 'reel'
  play_count  INTEGER NOT NULL DEFAULT -1  -- 조회수. -1 은 비공개/모름 (likes 의 -1 관례를 따른다)
);

CREATE INDEX IF NOT EXISTS picks_picked_at ON picks (picked_at DESC);

-- 분석이 잰 값. 게시물 하나가 줄 하나이고, 슬라이드별 값은 json 안에 통째로 들어 있다.
-- 칸으로 쪼개지 않는 이유는 measures.js 맨 위에 적어두었다.
CREATE TABLE IF NOT EXISTS measures (
  id       TEXT PRIMARY KEY,  -- picks.id 와 같은 게시물 코드
  json     TEXT NOT NULL,     -- analyze/data/measures/<코드>.json 통째로
  saved_at TEXT NOT NULL      -- 올린 시각(ISO)
);

-- 사람이 그은 네모. 슬라이드 하나가 줄 하나다 (동시 라벨링 경합을 없애려고).
-- 칸 이름을 index 가 아니라 idx 로 둔 것은 index 가 SQL 예약어이기 때문이다
-- (picks 의 date → posted_at 과 같은 사정).
CREATE TABLE IF NOT EXISTS annotations (
  id       TEXT NOT NULL,             -- picks.id 와 같은 게시물 코드
  idx      INTEGER NOT NULL,          -- 몇 번째 장인가 (1부터)
  json     TEXT NOT NULL,             -- {canvas, boxes[]} 통째로
  saved_at TEXT NOT NULL,             -- 저장 시각(ISO)
  PRIMARY KEY (id, idx)
);

-- 파이썬 분석이 지금 어디까지 왔나. 게시물 하나가 줄 하나다.
CREATE TABLE IF NOT EXISTS analysis (
  id    TEXT PRIMARY KEY,   -- picks.id 와 같은 게시물 코드
  state TEXT NOT NULL,      -- '분석중' | '분석 끝' | '분석 실패'
  at    TEXT NOT NULL       -- 알려온 시각(ISO)
);

-- 채팅 페이지의 대화. 대화 하나가 줄 하나다.
-- 사람 구분은 아직 없다 — 번호를 아는 브라우저가 주인이다(주소 `/?c=…`).
-- 나중에 리타 로그인이 붙으면 «사용자 → 번호들» 만 잇는다(사람 결정 2026-09-16).
CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,           -- 32자 무작위 hex
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  state      TEXT NOT NULL DEFAULT '{}', -- {틀:{코드,이름}, 지켜보기:{코드,일번호,부터}, 오른쪽:{종류,…}}
  messages   TEXT NOT NULL DEFAULT '[]'  -- [{역할:'사람'|'봇', 말, 때, 틀카드?}]
);

-- 쓰다가 남긴 건의. 한 건이 줄 하나다.
-- **이름을 안 받는다**(사람 결정 2026-09-21: 「익명으로 받을게」). 이름을 받으면
-- 쓰기 귀찮아서 건의 자체를 안 하게 된다.
-- 대신 «어디서 눌렀는지» 를 자동으로 붙인다 — 글만 쌓이면 무엇이 불편했는지
-- 영영 모른다.
CREATE TABLE IF NOT EXISTS suggestions (
  id     TEXT PRIMARY KEY,           -- 32자 무작위 hex
  body   TEXT NOT NULL,              -- 적은 글
  screen TEXT NOT NULL DEFAULT '',   -- 누를 때 오른쪽 칸에 떠 있던 것(틀목록·작업대·미리보기…)
  made   TEXT NOT NULL DEFAULT '',   -- 그때 붙잡고 있던 카드뉴스 주소. 열어서 직접 볼 수 있다
  at     TEXT NOT NULL               -- 적은 시각(ISO)
);

CREATE INDEX IF NOT EXISTS suggestions_at ON suggestions (at DESC);
