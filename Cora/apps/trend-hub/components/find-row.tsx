import { FindButton } from '@/components/find-button';
import type { InputField } from '@/lib/core/adapters';
import type { RunQuota } from '@/lib/core/run-limit';

export interface FindSpec {
  id: string;
  name: string;
  inputs: InputField[];
}

/**
 * 쓸 수 있는 판정기를 **하나도 빠짐없이** 늘어놓는다.
 *
 * 전에는 FindButton 이 목록을 받아 첫 번째만 그렸다. '오늘의 소재'에는 뉴스와 레이더가
 * 함께 있는데 뉴스만 났고, 레이더는 화면에서 돌릴 길이 없었다.
 *
 * 줄로 뺀 이유는 홈에도 같은 것이 필요해서다. 축을 고르면 그 축의 판정기만 나오고,
 * 전체면 넷이 다 나온다 — '각 카테고리별로 따로 발굴'이 그 뜻이다.
 */
export function FindRow({
  specs,
  quotas,
  big = false,
  empty = '쓸 수 있는 판정기가 없습니다. 설정에서 키를 넣어 주세요.',
}: {
  specs: FindSpec[];
  quotas: Map<string, RunQuota>;
  big?: boolean;
  empty?: string;
}) {
  if (!specs.length) {
    return (
      <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
        {empty}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-start gap-3">
      {specs.map((s) => (
        <FindButton key={s.id} spec={s} big={big} quota={quotas.get(s.id)} />
      ))}
    </div>
  );
}
