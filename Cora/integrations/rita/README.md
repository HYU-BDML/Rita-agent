# Rita 에이전트 공통 계약 (E210)

Cora 기능을 Rita 에이전트가 같은 형식으로 주고받기 위한 작업 봉투(task envelope)입니다. 현재 Cora 코드에는 이 봉투를 만들어 내보내는 곳이 없습니다. 이 폴더는 형식과 검증기만 제공하며, 봉투를 채우는 어댑터는 아직 없습니다.

## 파일

| 파일 | 내용 |
|---|---|
| `contract.schema.json` | JSON Schema(2020-12). 항목: 작업 번호, 에이전트, 입력, 출력, 상태, 비용, 출처 기록(provenance), 사람 승인 |
| `apps/trend-hub/lib/cora/platform/rita-contract.ts` | 같은 규칙을 손으로 옮긴 검증기 `validateTaskEnvelope`. 스키마에 없는 항목과 교차 규칙 8개를 검사 |
| `MCP.md` | 로컬 MCP 서버 연결 방법 |

## 교차 규칙

스키마만으로는 표현하기 어려운 규칙은 `x-crossFieldRules` 에 적었고 검증기가 검사합니다. 예를 들어 `publish-sim` 작업은 실제 게시가 아니므로 `provenance.origin` 이 `simulated` 이고 사람 승인이 필요해야 하며, 승인이 필요한 작업은 `approved` 전에 `succeeded` 가 될 수 없습니다.

## Cora 기능과 Rita 에이전트의 대응

아래 표의 "현재 코드"는 이 저장소에 있는 것만 적었습니다. Rita 쪽 에이전트 구현은 이 저장소에서 확인하지 않았으므로 대응은 제안입니다.

| 계약의 agent | Cora에서 해당하는 곳 | 현재 코드에서 확인된 것 | 없는 것 |
|---|---|---|---|
| `card` | `POST /api/cora/generate`, 카드 편집(`/api/cora/projects`) | 카드뉴스 초안 생성과 저장, 버전 충돌 보호 | 봉투 출력 |
| `blog` | `POST /api/cora/workbench` (`generate` 의 `blog`, `outline`, `write-from-outline`) | 블로그 글 생성, 개요 승인 후 본문 작성 | 봉투 출력 |
| `script` | `POST /api/cora/workbench` (`generate` 의 `script`), `platform-script` | 대본 생성, 완성 대본을 문구 수정 없이 카드로 가져오기 | 봉투 출력 |
| `video` | `POST /api/cora/video` | 카드뉴스에서 영상 렌더링 | 봉투 출력 |
| `publish-sim` | `/api/cora/publications`, `/api/cora/publications/simulation` | 게시 준비 작업과 시뮬레이션. 실제 계정 게시는 하지 않음 | 실제 게시 |
| `diagnose` | `POST /api/cora/workbench` (`analyze`, `experiment`) | CSV 진단과 콘텐츠 실험안 | 봉투 출력 |

비용은 `billing_ledger` 의 `LedgerEntry.id` 를 `cost.ledgerEntryId` 에, 출처는 작업 항목의 `source` 와 지식자료의 가져온 시각을 `provenance.sources` 에 옮기는 것을 전제로 설계했습니다. 사람 승인은 `reviews` 의 `approved` 상태에 대응합니다.

## 검증 예

```ts
import { validateTaskEnvelope } from '@/lib/cora/platform/rita-contract';
const r = validateTaskEnvelope(JSON.parse(text));
if (!r.ok) console.error(r.errors); // 오류마다 "$.경로: 이유" 형식
```
