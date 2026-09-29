import type { Candidate } from '../core/candidate';
import type { Acceptance } from '../core/adapters';

/**
 * 후보를 '무슨 주제로, 왜, 무엇을 근거로' 형태의 원고로 편다.
 *
 * 지금 Dify 생성기들은 전부 이 덩어리를 사람이 손으로 붙여넣게 되어 있다.
 *   카드뉴스: material — "카드에 넣을 내용을 그대로 붙여넣으세요"
 * 후보가 이미 들고 있는 값이므로 사람이 다시 칠 이유가 없다.
 */
export function brief(c: Candidate): string {
  const L: string[] = [];
  L.push(`# ${c.subject}`);
  L.push(`판정: ${c.verdict}`);
  if (c.why) L.push(`왜: ${c.why}`);
  if (!c.grounded) L.push('주의: 확산 원인을 단정할 독립 근거가 부족합니다.');
  // why 와 같은 문장이면 각도로 다시 찍지 않는다.
  if (c.hint.angle && c.hint.angle !== c.why) L.push(`콘텐츠 각도: ${c.hint.angle}`);
  if (c.hint.tone) L.push(`톤: ${c.hint.tone}`);
  if (c.hint.features) L.push(`확인된 특징: ${c.hint.features}`);

  const m = c.momentum;
  const nums: string[] = [];
  if (m.surge != null) nums.push(`최근/평소 ${m.surge}`);
  if (m.yoy != null) nums.push(`작년 대비 ${m.yoy}`);
  if (m.mediaCount != null) nums.push(`다룬 매체 ${m.mediaCount}곳`);
  if (m.accounts != null) nums.push(`언급 계정 ${m.accounts}`);
  if (m.platforms?.length) nums.push(`플랫폼 ${m.platforms.join('·')}`);
  if (m.growth != null) nums.push(`증가율 ${m.growth}`);
  if (nums.length) L.push(`지표: ${nums.join(' · ')}`);

  if (c.evidence.length) {
    L.push('');
    L.push('## 근거');
    for (const e of c.evidence) {
      L.push(`- [${e.source}] ${e.title}`);
      // 본문이 있으면 제목 바로 밑에 싣는다. 이게 없으면 헤드라인만 보고 쓰게 된다.
      if (e.excerpt) L.push(`  ${e.excerpt}`);
      L.push(`  ${e.url}`);
      if (e.note) L.push(`  → ${e.note}`);
    }
  }

  if (c.hint.references?.length) {
    L.push('');
    L.push('## 따라 만들 본보기');
    for (const r of c.hint.references) {
      const bits = [r.channel, r.subRatio != null ? `구독대비 ${r.subRatio}배` : null]
        .filter(Boolean)
        .join(' · ');
      L.push(`- ${r.title}${bits ? ` (${bits})` : ''}`);
      L.push(`  ${r.url}`);
      if (r.takeaway) L.push(`  → ${r.takeaway}`);
    }
  }
  return L.join('\n');
}

/**
 * 형상(외형)을 만드는 생성기의 공통 게이트.
 *
 * 이 앱의 차별점이 여기다. "트렌드로 콘텐츠 만들기"는 흔하지만
 * "만들면 안 되는 걸 막기"는 흔하지 않다.
 * 캐릭터 발굴 judge 가 이미 판정해 둔 prompt_basis 를 그대로 집행한다.
 */
/**
 * 안전 게이트 (밈 축). **`blocked` 만 막는다.**
 *
 * `flagged` 는 통과시킨다 — 그건 "사람이 한 번 보라"는 표시지 금지가 아니다.
 * 애매한 것을 막기 시작하면 블랙 코미디·자조가 전부 사라진다.
 */
export function safetyGate(c: Candidate): Acceptance {
  if (c.safety?.level !== 'blocked') return { ok: true };
  return {
    ok: false,
    reason:
      `안전 판정에서 막힌 후보입니다 — ${c.safety.reason || '위험한 유행'}. ` +
      (c.safety.evidence ? `근거: "${c.safety.evidence}"` : '') +
      ' 오판으로 보이면 판정 근거를 보고 사람이 풀 수 있습니다.',
  };
}

export function visualGate(c: Candidate): Acceptance {
  switch (c.rights.basis) {
    case 'source_grounded':
      return { ok: true };
    case 'reference_required':
      // 막지는 않는다. 대신 레퍼런스 잠금 프롬프트가 강제로 붙는다(각 생성기에서).
      return { ok: true };
    case 'none':
      return {
        ok: false,
        reason:
          c.rights.note ||
          '권리 또는 시각 근거가 부족해 형상 제작이 보류된 후보입니다. 기획까지만 가능합니다.',
      };
    case 'not_applicable':
      return {
        ok: false,
        reason: '주제 후보에는 형상 제작 대상이 없습니다. 캐릭터 후보에서 실행하세요.',
      };
  }
}

/**
 * reference_required 후보에 씌우는 잠금 문구. judge.py 의 reference_locked_prompts 와 같은 취지.
 *
 * 이름을 문자열 치환으로 끼우다 이름이 통째로 빠진 적이 있다(테스트가 잡았다).
 * 그래서 인자로 받는다 — 빠뜨릴 수 없게.
 */
export function referenceLock(subject: string): string {
  return (
    `Use the officially supplied reference image of ${subject} as the sole source of visual identity. ` +
    "Preserve the character's silhouette, colors, facial features, outfit, proportions, and brand details exactly as shown. " +
    'Do not invent, redesign, simplify, or add any visual attributes not present in the supplied reference.'
  );
}

export const REFERENCE_CAUTION =
  '기획·협상 검토용입니다. 실행·배포 전 권리자 확인과 라이선스가 필요합니다.';
