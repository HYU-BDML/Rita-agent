import type { AttachingDiscovery, Discovery, Producer } from './adapters';
import { apiKeyFor } from './dify';
import { characterDiscovery } from '../discoveries/character';
import { materialDiscovery } from '../discoveries/material';
import { benchmarkDiscovery } from '../discoveries/benchmark';
import { newsDiscovery } from '../discoveries/news';
import { radarDiscovery } from '../discoveries/radar';
import { benchmarkNativeDiscovery } from '../discoveries/benchmark-native';
import { characterNativeDiscovery } from '../discoveries/character-native';
import { memeNativeDiscovery } from '../discoveries/meme-native';
import { cardnewsProducer } from '../producers/cardnews';
import { cardnewsNativeProducer } from '../producers/cardnews-native';
import { imageProducer, reelsProducer } from '../producers/visual';
import { posterNativeProducer } from '../producers/poster-native';

/**
 * 꽂는 자리. 판정기를 늘리려면 여기 한 줄, 생성기를 늘려도 여기 한 줄이다.
 *
 * 새 판정기 = 칸 3개 채우기
 *   1) 수집원  — 어디서 긁나 (기존 어댑터 재사용 or 새로)
 *   2) 판정축  — 무엇을 근거로 '지금이다'라고 하나
 *   3) 산출 단위 — 후보가 주제인가(topic), 대상인가(subject), 포맷인가(format)
 * 배관·화면·검토·연결은 따라온다.
 */

export const DISCOVERIES: Discovery[] = [
  newsDiscovery,
  radarDiscovery,
  characterNativeDiscovery,
  memeNativeDiscovery,
  benchmarkNativeDiscovery,
  materialDiscovery,
  characterDiscovery,
  benchmarkDiscovery,
];

export const PRODUCERS: Producer[] = [
  cardnewsNativeProducer,
  posterNativeProducer,
  cardnewsProducer,
  imageProducer,
  reelsProducer,
];

/**
 * 지금 실제로 쓸 수 있는 것만 화면에 올린다.
 *
 * 키가 없는 어댑터를 목으로 돌려 같은 표에 올리면, 되는 것과 안 되는 것이 섞여서
 * 화면이 무슨 상태인지 알 수 없게 된다. 실제로 그렇게 됐다.
 *
 * 내려가는 이유는 둘이다. 둘을 구분해서 보여줘야 사람이 할 일이 정해진다.
 *   키 없음(hidden) — 키를 넣으면 바로 열린다. 사람이 할 일이 있다.
 *   보류(held)      — 키를 넣어도 안 열린다. 고쳐야 열린다. 사람이 할 일이 없다.
 */
export function availableDiscoveries(): Discovery[] {
  return DISCOVERIES.filter((d) => !d.held && (!d.keyEnv || apiKeyFor(d.keyEnv)));
}

export function hiddenDiscoveries(): Discovery[] {
  return DISCOVERIES.filter((d) => !d.held && d.keyEnv && !apiKeyFor(d.keyEnv));
}

export function heldDiscoveries(): Discovery[] {
  return DISCOVERIES.filter((d) => Boolean(d.held));
}

export function availableProducers(): Producer[] {
  return PRODUCERS.filter((p) => !p.held && (!p.keyEnv || apiKeyFor(p.keyEnv)));
}

export function hiddenProducers(): Producer[] {
  return PRODUCERS.filter((p) => !p.held && p.keyEnv && !apiKeyFor(p.keyEnv));
}

export function heldProducers(): Producer[] {
  return PRODUCERS.filter((p) => Boolean(p.held));
}

export function getDiscovery(id: string): Discovery | undefined {
  return DISCOVERIES.find((d) => d.id === id);
}

export function getAttaching(id: string): AttachingDiscovery | undefined {
  const d = getDiscovery(id);
  return d && d.role === 'attaches' ? (d as AttachingDiscovery) : undefined;
}

export function getProducer(id: string): Producer | undefined {
  return PRODUCERS.find((p) => p.id === id);
}

/**
 * 키가 없으면 목 모드. 키 없이도 화면 전체가 돈다.
 *
 * 다만 **키를 안 쓰는 어댑터는 목이 아니다.** 여기까지는 모든 어댑터가 Dify 나 외부 API
 * 키를 들고 있어서 '키 없음 = 목'이 성립했는데, 레이더는 이미 판정이 끝난 회차 파일을
 * 읽기만 해서 키가 필요 없다. keyEnv 가 없는 걸 목으로 보면 진짜 판정 결과가 후보 표에
 * '가짜'로 박힌다 — 가짜를 보고 판단하는 것보다 나쁜 건 없다는 게 이 플래그의 취지인데
 * 정확히 그 반대로 작동한다.
 */
export function isMock(keyEnv?: string): boolean {
  if (process.env.TREND_HUB_MOCK === '1') return true;
  if (!keyEnv) return false;
  return !apiKeyFor(keyEnv);
}

export function newRunId(prefix: string): string {
  return `${prefix}-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}`;
}
