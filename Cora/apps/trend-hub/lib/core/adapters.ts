import type { Candidate, CandidateUnit } from './candidate';
import type { PostRecord } from './post-record';

/** 화면에 폼으로 렌더되는 입력 한 칸. Dify start 노드의 variables 와 같은 개념. */
export interface InputField {
  name: string;
  label: string;
  type: 'text' | 'paragraph' | 'select' | 'number';
  required?: boolean;
  options?: string[];
  default?: string;
  help?: string;
}

export interface RunContext {
  runId: string;
  runAt: string;
  /** 목 모드 — API 키가 없으면 켜진다. 키 없이도 화면이 돈다. */
  mock: boolean;
}

/* ────────────────────────────── 판정기 ────────────────────────────── */

/**
 * 판정기 어댑터.
 *
 * role 이 둘을 가른다:
 *   'produces' — 후보를 낳는다 (소재 찾기, 캐릭터 발굴)
 *   'attaches' — 후보를 낳지 않고 기존 후보에 붙는다 (벤치마크)
 *
 * 벤치마크를 독립 판정기로 두면 후보 보드에 주제·캐릭터·영상이 섞여 화면이 애매해진다.
 * 후보에 붙는 것으로 두면 "이 후보를 어떻게 만들까" 자리에 정확히 들어간다.
 */
export interface Discovery {
  id: string;
  name: string;
  description: string;
  role: 'produces' | 'attaches';
  unit: CandidateUnit;
  inputs: InputField[];

  /** Dify 앱 API 키를 담는 env 변수 이름. 없으면 목 모드로 돈다. */
  keyEnv?: string;

  /**
   * 지금 쓰지 않는 이유. 적으면 화면에서 내려가고 설정에만 이유와 함께 남는다.
   *
   * 코드를 지우지 않고 세워 두는 자리다. 같은 일을 하는 게 두 벌 생겼을 때
   * 안 도는 쪽을 목록에 그냥 두면 되는 것과 안 되는 것이 섞여 화면이 거짓말을 한다.
   */
  held?: string;

  /** 워크플로우를 돌려 원본을 받는다. 여기는 판정기마다 다를 게 거의 없다. */
  run(input: Record<string, string>, ctx: RunContext): Promise<unknown>;

  /**
   * 원본 → 공통 후보. 판정기별로 다른 코드는 사실상 여기뿐이다.
   * run 과 분리한 이유: 규칙을 고친 뒤 저장된 원본에 다시 돌릴 수 있어야 해서.
   * (Dify 에선 이게 불가능해서 규칙 하나 고칠 때마다 API 20콜을 다시 썼다.)
   */
  normalize(raw: unknown, ctx: RunContext): Candidate[];

  /**
   * 원본 → 게시물 레코드 (지시서 P2). **선택이다.** 구현하지 않으면 적재하지 않는다.
   *
   * normalize 와 나눠 둔 이유는 같다 — 규칙을 고친 뒤 저장된 원본에 다시 돌릴 수 있어야 한다.
   * normalize 가 만든 후보를 그대로 받아 어느 게시물이 어느 후보의 근거였는지 잇는다.
   */
  records?(raw: unknown, ctx: RunContext, candidates: Candidate[]): PostRecord[];

  /**
   * 한 회차를 여러 번 읽은 스냅샷을 가려내는 열쇠. **선택이다.**
   *
   * 같은 값을 내는 스냅샷이 여럿이면 다시 세울 때 **마지막 것만 쓴다.** 앞의 것들은
   * 그 회차가 아직 판정 중이던 중간 상태다. 세우기만 하고 내리지는 않기 때문에,
   * 중간 상태에서 한 번 올라온 후보는 완성본이 내려도 표에 남는다.
   *
   * 실제로 그랬다 — 레이더가 `MONSTA X 'MAGIC' Dance Practice` 를 01:12 에 올렸다가
   * 01:14 에 "유튜브 인기 영상의 제목입니다"라며 내렸는데, 표에는 남아 있었다.
   *
   * 구현하지 않으면 지금까지대로 모든 스냅샷을 순서대로 본다.
   */
  snapshotKey?(raw: unknown): string | null;
}

/** role: 'attaches' 인 판정기는 이걸 추가로 구현한다. */
export interface AttachingDiscovery extends Discovery {
  role: 'attaches';
  /** 후보에 붙일 것을 만든다. 후보를 통째로 바꾸지 않고 hint 조각만 돌려준다. */
  attach(candidate: Candidate, raw: unknown, ctx: RunContext): Partial<Candidate['hint']>;
  /** 후보에서 이 판정기의 입력을 채운다. 사람이 다시 타이핑하지 않게. */
  inputsFrom(candidate: Candidate): Record<string, string>;
}

/* ────────────────────────────── 생성기 ────────────────────────────── */

/** 생성기가 이 후보를 받을 수 있는가. 못 받으면 이유를 말해야 한다. */
export type Acceptance =
  | { ok: true }
  | { ok: false; reason: string };

export interface Product {
  id: string;
  producerId: string;
  candidateId: string;
  createdAt: string;
  title: string;
  /** 결과물. 생성기마다 모양이 달라 그대로 둔다. 화면은 preview 로 그린다. */
  output: unknown;
  preview?: { kind: 'html' | 'markdown' | 'image' | 'json'; value: string };
}

/**
 * 생성기 어댑터.
 *
 * 지금 Dify 생성기들은 전부 사람이 손으로 붙여넣는 구조다.
 *   카드뉴스        : material — "카드에 넣을 내용을 그대로 붙여넣으세요"
 *   카드뉴스 통합 v2 : 입력 19칸
 * 후보가 이미 들고 있는 값을 사람이 다시 타이핑하는 게 이 파이프라인의 유일한 병목이었다.
 * mapInputs 가 채울 수 있는 걸 다 채우고, extraInputs 로 남은 것만 묻는다.
 */
export interface Producer {
  id: string;
  name: string;
  description: string;
  /** 이 단위의 후보만 받는다. */
  accepts: CandidateUnit[];
  keyEnv?: string;

  /** 판정기와 같은 뜻. 지금 쓰지 않는 이유를 적으면 화면에서 내려간다. */
  held?: string;

  /**
   * 권리 게이팅. 이 앱의 차별점이 여기 있다.
   * "트렌드로 콘텐츠 만들기"는 흔하지만 "만들면 안 되는 걸 막기"는 흔하지 않다.
   */
  gate(candidate: Candidate): Acceptance;

  /** 후보 → 생성기 입력. 재타이핑을 없애는 함수. */
  mapInputs(candidate: Candidate): Record<string, string>;

  /** 후보에서 못 채우는 것만 사람에게 묻는다. */
  extraInputs: InputField[];

  run(
    inputs: Record<string, string>,
    candidate: Candidate,
    ctx: RunContext,
  ): Promise<Omit<Product, 'id' | 'producerId' | 'candidateId' | 'createdAt'>>;
}
