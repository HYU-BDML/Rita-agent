import type { Producer } from '../core/adapters';
import type { Candidate } from '../core/candidate';
import { runWorkflow, str } from '../core/dify';
import { REFERENCE_CAUTION, referenceLock, visualGate } from './shared';

/** reference_required 후보면 잠금 문구를 앞에 물린다. 선택이 아니라 강제다. */
function lockedPrompt(c: Candidate, base: string | undefined): string {
  const body = (base ?? '').trim();
  if (c.rights.basis === 'reference_required') {
    return [referenceLock(c.subject), body].filter(Boolean).join('\n\n');
  }
  return body;
}

export const imageProducer: Producer = {
  id: 'image',
  name: '이미지 · 포스터 · 썸네일',
  description: '후보의 이미지 프롬프트로 정지 이미지를 만듭니다. 권리 판정에 따라 프롬프트가 잠깁니다.',
  accepts: ['subject'],
  keyEnv: 'DIFY_KEY_IMAGE',
  // 2026-09-15 세워 둔 것을 내린다. 사유가 사실과 달라졌다 —
  // hint.imagePrompt 를 채우는 경로가 둘 생겼다(캐릭터 발굴 rights.ts, 레이더 profile).
  // 이제 막는 것은 키(DIFY_KEY_IMAGE)와 게이트뿐이고, 둘 다 정직한 이유다.

  gate(c) {
    const g = visualGate(c);
    if (!g.ok) return g;
    if (!c.hint.imagePrompt && c.rights.basis !== 'reference_required') {
      return { ok: false, reason: '이미지 프롬프트가 비어 있습니다. 시각 근거가 확인된 후보가 아닙니다.' };
    }
    return { ok: true };
  },

  mapInputs(c) {
    return {
      prompt: lockedPrompt(c, c.hint.imagePrompt),
      negative_prompt: c.hint.negativePrompt ?? '',
      subject: c.subject,
      caution: c.rights.basis === 'reference_required' ? REFERENCE_CAUTION : '',
    };
  },

  extraInputs: [
    { name: 'ratio', label: '비율', type: 'select', default: '9:16', options: ['9:16', '1:1', '16:9', '4:5'] },
    { name: 'count', label: '장수', type: 'select', default: '1', options: ['1', '2', '4'] },
  ],

  async run(inputs, c, ctx) {
    if (ctx.mock) {
      return {
        title: `이미지 — ${c.subject}`,
        output: inputs,
        preview: { kind: 'json' as const, value: JSON.stringify(inputs, null, 2) },
      };
    }
    const res = await runWorkflow(this.keyEnv!, inputs);
    return {
      title: `이미지 — ${c.subject}`,
      output: res.outputs,
      preview: { kind: 'json' as const, value: JSON.stringify(res.outputs, null, 2) },
    };
  },
};

export const reelsProducer: Producer = {
  id: 'reels',
  name: '릴스 · 모션',
  description: '후보의 모션 프롬프트로 짧은 영상을 만듭니다. 권리 판정에 따라 프롬프트가 잠깁니다.',
  accepts: ['subject'],
  keyEnv: 'DIFY_KEY_REELS',
  // motionPrompt 경로는 생겼지만(레이더 profile) **영상 생성기 자체가 없다.**
  // 키를 넣어도 부를 워크플로우가 없으므로 세워 둔 채로 둔다 — 키 없음과 다른 칸이다.
  held:
    '모션 프롬프트는 이제 채워지지만, 워크플로우 어디에도 영상 생성기가 붙어 있지 않습니다. ' +
    '부를 대상이 없어 키를 넣어도 열리지 않습니다.',

  gate(c) {
    const g = visualGate(c);
    if (!g.ok) return g;
    if (!c.hint.motionPrompt && c.rights.basis !== 'reference_required') {
      return { ok: false, reason: '모션 프롬프트가 비어 있습니다. 시각 근거가 확인된 후보가 아닙니다.' };
    }
    return { ok: true };
  },

  mapInputs(c) {
    return {
      prompt: lockedPrompt(c, c.hint.motionPrompt),
      negative_prompt: c.hint.negativePrompt ?? '',
      subject: c.subject,
      angle: c.hint.angle ?? '',
      caution: c.rights.basis === 'reference_required' ? REFERENCE_CAUTION : '',
    };
  },

  extraInputs: [
    { name: 'seconds', label: '길이(초)', type: 'select', default: '5', options: ['3', '5', '8'] },
  ],

  async run(inputs, c, ctx) {
    if (ctx.mock) {
      return {
        title: `릴스 — ${c.subject}`,
        output: inputs,
        preview: { kind: 'json' as const, value: JSON.stringify(inputs, null, 2) },
      };
    }
    const res = await runWorkflow(this.keyEnv!, inputs);
    return {
      title: `릴스 — ${c.subject}`,
      output: res.outputs,
      preview: { kind: 'json' as const, value: JSON.stringify(res.outputs, null, 2) },
    };
  },
};
