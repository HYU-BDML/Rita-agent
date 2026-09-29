/**
 * 형상 제작에 물릴 참조 이미지 (지시서 4-3 · 2026-09-17).
 *
 * 왜 필요한가. `referenceLock()` 은 "공식 레퍼런스 이미지를 유일한 출처로 쓰라"고
 * 말하는데 **그 이미지를 첨부하는 경로가 없었다.** 텍스트만 나가면 모델은 없는 참조물을
 * 보고 그리라는 말을 듣고, 결국 자기가 아는 캐릭터를 그리거나 아무거나 그린다.
 * 잠금 문구가 빈말이 되는 것이 저작권 장치로서 가장 나쁜 실패다.
 *
 * 왜 지금 되나. P2 가 게시물 레코드에 썸네일을 적재하기 시작했다. 캡션에는 외형이
 * 없어도(유통 소식뿐이다) 썸네일에는 있다 — 그게 P4-1 에서 확인된 것이다.
 * 캐릭터 후보의 외형 근거는 글이 아니라 그림에 있다.
 *
 * **이 모듈은 아무것도 부르지 않는다.** URL 을 고르기만 한다. 내려받기와 호출은 생성기 몫이다.
 */
import type { Candidate } from './candidate';
import type { PostRecord } from './post-record';

export interface ReferenceImage {
  url: string;
  /** 어느 게시물에서 왔나. 출처를 댈 때와 사람이 확인할 때 쓴다. */
  sourceUrl: string;
  platform: string;
  postedAt: string | null;
}

/** 한 번에 물릴 장수. 늘린다고 좋아지지 않고 토큰만 는다. */
export const MAX_REFERENCES = 4;

/**
 * 후보에 물릴 참조 이미지를 고른다.
 *
 * 고르는 기준이 둘이다.
 * - **플랫폼을 흩는다.** 같은 계정 썸네일 4장은 한 장과 다를 게 없다. 한 플랫폼에서
 *   먼저 한 장씩 돌려 담고, 모자라면 그때 같은 플랫폼에서 더 담는다.
 * - **최신부터.** 캐릭터는 시간이 지나며 디자인이 바뀐다. 옛 그림을 물리면 옛 모습이 나온다.
 *
 * 빈 배열이 나올 수 있다. 그때는 **생성을 하지 않는 것이 맞다** — 잠금 문구만 보내면
 * 모델이 지어낸다. 부르는 쪽에서 판단하라고 여기서는 비워서 돌려준다.
 */
export function referencesFor(
  c: Candidate,
  posts: PostRecord[],
  limit = MAX_REFERENCES,
): ReferenceImage[] {
  const mine = posts
    .filter((p) => p.candidateId === c.id && p.thumbnailUrl)
    /*
     * **캐릭터가 크게 보이는 장을 먼저** (charShot 0·1·2, 2026-09-19).
     * 최신순으로만 고르면 언박싱 첫 프레임의 사람 얼굴이 대표가 된다 — 참조 이미지는
     * 외형을 물리는 자리라 얼굴이 들어가면 엉뚱한 것을 물린다.
     * 안 물어본 장(undefined)은 1로 본다. 0("사람이 주인공")과 섞으면 안 된다.
     */
    .sort(
      (a, b) =>
        (b.charShot ?? 1) - (a.charShot ?? 1) ||
        (b.postedAt ?? '').localeCompare(a.postedAt ?? ''),
    );

  // 플랫폼별 줄을 세워 두고 한 바퀴씩 돌아가며 뽑는다.
  const lanes = new Map<string, PostRecord[]>();
  for (const p of mine) {
    const lane = lanes.get(p.platform);
    if (lane) lane.push(p);
    else lanes.set(p.platform, [p]);
  }

  const out: ReferenceImage[] = [];
  const queues = [...lanes.values()];
  while (out.length < limit && queues.some((q) => q.length)) {
    for (const q of queues) {
      if (out.length >= limit) break;
      const p = q.shift();
      if (!p) continue;
      out.push({
        url: p.thumbnailUrl!,
        sourceUrl: p.url,
        platform: p.platform,
        postedAt: p.postedAt,
      });
    }
  }
  return out;
}

/**
 * 참조 이미지를 물려야 하는 후보인가.
 *
 * `reference_required` 는 "외형을 지어내지 말고 공식 레퍼런스를 물려라"는 판정이다.
 * 그러니 참조 이미지가 없으면 그 판정을 지킬 수 없다.
 */
export function needsReference(c: Candidate): boolean {
  return c.rights.basis === 'reference_required';
}
