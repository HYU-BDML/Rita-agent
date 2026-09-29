import { listCandidates, listPosts, listRuns } from '@/lib/core/store';
import { axisOf } from '@/lib/core/axis';
import { grammarsWithEvidence } from '@/lib/core/grammar';
import { KIND_LABEL } from '@/components/grammar-style';
import { PickedList, type PickedGrammar, type PickedTopic } from '@/components/picked-list';

export const dynamic = 'force-dynamic';

/**
 * 담은 것 — **브라우저에 담은 방식과 소재.**
 *
 * 전에는 이 화면이 서버의 `lifecycle: 'archived'` 를 보여줬다. 그건 배포본에서 A 가
 * 보관하면 B 화면에도 뜨고, Render 무료 플랜은 디스크를 못 붙여 재배포하면 말없이
 * 비워진다. 개인이 골라 둔 것이 남의 화면에 뜨는 것도, 말없이 사라지는 것도 나쁘다.
 *
 * 서버 추적(`archived`)을 없애지 않았다 — 수집이 매일 새 기사를 붙일 대상을 서버가
 * 알아야 하므로 기능은 그대로 있고, 운영자 자리로 내렸다. **두 축이 따로 산다.**
 *
 * **담은 목록은 서버가 모른다.** 그래서 방식 12개와 소재 전체의 얇은 요약을 내려보내고
 * 거르는 일은 화면이 한다(`components/picked-list.tsx`). 담은 id 를 서버에 물으면 그
 * 목록이 서버 로그에 남아, 브라우저에 두기로 한 이유가 사라진다.
 */
const AXIS: Record<string, string> = {
  issue: '뉴스·사건',
  character: '캐릭터·굿즈',
  meme: '유행 포맷',
};

/** `docs/WORDS.md` §13 의 권리 라벨. 사용 범위 3단과 다른 축이라 섞지 않는다. */
const RIGHTS: Record<string, string> = {
  individual: '개인 창작',
  corporate: '기업 IP',
  disputed: '권리 분쟁',
};

export default async function LibraryPage() {
  const [cands, posts, runs] = await Promise.all([listCandidates(), listPosts(), listRuns()]);
  const asOf = runs[0]?.at ?? new Date().toISOString();

  const grammars: PickedGrammar[] = grammarsWithEvidence(cands, posts, asOf).map((g) => ({
    id: g.id,
    name: g.name,
    kind: KIND_LABEL[g.kind],
    desc: g.desc,
    sources: g.evidence.length,
    freshness: g.freshness,
  }));

  /*
   * 내려간 소재(`retired`)도 넣는다. 담아 둔 것이 목록에서 내려갔다고 담은 것에서
   * 사라지면, 사람은 자기가 담은 것을 잃은 것으로 읽는다.
   */
  const topics: PickedTopic[] = cands.map((c) => ({
    id: c.id,
    subject: c.subject,
    axis: AXIS[axisOf(c)] ?? '뉴스·사건',
    blurb: ((c.summary ?? '').trim() || (c.why ?? '').trim()).slice(0, 160),
    ...(c.rights.ownership && RIGHTS[c.rights.ownership]
      ? { rights: RIGHTS[c.rights.ownership] }
      : {}),
  }));

  return (
    <div className="space-y-5">
      {/* 상단바의 낱말과 글자까지 같다 (`docs/WORDS.md` §13-1). */}
      <h1 className="text-xl font-semibold tracking-tight">담은 것</h1>
      <PickedList grammars={grammars} topics={topics} />
    </div>
  );
}
