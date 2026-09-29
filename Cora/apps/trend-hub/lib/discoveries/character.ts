import type { Candidate, Evidence, Rights } from '../core/candidate';
import type { Discovery, RunContext } from '../core/adapters';
import { runWorkflow, parseJsonField, num, str } from '../core/dify';
import { key } from '../core/store';

/**
 * 캐릭터 발굴 — 후보를 낳는 판정기.
 *
 * Dify 쪽 judge 노드의 results_json 을 받는다. 키가 한글이라 그대로 받아 여기서만 번역한다.
 * 이 번역표가 이 파일의 존재 이유 전부다 — 나머지 배관은 공통이다.
 */

/** judge.py OWN_LABEL 의 역방향. */
const OWNERSHIP: Record<string, Rights['ownership']> = {
  '기업': 'corporate',
  '개인 추정': 'individual',
  '분쟁·불명': 'disputed',
  '확인필요': 'unknown',
};

/** judge.py 가 내는 prompt_basis 그대로. 생성기 게이팅이 이 값을 본다. */
const BASIS: Record<string, Rights['basis']> = {
  source_grounded: 'source_grounded',
  reference_required: 'reference_required',
  none: 'none',
};

interface JudgeRow {
  name?: string;
  aliases?: string[];
  특징?: string;
  유행이유?: string;
  톤?: string;
  콘텐츠앵글?: string;
  프롬프트근거?: string;
  이미지프롬프트?: string;
  모션프롬프트?: string;
  네거티브?: string;
  사용가능?: string;
  사용주의?: string;
  귀속?: string;
  권리확신?: number;
  확산?: string;
  언급계정?: number;
  플랫폼?: string;
  얇음?: boolean;
  추이?: string;
  증가율?: number | null;
  가중확산?: number | null;
  탐색점수?: number | null;
  회차?: number;
  링크?: string[];
  발견위치?: string;
  계정명일치?: string;
}

export const characterDiscovery: Discovery = {
  id: 'character',
  name: '캐릭터 발굴',
  description:
    '이름을 모르는 상태에서 캐릭터 후보를 발굴하고, 원문 대조로 환각을 거른 뒤 권리 귀속을 판정합니다.',
  role: 'produces',
  unit: 'subject',
  keyEnv: 'DIFY_KEY_CHARACTER',
  held:
    'character-native 가 같은 일을 하고 실제로 도는 쪽입니다. 두 벌을 같은 목록에 두면 ' +
    '어느 쪽이 만든 후보인지 화면에서 구분되지 않습니다.',
  inputs: [
    {
      name: 'track',
      label: '검색어 세트',
      type: 'select',
      required: true,
      default: '전체',
      options: ['전체', '창작', '커머스', '팬아트', '혼합'],
      help: '전체는 기존 IP도 함께 들어와 대조군이 생깁니다.',
    },
    { name: 'seed', label: '추가 검색어 (선택)', type: 'text', help: "'캐릭터'처럼 넓은 말은 넣지 마세요." },
    { name: 'mode', label: '모드', type: 'select', required: true, default: '수집+판정', options: ['수집+판정'] },
    { name: 'min_show', label: '표시 최소 계정 수', type: 'number', default: '1' },
  ],

  async run(input, ctx) {
    if (ctx.mock) return (await import('../../mock/character.json')).default;
    const res = await runWorkflow(this.keyEnv!, input);
    return res.outputs;
  },

  normalize(raw, ctx): Candidate[] {
    const outputs = (raw ?? {}) as Record<string, unknown>;
    const rows = parseJsonField<JudgeRow[]>(outputs.results_json, []);

    return rows
      .filter((r) => str(r.name).trim())
      .map((r): Candidate => {
        const name = str(r.name).trim();
        const platforms = str(r.플랫폼)
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p && p !== '-');

        const evidence: Evidence[] = (r.링크 ?? []).filter(Boolean).map((url) => ({
          source: platforms[0] ?? 'social',
          title: `${name} 언급 게시물`,
          url,
          note: str(r.발견위치) || undefined,
        }));

        return {
          id: `character:${key(name)}`,
          unit: 'subject',
          subject: name,
          aliases: r.aliases ?? [],
          // 이 후보로 무엇을 할 수 있는지가 판정의 결론이다.
          verdict: str(r.사용가능) || '확인필요',
          why: str(r.유행이유),
          // 계정 하나짜리는 근거가 얇다. judge 가 이미 그렇게 표시해 둔다.
          grounded: r.얇음 !== true,
          momentum: {
            accounts: num(r.언급계정),
            platforms,
            growth: num(r.증가율),
            extra: {
              추이: str(r.추이) || null,
              가중확산: num(r.가중확산),
              탐색점수: num(r.탐색점수),
              회차: num(r.회차),
              확산유형: str(r.확산) || null,
              계정명일치: str(r.계정명일치) || null,
            },
          },
          rights: {
            basis: BASIS[str(r.프롬프트근거)] ?? 'none',
            ownership: OWNERSHIP[str(r.귀속)] ?? 'unknown',
            confidence: num(r.권리확신) ?? undefined,
            note: str(r.사용주의) || undefined,
          },
          evidence,
          hint: {
            angle: str(r.콘텐츠앵글) || undefined,
            tone: str(r.톤) || undefined,
            features: str(r.특징) || undefined,
            imagePrompt: str(r.이미지프롬프트) || undefined,
            motionPrompt: str(r.모션프롬프트) || undefined,
            negativePrompt: str(r.네거티브) || undefined,
          },
          review: 'pending',
          lifecycle: 'active',
          origin: { discoveryId: 'character', runId: ctx.runId, runAt: ctx.runAt },
          raw: r,
        };
      });
  },
};
