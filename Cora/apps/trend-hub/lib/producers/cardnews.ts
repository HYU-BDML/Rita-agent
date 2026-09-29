import type { Producer } from '../core/adapters';
import { runWorkflow, str } from '../core/dify';
import { brief } from './shared';

/**
 * 카드뉴스 생성기.
 *
 * Dify 카드뉴스 앱은 잘 돌고 있으니 재구현하지 않고 그대로 부른다.
 * 여기가 하는 일은 후보 → 입력 매핑 하나뿐이다.
 * (통합 v2 는 입력이 19칸이다. 그중 후보가 채울 수 있는 것을 다 채우고 남은 것만 묻는다.)
 */
export const cardnewsProducer: Producer = {
  id: 'cardnews',
  name: '카드뉴스',
  description: '후보의 판정·까닭·근거를 그대로 원고로 넘겨 카드뉴스를 만듭니다.',
  accepts: ['topic', 'subject'],
  keyEnv: 'DIFY_KEY_CARDNEWS',
  // 세워 뒀던 이유(RENDER_BASE 응답 없음)가 사라졌다 — 렌더 서버가 주소를 바꿔 살아 돌아왔다.
  // 이 워크플로우 안에 렌더 서버로 보내는 HTTP 노드가 들어 있으므로, 돌려 보면
  // 우리가 못 찾고 있는 카드뉴스 굽기 경로와 본문 형식이 드러난다. 실패해도 오류에 찍힌다.

  gate(c) {
    if (!c.evidence.length && !c.hint.angle) {
      return { ok: false, reason: '근거 링크도 콘텐츠 각도도 없어 넘길 원고가 만들어지지 않습니다.' };
    }
    return { ok: true };
  },

  mapInputs(c) {
    return {
      // 사람이 붙여넣던 자리. 후보가 채운다.
      material: brief(c),
      kind: c.unit === 'topic' ? '사례형' : '글자중심형',
    };
  },

  // 후보가 알 수 없는 것만 묻는다.
  extraInputs: [
    { name: 'style_id', label: '어느 계정의 디자인으로 만들까요', type: 'text', help: '겉모습 뜨기로 등록한 이름' },
    { name: 'slides', label: '카드 장수', type: 'select', default: '6', options: ['4', '5', '6', '7', '8'] },
    { name: 'reader', label: '누가 읽나요 (사례형일 때)', type: 'text' },
  ],

  async run(inputs, c, ctx) {
    if (ctx.mock) {
      return {
        title: `카드뉴스 — ${c.subject}`,
        output: inputs,
        preview: { kind: 'markdown' as const, value: str(inputs.material) },
      };
    }
    const res = await runWorkflow(this.keyEnv!, inputs);
    return {
      title: `카드뉴스 — ${c.subject}`,
      output: res.outputs,
      preview: {
        kind: 'markdown' as const,
        value: str(res.outputs.result ?? res.outputs.결과 ?? JSON.stringify(res.outputs, null, 2)),
      },
    };
  },
};
