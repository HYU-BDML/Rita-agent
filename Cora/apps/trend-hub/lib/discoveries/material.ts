import type { Candidate, Evidence, Reference } from '../core/candidate';
import type { Discovery, RunContext } from '../core/adapters';
import { runWorkflow, parseJsonField, num, str } from '../core/dify';
import { key } from '../core/store';

/**
 * 소재 찾기 — 후보를 낳는 판정기.
 *
 * Dify 쪽 for_next 노드가 이미 다리를 만들어 두었다. 그 주석이 설계 원칙을 그대로 말한다.
 *   "카드뉴스를 만들려면 '무슨 주제로, 왜, 무엇을 근거로'가 필요하다.
 *    글에서 파내게 하지 말고 여기서 갈라 준다."
 * 여기서는 그 값을 공통 후보로 옮기기만 한다.
 *
 * 알아 둘 것 — for_next 는 근거_링크와 따라만들_본보기를 '고른_주제' 하나에만 붙인다.
 * 나머지 주제는 판정만 있고 근거가 없다. 그래서 grounded 가 갈린다.
 * (여기를 고치려면 Dify 쪽 for_next 를 손봐야 한다. 지금은 있는 그대로 받는다.)
 */

interface Row {
  주제?: string;
  판정?: string;
  최근_대_평소?: number | null;
  작년_대비?: number | null;
  다룬_매체수?: number | null;
}

interface Sample {
  갈래?: string;
  출처?: string;
  제목?: string;
  링크?: string;
  '왜 쓸모있나'?: string;
  숫자?: string;
}

interface Model {
  제목?: string;
  채널?: string;
  구독?: number | null;
  조회?: number | null;
  구독대비배수?: number | null;
  길이초?: number | null;
  링크?: string;
}

interface ForNext {
  고른_주제?: string;
  판정?: string;
  한_줄_까닭?: string;
  주제별_판정?: Row[];
  근거_링크?: Sample[];
  따라만들_본보기?: Model[];
}

export const materialDiscovery: Discovery = {
  id: 'material',
  name: '소재 찾기',
  description:
    '뉴스·공적 채널·검색추이를 훑어 지금 들어가도 되는 주제인지 판정하고, 받아 갈 소재를 뽑습니다.',
  role: 'produces',
  unit: 'topic',
  keyEnv: 'DIFY_KEY_MATERIAL',
  held:
    "news 판정기가 같은 일을 하고 실제로 도는 쪽입니다. 이쪽은 for_next 가 근거 링크를 '고른_주제' 하나에만 " +
    '붙여 나머지 주제가 근거 없이 넘어옵니다. Dify 쪽을 고치면 다시 올립니다.',
  inputs: [
    {
      name: 'topics',
      label: '무엇을 만들지 짧게 적으세요 (최대 5개)',
      type: 'text',
      required: true,
      help: '쉼표로 구분합니다.',
    },
    {
      name: 'user_type',
      label: '어떤 분이세요?',
      type: 'select',
      default: '자기 채널',
      options: ['자기 채널', '의뢰 받아 만듦', '기업·브랜드'],
      help: '결과 순서가 달라집니다.',
    },
    {
      name: 'expand',
      label: '검색어를 넓혀서 찾을까요?',
      type: 'select',
      default: '아니오',
      options: ['아니오', '예'],
    },
  ],

  async run(input, ctx) {
    if (ctx.mock) return (await import('../../mock/material.json')).default;
    const res = await runWorkflow(this.keyEnv!, input);
    return res.outputs;
  },

  normalize(raw, ctx): Candidate[] {
    const outputs = (raw ?? {}) as Record<string, unknown>;
    // for_next 는 { data: "<json 문자열>" } 로 준다.
    const data = parseJsonField<ForNext>(outputs.data ?? outputs, {});

    const evidence: Evidence[] = (data.근거_링크 ?? [])
      .filter((s) => s.링크)
      .map((s) => ({
        source: str(s.출처) || str(s.갈래) || '출처미상',
        title: str(s.제목),
        url: str(s.링크),
        note: str(s['왜 쓸모있나']) || undefined,
        metric: str(s.숫자) || undefined,
      }));

    const references: Reference[] = (data.따라만들_본보기 ?? [])
      .filter((m) => m.링크)
      .map((m) => ({
        title: str(m.제목),
        channel: str(m.채널) || undefined,
        url: str(m.링크),
        subs: num(m.구독),
        views: num(m.조회),
        subRatio: num(m.구독대비배수),
        durationSec: num(m.길이초),
      }));

    const chosen = str(data.고른_주제).trim();
    const rows = data.주제별_판정 ?? [];
    // 주제별_판정이 비면 고른_주제 하나라도 후보로 세운다.
    const list: Row[] = rows.length
      ? rows
      : chosen
        ? [{ 주제: chosen, 판정: str(data.판정) }]
        : [];

    return list
      .filter((r) => str(r.주제).trim())
      .map((r): Candidate => {
        const topic = str(r.주제).trim();
        const isChosen = key(topic) === key(chosen);
        return {
          id: `material:${key(topic)}`,
          unit: 'topic',
          subject: topic,
          verdict: str(r.판정) || '판정 불가',
          // 까닭과 근거는 고른 주제에만 붙어 온다.
          why: isChosen ? str(data.한_줄_까닭) : '',
          grounded: isChosen && evidence.length > 0,
          momentum: {
            surge: num(r.최근_대_평소),
            yoy: num(r.작년_대비),
            mediaCount: num(r.다룬_매체수),
          },
          // 주제 후보는 IP 권리 판정 대상이 아니다. 출처 신뢰도로 대신 본다.
          rights: {
            basis: 'not_applicable',
            note: isChosen ? undefined : '근거 링크가 이 주제에는 붙어 오지 않았습니다.',
          },
          evidence: isChosen ? evidence : [],
          hint: {
            // 소재 찾기는 '콘텐츠 각도'를 만들지 않는다. 한_줄_까닭은 why 에 이미 있다.
            // 여기 복사하면 생성기로 가는 원고에 같은 문장이 두 번 찍힌다.
            references: isChosen ? references : undefined,
          },
          review: 'pending',
          lifecycle: 'active',
          origin: { discoveryId: 'material', runId: ctx.runId, runAt: ctx.runAt },
          raw: r,
        };
      });
  },
};
