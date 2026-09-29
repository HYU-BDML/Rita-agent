import type { Candidate } from './candidate';

/**
 * 교차 확인 표시 (뉴스 축의 `min_sources: 2` 를 캐릭터 축에 옮긴 것).
 *
 * **거르지 않고 적기만 한다.** 문턱으로 걸면 캐릭터 후보 27건 중 5건만 남아 화면이 빈다.
 * 권리 판정을 차단에서 라벨로 내린 것과 같은 방식이다 — 사람이 보고 판단할 수 있게
 * 무엇이 얇은지 적어 두고, 내리는 건 사람이 한다.
 *
 * 왜 필요한가. 뉴스 소재는 처음부터 매체 2곳을 요구했고 테스트가 그걸 지킨다. 캐릭터만
 * 그 검사를 건너뛰고 있었다. 실제로 그래서 생긴 일이 있다 — 로빈은 게임사 공식 계정이
 * 자기 신규 픽업을 홍보한 글 **하나**인데 조회 182만이라 목록 위쪽에 앉았다.
 * 숫자가 큰 것과 여러 곳에서 뜨는 것은 다른 말이다.
 */
export type CrossCheck = 'multi' | 'brand' | 'single';

export interface CrossCheckLabel {
  level: CrossCheck;
  label: string;
  /** 왜 그렇게 붙었나. 배지만으로는 안 읽힌다. */
  detail: string;
}

/**
 * **"브랜드 계정 1곳"이지 "공식 계정"이 아니다.** `ownership: corporate` 는 권리가 기업에
 * 있다는 뜻이지 그 계정이 권리자라는 뜻이 아니다. 실제로 리락쿠마는 소품샵, 몬치치는
 * 카페 계정이다. 권리자 본인인 것은 로빈(붕괴: 스타레일)뿐이다. "공식"이라고 적으면
 * 그 자체가 틀린 말이 된다.
 *
 * `momentum.extra.계정명일치` 는 쓰지 않는다. 컬러스틱맨은 계정 이름이 그대로
 * "컬러스틱맨"인데 `아니오` 로 적혀 있다 — 판정기가 잘못 채우고 있어 믿을 수 없다.
 */
export function crossCheckOf(c: Candidate): CrossCheckLabel {
  const n = c.momentum.accounts ?? 0;
  if (n >= 2) {
    return { level: 'multi', label: '2곳 이상', detail: `서로 다른 계정 ${n}곳에서 나왔습니다` };
  }
  if (c.rights.ownership === 'corporate') {
    return {
      level: 'brand',
      label: '브랜드 계정 1곳',
      detail: '기업·판매점 계정 한 곳이 알린 것입니다. 교차 확인이 없습니다',
    };
  }
  return { level: 'single', label: '단일 출처', detail: '계정 한 곳에서만 나왔습니다' };
}
