import type { Candidate, Reference } from '../core/candidate';
import type { AttachingDiscovery } from '../core/adapters';
import { runWorkflow, parseJsonField, num, str } from '../core/dify';

/**
 * 벤치마크 — 후보를 낳지 않고 기존 후보에 '어떻게 만들까'를 붙이는 판정기.
 *
 * 소재 찾기와 노드 ID 가 그대로 겹친다(node_prep · node_ytsearch · node_ytids ·
 * node_ytvideos · node_ytchids · node_ytchan). 한쪽을 복제해 갈라진 쌍둥이다.
 * 그래서 독립 후보로 세우지 않고 부착기로 둔다.
 *
 * 지금 이 워크플로우를 API 로 부를 때 걸리는 것 두 가지 —
 *
 *  1) human-input 노드가 중간에 있다. blocking 호출이 사람 응답을 기다리다 멈춘다.
 *  2) 쓸모 있는 구조화 값(node_pick 비교 대상 · node_multi 플랫폼 성과)이 밖으로
 *     안 나온다. 최종 출력이 사람이 읽는 텍스트 보고서(report) 하나뿐이다.
 *
 * 둘 다 Dify 쪽에서 작은 수정 하나면 풀린다 — 소재 찾기의 for_next 같은 노드를
 * 하나 붙여 references 를 JSON 으로 내보내고, human-input 앞에서 끝나는 출구를 두면 된다.
 * 그때까지는 텍스트 보고서에서 링크를 건져 붙인다(느슨하지만 사람이 눈으로 검증 가능).
 */

/**
 * 보고서 텍스트에서 유튜브 항목을 건진다. 구조화 출력이 생기면 이 함수는 지운다.
 *
 * 벤치마크는 '잘된 것'과 '안 된 것'을 나란히 놓는다. 링크를 무차별로 긁으면
 * 안 된 쪽까지 '따라 만들 본보기'에 섞여 들어간다 — 정확히 반대를 시키게 된다.
 * 구독 대비 배수가 1 미만이면 따라 할 대상이 아니라고 표시한다.
 */
export function scrapeReferences(report: string): Reference[] {
  const lines = report.split('\n');
  const out: Reference[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/https?:\/\/\S*(?:youtube\.com|youtu\.be)\/\S*/);
    if (!m) continue;
    const url = m[0].replace(/[),.]+$/, '');
    if (out.some((r) => r.url === url)) continue;

    // 링크 줄 위쪽에서 가장 가까운, 링크가 아닌 글줄이 제목 줄이다. 배수도 그 줄에 있다.
    let titleLine = '';
    for (let j = i; j >= Math.max(0, i - 3); j -= 1) {
      const t = lines[j].replace(/https?:\/\/\S+/g, '').replace(/^[\s·+\-*[\]]+/, '').trim();
      if (t.length >= 4) {
        titleLine = t;
        break;
      }
    }

    const rm = titleLine.match(/([\d.]+)\s*배/);
    const subRatio = rm ? Number(rm[1]) : null;
    const title = titleLine.replace(/\s*\(구독대비[^)]*\)\s*$/, '').trim();

    out.push({
      title: title || url,
      url,
      subRatio,
      // 안 된 쪽을 본보기로 내놓지 않는다.
      takeaway: subRatio != null && subRatio < 1 ? '안 된 쪽 — 따라 할 대상이 아님' : undefined,
    });
  }
  return out.slice(0, 8);
}

interface StructuredRef {
  제목?: string;
  채널?: string;
  링크?: string;
  구독?: number | null;
  조회?: number | null;
  구독대비배수?: number | null;
  길이초?: number | null;
  무엇이달랐나?: string;
}

export const benchmarkDiscovery: AttachingDiscovery = {
  id: 'benchmark',
  name: '벤치마크',
  description:
    '같은 채널 규모끼리 맞대어 잘된 것과 안 된 것이 무엇이 달랐는지 보고, 따라 만들 본보기를 후보에 붙입니다.',
  role: 'attaches',
  unit: 'format',
  keyEnv: 'DIFY_KEY_BENCHMARK',
  held:
    'human-input 노드가 중간에 있어 blocking 호출이 거기서 멈춥니다. 응답이 오지 않습니다. ' +
    'benchmark-native 를 쓰세요.',
  inputs: [
    { name: 'topics', label: '주제', type: 'text', required: true },
    {
      name: 'user_type',
      label: '어떤 분이세요?',
      type: 'select',
      default: '자기 채널',
      options: ['자기 채널', '의뢰 받아 만듦', '기업·브랜드'],
    },
    {
      name: 'topic_en',
      label: '인스타그램용 영어 검색어',
      type: 'text',
      help: '비워 두면 인스타는 건너뜁니다.',
    },
  ],

  /** 후보가 이미 들고 있는 값으로 입력을 채운다. 사람이 주제를 다시 타이핑하지 않는다. */
  inputsFrom(candidate) {
    return { topics: candidate.subject, user_type: '자기 채널', topic_en: '' };
  },

  async run(input, ctx) {
    if (ctx.mock) return (await import('../../mock/benchmark.json')).default;
    const res = await runWorkflow(this.keyEnv!, input);
    return res.outputs;
  },

  normalize(): Candidate[] {
    // 부착기는 후보를 낳지 않는다.
    return [];
  },

  attach(_candidate, raw) {
    const outputs = (raw ?? {}) as Record<string, unknown>;

    // Dify 쪽에 구조화 출력을 붙였다면 그걸 먼저 쓴다.
    const structured = parseJsonField<StructuredRef[]>(outputs.references ?? outputs.본보기, []);
    if (structured.length) {
      return {
        references: structured
          .filter((r) => r.링크)
          .map((r) => ({
            title: str(r.제목),
            channel: str(r.채널) || undefined,
            url: str(r.링크),
            subs: num(r.구독),
            views: num(r.조회),
            subRatio: num(r.구독대비배수),
            durationSec: num(r.길이초),
            takeaway: str(r.무엇이달랐나) || undefined,
          })),
      };
    }

    // 아직이면 텍스트 보고서에서 건진다.
    const report = str(outputs.결과 ?? outputs.report);
    return { references: scrapeReferences(report) };
  },
};
