import { NextResponse } from 'next/server';
import { collectionSchedule, setCollectionSchedule } from '@/lib/core/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await collectionSchedule());
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Awaited<ReturnType<typeof collectionSchedule>>>;
  const current = await collectionSchedule();
  const newsDays = Array.isArray(body.newsDays)
    ? body.newsDays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : current.newsDays;
  const days = (value: unknown, fallback: number[]) => Array.isArray(value)
    ? value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : fallback;
  const socialDays = Array.isArray(body.socialDays)
    ? body.socialDays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : current.socialDays;
  const validTime = (value: unknown, fallback: string) =>
    typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;

  /* 돈이 걸린 값이라 주소로 들어온 것을 그대로 믿지 않는다. 0 은 '잠근다'로 받는다. */
  const MAX_ALLOWED = 50;
  const count = (value: unknown, fallback: number | undefined) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > MAX_ALLOWED) return fallback;
    return n;
  };
  /*
   * limits 를 주면 **통째로 갈아 끼운다.** 병합하면 화면에서 칸을 비워도 안 지워진다 —
   * 지웠다고 보이는데 저장값은 그대로라 다음에 열면 숫자가 되살아난다.
   * 아예 안 주면(다른 화면이 일정만 저장하는 경우) 있던 것을 지키지 않고 건드리지 않는다.
   */
  let limits = current.limits;
  if (body.limits && typeof body.limits === 'object') {
    limits = {};
    for (const [id, value] of Object.entries(body.limits)) {
      const n = count(value, undefined);
      if (n !== undefined) limits[id] = n;
    }
  }

  await setCollectionSchedule({
    enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
    newsDays: newsDays.length ? [...new Set(newsDays)] : current.newsDays,
    newsTime: validTime(body.newsTime, current.newsTime),
    socialDays: socialDays.length ? [...new Set(socialDays)] : current.socialDays,
    socialTime: validTime(body.socialTime, current.socialTime),
    characterDays: days(body.characterDays, current.characterDays),
    characterTime: validTime(body.characterTime, current.characterTime),
    memeDays: days(body.memeDays, current.memeDays),
    memeTime: validTime(body.memeTime, current.memeTime),
    limits,
    /* 소재 기한. 0 은 '기한을 안 본다'는 뜻이라 살려 둔다 (lib/core/retire.ts). */
    retire: body.retire && typeof body.retire === 'object'
      ? {
          maxAgeDays: Object.fromEntries(
            Object.entries(body.retire.maxAgeDays ?? {})
              .map(([id, v]) => [id, count(v, undefined)])
              .filter((e): e is [string, number] => typeof e[1] === 'number'),
          ),
          maxMissDays: count(body.retire.maxMissDays, undefined),
        }
      : current.retire,
    /*
     * null 이 '지운다'다. undefined 는 JSON 에서 칸째 빠지므로 '안 보냈다'와 구분이 안 된다 —
     * 화면에서 칸을 비워도 저장값이 그대로 남아 다음에 열면 숫자가 되살아난다.
     */
    totalLimit: body.totalLimit === null ? undefined : count(body.totalLimit, current.totalLimit),
  });
  return NextResponse.json(await collectionSchedule());
}