from pathlib import Path
import json, csv, collections, re, html
from markdown_it import MarkdownIt

ROOT=Path('/Users/boramlim/Documents/Codex/2026-09-28/https-www-mirra-my')
OUT=ROOT/'outputs/제품개발_마스터플랜_2026-09-29'
WORK=ROOT/'work/masterplan'

product=(WORK/'product_bm.md').read_text()
product=product.replace('최종 모델 선택·통계 정의·문헌에 따른 모델 승격 조건은 병렬 조사 결과와 합친다.', '모델·측정·검증의 상세 기준은 이 패키지의 04·05·06·10 문서를 따른다.')
product=product.replace('대표 주 1시간과 디자이너 별도 4~5시간은 추가 자원이다.', '대표 시간과 디자이너6~8시간·측정12~16시간·숙련 개발24~40시간은 별도 자원 가정이다.')
product=product.replace('**108개 설계 기능, 25개 영역**', '**110개 설계 기능, 25개 영역**')
product=product.replace('| Scale | 18 |', '| Scale | 20 |')
product=product.replace('기능 108개, ID 중복 없음', '기능110개, ID 중복 없음')
product=product.replace('병합할 때 주의할 항목:', '상품 적용 시 주의할 항목:')
product=product.replace('범위 누락 0개', '원장 ID 미연결 0개')
product=product.replace('root 05','05').replace('root 07','07').replace('root 09','09')
product += '\n\n최종 통합에서 P109(조건부 후속 댓글)·P110(Threads 답글·재게시)을 후속 검토 기능으로 추가했다. 이는 API 지원·권한 확인 전 제공 약속이 아니다. 대응 원장의 연결은 동등한 동작 구현·성능 시험을 뜻하지 않는다. 릴리스별 제공 범위는 07을 우선한다.\n'
(OUT/'02_고객경로와_상품운영.md').write_text(product)
literature=(WORK/'literature.md').read_text().replace('같은 폴더의 `sources.json`','[sources.json](sources.json)')
(OUT/'04_문헌근거와_진단설계.md').write_text(literature)
architecture=(WORK/'architecture_ml.md').read_text().replace('기존 자산의 확인 근거는 `work/strategy/rita_fit.md`, `bm_build_review.md`, `instagram_analytics_feasibility.md`에 있다. 해당 원본 메모와 기존 앱은 이번 설계에서 변경하지 않았다.', '기존 자산의 확인 범위는 08 출처 문서와 이전 Rita 자산 보고서에 연결되어 있다. 기존 앱과 원본은 변경하지 않았다.')
architecture=architecture.replace('`process_for_user`, `benchmark`, `train`, `reuse_media` 별도 목적', '`process_for_user`, `display_reference`, `benchmark`, `train`, `evaluate`, `reuse_media`, `publish` 별도 목적')
(OUT/'06_아키텍처_데이터계약_ML검증.md').write_text(architecture)
sources=json.loads((WORK/'sources.json').read_text())
(OUT/'sources.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2))
contract=json.loads((WORK/'proposedcontracts.json').read_text())
purpose=['process_for_user','display_reference','benchmark','train','evaluate','reuse_media','publish']
contract['global_conventions']['purpose_registry']=purpose
for t in contract['tables']:
    if t['name']=='rights_grants':
        t['columns']['purpose']['enum']=purpose
contract['source_document']='06_아키텍처_데이터계약_ML검증.md'
contract['release_authority']='07_개발일정_인력_비용_검증.md; P0-P3 are technical phases, not the complete R0-R5 release calendar.'
contract['phases']['P0']='narrow direct-use carousel workflow including source-based brief options; no predictive account analytics promised'
(OUT/'proposedcontracts.json').write_text(json.dumps(contract,ensure_ascii=False,indent=2))

features=json.loads((WORK/'features.json').read_text())
byid={f['id']:f for f in features}
byid['P039']['title']='문구·사진·카드 순서 직접 편집'
byid['P039']['process']+=' 카드 추가·삭제·순서와 제한된 글꼴·색·크기를 편집하고, 지원 카드 수·템플릿 제약을 즉시 안내한다.'
byid['P039']['acceptance']+=['카드 순서·문구·사진을 바꾼 뒤 재접속·미리보기·내보내기에서도 같은 결과이며 다른 카드가 임의 변경되지 않는다.']
byid['P046']['process']+=' 확정 버전에서 게시용 JPEG 변환본·캡션 TXT·프로젝트 JSON·파일 manifest를 생성한다. PDF는 별도 검증된 출력 단계에서 제공한다.'
byid['P046']['acceptance']+=['PNG/JPEG·캡션·manifest가 확정 버전과 일치하고 실제 파일이 열린다. 불필요한 고객 원자료는 납품 묶음에 포함되지 않는다.']
byid['P048']['acceptance']+=['권리 있는 실제 테스트 영상에서 전사 구간의 시작·끝과 원본 음성이 대응하고, 누락·겹침·인식불가·화자 불확실을 표시한다. 자막 수정 뒤 재생 위치가 어긋나지 않는다.']
byid['P012']['acceptance']+=['제공 원본의 표본 행과 저장 값·단위·기간·결측을 대조해 일치하며, 중복 가져오기와 잘못된 열 매핑을 감지한다.']
for fid in ['P059','P083','P084']:
    byid[fid]['process']+=' 매 실행 시 자료·연결·변형 이용 권리의 만료·삭제·철회를 다시 검사하고 미확인이면 보류한다.'
    byid[fid]['acceptance']+=['처음 승인 후 권리가 철회된 자료로 반복 생성·렌더·발행이 실행되지 않는다.']
byid['P102']['acceptance']=['R1에서는 구조화 계약으로 로컬 시험 호출을 재현하고 입력·결과·비용·버전·권한 오류가 맞는다. 실제 Rita 인증·호출 검증은 R5에서 별도로 통과한다.']
features += [
  dict(id='P109',section='댓글·DM',title='게시 결과·시간 조건의 후속 댓글',users=['대행사','개인운영'],stage='Scale',inputs=['본인 게시물, 경과시간/조회 조건, 허용 댓글 문안, 승인·실행 한도'],process='공식 API 지원·권한을 확인한 채널에 한해 본인 게시물의 조건을 평가한다. 조건을 만족해도 승인된 문안·대상에만 한 번 실행하고 결과가 불명확하면 대조한다. 상시 자동 댓글은 기본 비활성이다.',outputs=['조건 판정 근거, 댓글 초안/실행 ID, 실패·미지원 상태'],empty_error='지표 지연·권한 만료·API 미지원이면 댓글을 보내지 않고 이유 표시',acceptance=['같은 조건이 여러 번 평가되어도 중복 댓글이 생성되지 않는다. 삭제·승인 철회가 실행보다 우선하며 미지원 채널은 실제 전송하지 않는다.'],dependencies=['P013','P069','P086','P096'],build_reuse='후속 조건 엔진과 공식 댓글 어댑터를 권한 확인 후 별도 구현',reference_ids=['F077']),
  dict(id='P110',section='댓글·DM',title='Threads 참고 글의 답글·재게시 검토',users=['대행사','개인운영'],stage='Scale',inputs=['공개 참고 글 URL, 연결 계정, 답글/재게시 요청, 승인 내용'],process='검색 결과를 검토한 사용자가 개별 글의 답글 또는 재게시를 명시적으로 선택한다. 현행 공식 API와 필요한 권한·대상 제한을 확인해 지원되는 동작만 실행하며, 검색 자체를 자동 홍보 동의로 취급하지 않는다.',outputs=['답글 초안, 지원 여부, 승인/실행 기록, 원문 링크'],empty_error='접근 불가·삭제된 글·미지원 동작이면 원문 열기와 수동 작업 안내',acceptance=['검색만으로 답글·재게시가 실행되지 않고 승인 대상·계정·문구가 일치한다. 공식 API 미지원 상태는 성공으로 표시하지 않는다.'],dependencies=['P025','P069','P075','P086'],build_reuse='기능 범위 보존용 후속 설계; 실제 Threads 지원 조건 확인 후 개발 결정',reference_ids=['F079'])
]

r1_ids={1,2,3,4,6,7,9,10,12,15,16,18,19,21,23,26,27,30,31,33,34,35,37,38,39,44,45,46,61,65,66,77,90,91,94,95,96,97,98,99,102,107}
for f in features:
    n=int(f['id'][1:])
    if n in r1_ids:
        f['release']='R1 제한 범위'
        f['release_scope']='자료 기반 후보·제한 템플릿·직접 수정·내보내기에 필요한 최소 동작. 전체 행의 확장 속성은 후속 범위일 수 있다.'
    elif n==42:
        f['release']='R1 조건부 / R2'
        f['release_scope']='핵심 폼 편집이 안정화되고 선택 영역 보존 시험을 통과한 경우만 R1에 포함한다.'
    elif 100<=n<=104:
        f['release']='R5'
        f['release_scope']='실제 외부 인증·과금·Rita 인터페이스를 확인한 뒤 제공한다.'
    elif n==108:
        f['release']='R4'
        f['release_scope']='권리 있는 데이터·측정·외부 평가가 기준 모델 대비 가치를 지지할 때만 도입한다.'
    elif 47<=n<=60 or 71<=n<=76:
        f['release']='R3 이후'
        f['release_scope']='제한 영상 경로 또는 한 플랫폼 발행부터. 범용 편집·채널 확장은 별도 투자 단위다.'
    elif f['stage']=='Scale':
        f['release']='후속 선택 / 보류'
        f['release_scope']='수요·원가·공식 지원 조건을 확인하기 전 판매 범위에 포함하지 않는다.'
    else:
        f['release']='R2 이후'
        f['release_scope']='반복 사용·계정 연결·브랜드 협업에 필요한 범위를 먼저 제공한다.'
    f['implementation_status']='설계; 구현·수락시험 미실행'

overrides={
'P003':'R1은 동의·접근 차단·삭제 요청/처리 경로부터. 셀프 대량 내보내기 확장은 후속 검증.',
'P004':'R1은 고객별 격리와 1브랜드 작업부터. 다중 브랜드 관리 UI는 R2.',
'P012':'R1은 합의한 소수 열/고객 제공 자료만. 임의 플랫폼 범용 가져오기를 약속하지 않는다.',
'P016':'R1은 고객 제공 자료의 출처·기간을 표시한 제한 요약. 공식 계정 수집·고급 비교는 R2.',
'P021':'R1은 지원 가능한 공개 본문과 직접 입력 대안. 임의 로그인벽/유료자료 자동 수집은 제외.',
'P023':'R1은 카드에 필요한 사진/자료. 장편 영상 처리·보관은 R3 비용 제한 후.',
'P027':'R1은 자료 저장·명백한 중복부터. 주기적 외부 갱신은 제공자 정책·R2 이후.',
'P030':'R1은 본인 자료·목표·규칙으로 후보3개. 계정 성과 기반 추천은 R2, 학습 모델은 R4.',
'P039':'R1은 제한 템플릿의 문구·사진·카드 순서·지원된 스타일. 자유 레이어는 P041 후속.',
'P046':'R1은 PNG/JPEG·캡션·JSON·manifest. PDF와 외부 편집기 전용 원본 호환은 별도 검증.',
'P061':'R1은 선택한 Instagram 카드의 캡션. 여러 채널 연속 글·블로그는 후속.',
'P077':'R1은 고객 제공 게시 URL과 확인 출처. 공식 게시 ID/지표 자동 연결은 R2/R3.',
'P090':'R1은 실제 제공 범위와 가격 설명·제한 파일럿. 자동 구독청구는 P093 준비 후.',
'P102':'R1은 로컬 호출 가능한 계약과 작업 기록. 실제 Rita 호출은 R5.',
'P107':'R1은 제작·선택·시간·지원의 기본 기록. 통제 실험은 R4의 표본·설계 조건 이후.'}
for k,v in overrides.items(): byid[k]['release_scope']=v
(OUT/'features.json').write_text(json.dumps(features,ensure_ascii=False,indent=2))

def flat(x): return ' / '.join(map(str,x)) if isinstance(x,list) else str(x)
cols=list(features[0])
with (OUT/'전체기능원장.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=cols);w.writeheader();w.writerows({k:flat(v) for k,v in row.items()} for row in features)

lines=['# 전체 기능 명세: 110개 기능, 25개 영역','',
'각 기능은 개발 기준안이다. 완료 조건은 앞으로 통과해야 할 시험이며 지금 통과했다는 뜻이 아니다. `stage`는 성격별 우선순위, `release`는 제공 범위 안내다. 첫12주의 확정 범위와 예산은 07을 우선한다. 의존 ID는 필요한 계약/공통 기능을 가리키며 모든 하위 속성을 먼저 구현하라는 뜻은 아니다.', '',
'기존 Mirr F001~F109, 영상 보완 Y01~Y35를 연결했다. 이 연결은 비교 범위 추적이며 동일 구현·성능·권한 확보의 증거가 아니다. F077/F079는 동작 누락을 막기 위해 P109/P110의 조건부 후속 범위로 명시했다.', '',
'[JSON 원장](features.json) · [CSV 원장](전체기능원장.csv) · [기존 조사 대응표](기존조사_대응표.csv)', '']
last=None
for row in features:
    if row['section']!=last:
        lines += ['## '+row['section'],'']; last=row['section']
    lines += ['### '+row['id']+' · '+row['title'],'',
        '| 항목 | 명세 |','|---|---|']
    for label,k in [('고객','users'),('우선순위','stage'),('릴리스','release'),('제공 범위','release_scope'),('입력','inputs'),('처리','process'),('출력','outputs'),('빈 상태·오류','empty_error'),('완료 조건','acceptance'),('의존','dependencies'),('구현/재사용','build_reuse'),('기존 조사','reference_ids')]:
        lines.append('| '+label+' | '+flat(row[k]).replace('|','\\|').replace('\n','<br>')+' |')
    lines += ['']
(OUT/'03_전체기능명세.md').write_text('\n'.join(lines))

with (OUT/'기존조사_대응표.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f);w.writerow(['reference_id','planned_feature_ids','coverage_type','note'])
    for prefix,num,width in [('F',109,3),('Y',35,2)]:
        for i in range(1,num+1):
            rid=prefix+str(i).zfill(width)
            matches=[r['id'] for r in features if rid in r['reference_ids']]
            note='제안 기능 범위 연결; 원 기능의 모든 세부 동작·품질·동등 구현은 미검증'
            if rid in ['F077','F079']: note+='; 후속 조건부 기능으로 별도 명세'
            w.writerow([rid,','.join(matches),'planned_scope_mapping',note])

intro='''# Cora — 제품·사업·개발 마스터플랜

**Content Operations Run by Agents** · 현재 제품명은 Cora이며, 추후 변경 가능한 가칭이다.

**개발 방식:** 본인·조유경 학생이 AI와 함께 합의한 출시 범위의 기능 구현 90% 이상을 담당하는 것이 목표다. 개발자는 출시 전 독립 검토와 필요한 보완을 맡는다. 구현 비율은 코드량이 아니라 실제 고객 흐름의 수락 조건으로 확인하며 기간·비용 비율을 보장하지 않는다.

2026-09-29 · 기준안1.0 · 계획 작성 완료, 제품 구현·고객 효과 검증 전.

**내 계정에 맞는 다음 콘텐츠를 고르고 실제 완성하도록 돕는 서비스**를 설계했다. 첫 영업 대상은 여러 브랜드를 운영하는 소규모 대행사다. 계정을 시작하는 개인과 정기 게시하는 개인도 같은 기반 위에서 다른 진입 경험을 갖는다. 현재 실행팀은 본인·조유경 학생 1명·AI/Codex이며, 학생은 주4~5시간 참여한다. 이전 학생 2명과 개발자 선투입을 전제로 한 비용·시간 가정은 현 계획에 적용하지 않는다.

[검색하며 보는 개발계획](개발계획.html) · [전체 통합 문서](전체_통합개발계획.md) · [개발 인계 ZIP](현재_제품개발_인계패키지_2026-09-29.zip)

## 무엇이 들어 있나

| 문서 | 결정하는 일 |
|---|---|
| [01 사업모델·제품 원칙](01_사업모델과_제품원칙.md) | 고객·가치·상품·가격/원가·판매·사업 판정 |
| [02 고객 경로·상품 운영](02_고객경로와_상품운영.md) | 초보 개인13단계, 운영 개인14단계, 대행사15단계의 입력→제공 결과 |
| [03 전체 기능](03_전체기능명세.md) | 25영역110기능의 입력·처리·출력·오류·완료조건·의존·릴리스 |
| [04 문헌·진단](04_문헌근거와_진단설계.md) | 핵심15편, 근거→측정→편집/추천 행동·한계 |
| [05 데이터·연구 운영](05_데이터수집과_연구운영.md) | 권리·표본·코딩·결측·관측기간·제품 실험 |
| [06 아키텍처·데이터·ML](06_아키텍처_데이터계약_ML검증.md) | 고객 분리·작업/발행 상태·Rita·모델 평가·12개 E2E |
| [07 일정·사람·비용](07_개발일정_인력_비용_검증.md) | 첫12주와 후속 릴리스, 역할·시간·예산·출시 조건 |
| [08 출처·미확정·변경](08_출처_미확정사항_변경관리.md) | 사실/가설 구분, 공식 자료, 해결할 결정17개 |
| [09 화면별 작업·예시](09_화면별_작업명세와_설계예시.md) | 첫 화면·진단·추천·편집·승인·오류, 가상 책방의6장 완성 예시 |
| [10 코드북·연구 실험](10_연구실행_코드북과_모델실험표.md) | 8개 코딩 항목, 연구 질문5개, 소재/모델 비교와 판매 주장 |
| [11 바이브 코딩·개발자 역할](11_바이브코딩_범위와_개발자_역할.md) | 본인·조유경·AI의 실행 분담, 개발자 인계·비용 산정 기준 |

## 핵심 개발 방향

`목표·자료 → 계정/콘텐츠 점검 → 제작 가능한 후보 → 브리프 → 제작·편집 → 승인·게시 → 결과 → 다음 제작`

연구의 판매 가치는 ‘복잡한 분석을 한다’가 아니라 **어디를 왜 고칠지 보여주고 바로 고칠 수 있다**는 데 둔다. 처음에는 자료·브랜드 규칙·문헌 근거를 보여주는 제안, 다음에는 자기 계정의 관측 기반 추천, 검증 이후에는 ML 개인화를 더한다. XGBoost·토픽 분석은 기준 방법보다 고객 결정을 개선하는지 비교한 뒤 사용한다.

첫 R1은 본인 자료 기반 추천·카드/캡션·직접 편집·내보내기다. R2는 공식 계정 분석·다중 브랜드·고객 승인, R3는 발행 또는 제한 영상, R4는 검증된 개인화, R5는 실제 Rita 연결이다. 일부 작업은 병행 가능하나 학생 주4~5시간으로 전체 기능을 만들 수 있다고 가정하지 않는다.

현재 팀 기준 첫12주 검증비는 학생 1명 인건비·선택 디자인·실비를 포함해 개발자 제외 **171~235만원 가설**이다. 창업자 노동·기존 구독료는 제외하며, 개발비는 GitHub와 시제품을 확인한 뒤 필요한 작업을 모아 별도 견적을 받는다. 이는 지출 승인이나 견적이 아니다.

## 개발자에게 넘기는 파일

- [기능 JSON](features.json), [CSV](전체기능원장.csv):110행·필드별 명세·출시 범위.
- [데이터/API 계약](proposedcontracts.json):46개 목표 테이블·21개 대표 API·Rita 계약. 실행 가능한 SQL/OpenAPI 완제품은 아니며 단계별로 구현한다.
- [문헌 서지](sources.json):15편의 확인 범위·DOI/arXiv·한계.
- [기존 조사 대응표](기존조사_대응표.csv):Mirr109항목과 영상35항목의 제안 기능 연결. 동등 구현 검증과 구분한다.
- [검증기록](검증기록.md):산출물 자체의 구조·수치·참조 검사와 미실행 검증.

## 무엇을 아직 주장하지 않는가

실제 고객 계정 연결·앱 심사·새 기능 구현·모델 학습·고객 결제·성장 효과는 이 계획 작성에서 수행하지 않았다. 원래 Claude 프로젝트와 운영 서비스는 보존했다. 이 패키지는 그 자산을 활용해 새 제품을 개발하기 위한 기준 문서다.

기존 전략·가격/예산 문서와 충돌하면 이 패키지의01·07을 현재 제안으로 읽는다. 수치가 가정이면 가정 표시를 유지한다. 다음 개발 이슈는 R1의 한 고객 작업을 끝내는 단위로 만들고 기능ID·데이터계약·수락시험을 연결한다.
'''
(OUT/'00_여기부터.md').write_text(intro)

md=MarkdownIt('commonmark',{'html':True}).enable('table')
docfiles=sorted(OUT.glob('[0-1][0-9]_*.md'))
# Keep new follow-up comment features next to their section in the HTML catalogue.
feature_groups=collections.defaultdict(list)
for r in features: feature_groups[r['section']].append(r)
section_order=list(feature_groups)

nav=[('overview','시작·전체 구조'),('business','사업모델·제품 원칙'),('journeys','고객3종의 이용 경로'),('features','전체110개 기능'),('literature','문헌15편·진단'),('data','데이터 수집·운영'),('architecture','아키텍처·ML 검증'),('roadmap','일정·사람·비용'),('decisions','출처·미확정 결정'),('screens','화면·완성 예시'),('research','코드북·연구 실행'),('ownership','바이브코딩·개발자 역할')]
mapping={k:docfiles[i] for i,(k,label) in enumerate(nav)}

css='''*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;color:#183034;background:#f6f6f0;line-height:1.75}a{color:#176866}button,select,input{font:inherit}button{cursor:pointer}aside{position:fixed;top:0;bottom:0;width:255px;background:#112f33;color:#dfeceb;padding:28px 18px;overflow:auto}aside h1{font-size:20px;line-height:1.45;margin:0 10px 5px}aside p{font-size:12px;color:#a7c4c3;margin:0 10px 22px}nav button{width:100%;padding:10px 12px;margin:3px 0;text-align:left;border:0;border-radius:7px;background:none;color:inherit;font-size:14px}nav button[aria-selected=true]{background:#ddede4;color:#112f33;font-weight:700}aside .foot{font-size:12px;margin-top:25px;padding:12px;border-top:1px solid #315054}aside a{color:#d9e9b8}main{margin-left:255px;padding:32px 44px 80px;max-width:1600px}.top{display:flex;justify-content:space-between;gap:15px;border-bottom:1px solid #ccd6cf;padding-bottom:20px;margin-bottom:28px}.eyebrow{font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:#5a716e}.pill{display:inline-block;padding:4px 10px;border-radius:99px;background:#e7e4d0;font-size:12px}.panel{display:none}.panel.active{display:block}.panel>h1{font-size:32px;line-height:1.35;margin:18px 0}h2{font-size:23px;border-top:1px solid #d3dbd3;padding-top:22px;margin-top:42px}h3{font-size:18px;margin-top:28px}p,li{max-width:1000px}table{border-collapse:collapse;width:100%;margin:20px 0;font-size:14px;display:block;overflow-x:auto}th{background:#e4ebe2;text-align:left;font-weight:650}th,td{border:1px solid #cdd7cf;padding:10px 12px;vertical-align:top;min-width:110px}pre{overflow:auto;padding:18px;background:#132f33;color:#e4f0e5;border-radius:8px;font-size:13px}code{font-size:.91em;overflow-wrap:anywhere}pre code{color:inherit}blockquote{border-left:4px solid #738f73;margin:20px 0;padding:8px 20px;background:#edf1e8}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0}.stat{background:white;border:1px solid #d6ddd3;padding:20px;border-radius:10px}.stat b{display:block;font-size:31px;line-height:1.3}.stat span{font-size:13px;color:#5a6c67}.flow{display:flex;gap:8px;flex-wrap:wrap;margin:22px 0}.flow span{padding:12px 14px;background:#e2e9d5;border-radius:7px;font-weight:600}.flow i{align-self:center;color:#5e7771;font-style:normal}.notice{padding:16px 20px;border-left:4px solid #cc9d50;background:#f5eedf;font-size:14px;border-radius:3px}.toolbar{position:sticky;top:0;background:#f6f6f0f5;padding:14px 0;border-bottom:1px solid #cdd7cf;z-index:2;display:flex;flex-wrap:wrap;gap:9px}.toolbar input{flex:1;min-width:240px}.toolbar input,.toolbar select,.toolbar button,.top button{border:1px solid #bccbc2;border-radius:6px;padding:8px 11px;background:white;color:#183034}.feature{background:white;margin:12px 0;border:1px solid #ced8cf;border-radius:8px;overflow:hidden}.feature summary{cursor:pointer;padding:16px 20px;line-height:1.5}.feature summary strong{display:inline-block;margin:0 10px 0 4px}.feature .body{padding:0 20px 18px}.tags{color:#667c73;font-size:12px;display:block;padding-left:22px;margin-top:6px}.feature dl{display:grid;grid-template-columns:115px 1fr;gap:8px 15px;margin:14px 0;font-size:14px}.feature dt{font-weight:700}.feature dd{margin:0;white-space:pre-line}.hidden{display:none!important}.count{font-size:13px;color:#547067;margin:12px 0}.doclink{font-size:13px;margin-top:20px}.diagram{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:20px 0}.diagram div{background:#e5ece2;border:1px solid #c3d0c1;border-radius:8px;padding:18px;text-align:center}.diagram small{display:block;color:#5a7168}.mermaid-note{font-size:12px;color:#5f736b}.mobile-title{display:none}button:focus-visible,a:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #c09835;outline-offset:3px}@media(max-width:980px){aside{position:static;width:auto;padding:18px}aside h1{font-size:19px}aside p{margin-bottom:10px}nav{display:flex;overflow:auto}nav button{width:auto;white-space:nowrap}aside .foot{display:none}main{margin:0;padding:20px}.stats{grid-template-columns:repeat(2,1fr)}.panel>h1{font-size:26px}}@media print{aside,.top,.toolbar,.doclink{display:none}main{margin:0;padding:0;max-width:none}.panel{display:block!important;break-before:page}.panel:first-child{break-before:auto}.feature{break-inside:avoid}body{background:white}table{font-size:10px}.stats{grid-template-columns:repeat(4,1fr)}}'''

panels=[]
for k,label in nav:
    file=mapping[k]
    content=md.render(file.read_text())
    if k=='overview':
        content='<div class="stats"><div class="stat"><b>3</b><span>고객 경로</span></div><div class="stat"><b>110</b><span>설계 기능 · 25영역</span></div><div class="stat"><b>15</b><span>핵심 문헌 · 확인 범위 명시</span></div><div class="stat"><b>12</b><span>단계별 E2E 수락시험</span></div></div>'+content
        content+='<div class="flow">'+''.join('<span>'+x+'</span>'+('<i>→</i>' if i<6 else '') for i,x in enumerate(['목표·자료','진단','소재 선택','제작·편집','승인·게시','결과 확인','다음 제작']))+'</div>'
    if k=='architecture':
        diagram='<div class="diagram"><div>웹 UI<small>개인·대행사·고객 검토</small></div><div>단일 도메인 API<small>권한·작업·승인·원가</small></div><div>Postgres·비공개 저장소<small>고객별 자료·버전</small></div><div>영속 작업 큐<small>재시도·취소·outbox</small></div><div>비공개 워커<small>자료·생성·렌더·분석</small></div><div>공식 SNS·Rita 어댑터<small>범위별 권한·실행 기록</small></div></div>'
        content=re.sub(r'<pre><code class="language-mermaid">[\s\S]*?</code></pre>',diagram+'<p class="mermaid-note">연결 관계: 웹→API→DB/파일/큐→워커. 발행은 별도 승인 경로, Rita는 권한 있는 API 계약을 사용한다. 원문에는 Mermaid 코드도 보존했다.</p>',content)
    if k=='features':
        content='<h1>전체110개 기능</h1><p>기능명·입력·오류·완료조건을 검색하고 단계 또는 영역으로 좁힐 수 있다. 모두 설계 상태이며 실제 구현·시험 통과가 아니다. 첫12주 제공 범위는 각 행의 릴리스 설명과 일정 문서를 따른다.</p><div class="notice">Mirr109개·영상35개 항목을 연결했다. 연결은 범위 추적이며 동등 구현 검증이 아니다. 조건부 후속 댓글·Threads 답글은 권한·공식 지원 확인 후 검토한다.</div>'
        content+='<div class="toolbar"><input id="search" type="search" placeholder="예: 승인, XGBoost, 지표, P046" aria-label="기능 검색"><select id="stage" aria-label="기능 단계"><option value="">모든 단계</option>'+''.join('<option>'+s+'</option>' for s in ['Foundation','Pilot','Agency','Scale','Research'])+'</select><select id="area" aria-label="기능 영역"><option value="">모든 영역</option>'+''.join('<option>'+s+'</option>' for s in section_order)+'</select><button id="reset">초기화</button><button id="expand">검색 결과 펼치기</button></div><p class="count" id="count" aria-live="polite"></p><div id="features-list">'
        for section,rows in feature_groups.items():
            for r in rows:
                pairs=[]
                for key,lab in [('release','릴리스'),('release_scope','제공 범위'),('inputs','입력'),('process','처리'),('outputs','출력'),('empty_error','빈 상태·오류'),('acceptance','완료 조건'),('dependencies','의존'),('build_reuse','개발·재사용'),('reference_ids','기존 조사')]:
                    val='\n'.join(r[key]) if isinstance(r[key],list) else r[key]
                    pairs.append('<dt>'+lab+'</dt><dd>'+html.escape(val or '없음')+'</dd>')
                content+='<details class="feature" data-id="'+r['id']+'" data-stage="'+r['stage']+'" data-area="'+html.escape(section)+'"><summary><strong>'+r['id']+' · '+html.escape(r['title'])+'</strong><span class="tags">'+html.escape(section+' · '+r['stage']+' · '+', '.join(r['users']))+'</span></summary><div class="body"><dl>'+''.join(pairs)+'</dl></div></details>'
        content+='</div>'
    content+='<p class="doclink">원문: <a href="'+file.name+'">'+file.name+'</a></p>'
    panels.append('<section id="'+k+'" class="panel'+(' active' if k=='overview' else '')+'" aria-label="'+label+'">'+content+'</section>')

js='''const navButtons=Array.from(document.querySelectorAll('nav button'));
const panels=Array.from(document.querySelectorAll('.panel'));
function showPanel(id,updateHash=true){
 if(!panels.some(p=>p.id===id)) id='overview';
 panels.forEach(p=>p.classList.toggle('active',p.id===id));
 navButtons.forEach(b=>b.setAttribute('aria-selected',String(b.dataset.panel===id)));
 if(updateHash) history.replaceState(null,'','#'+id);
 window.scrollTo(0,0);
}
navButtons.forEach(b=>b.addEventListener('click',()=>showPanel(b.dataset.panel)));
const search=document.getElementById('search'), stage=document.getElementById('stage'), area=document.getElementById('area');
const cards=Array.from(document.querySelectorAll('.feature'));
function matchesFeature(text,cardStage,cardArea,q,stageFilter,areaFilter,cardId){const textMatch=/^P[0-9]{3}$/i.test(q)?cardId===q.toUpperCase():(!q||text.toLowerCase().includes(q.toLowerCase()));return textMatch&&(!stageFilter||cardStage===stageFilter)&&(!areaFilter||cardArea===areaFilter);}
function filterFeatures(){
 const q=search.value.trim();let n=0;
 cards.forEach(c=>{const ok=matchesFeature(c.textContent,c.dataset.stage,c.dataset.area,q,stage.value,area.value,c.dataset.id);c.classList.toggle('hidden',!ok);if(ok)n++;});
 document.getElementById('count').textContent=n+' / '+cards.length+'개 기능';
 return n;
}
[search,stage,area].forEach(e=>e.addEventListener('input',filterFeatures));
document.getElementById('reset').addEventListener('click',()=>{search.value='';stage.value='';area.value='';filterFeatures();});
document.getElementById('expand').addEventListener('click',()=>{cards.forEach(c=>{if(!c.classList.contains('hidden')) c.open=true;});});
function openAllForPrint(){search.value='';stage.value='';area.value='';filterFeatures();cards.forEach(c=>c.open=true);window.print();}
document.getElementById('print').addEventListener('click',openAllForPrint);
window.addEventListener('hashchange',()=>showPanel(location.hash.slice(1),false));
filterFeatures();showPanel(location.hash.slice(1)||'overview',false);
'''
(WORK/'masterplan-ui.js').write_text(js)
page='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cora · 제품개발 마스터플랜</title><style>'+css+'</style></head><body><aside><h1>Cora<br>제품개발 마스터플랜</h1><p>Content Operations Run by Agents · 가칭</p><p>2026.09.29 · 기준안 1.0</p><nav aria-label="문서 탐색">'+''.join('<button data-panel="'+k+'" aria-selected="'+str(i==0).lower()+'">'+label+'</button>' for i,(k,label) in enumerate(nav))+'</nav><div class="foot">설계와 검증 상태를 구분한다.<br><a href="전체_통합개발계획.md">통합 문서</a> · <a href="현재_제품개발_인계패키지_2026-09-29.zip">인계 ZIP</a><br><a href="검증기록.md">검증기록</a></div></aside><main><div class="top"><div><div class="eyebrow">PRODUCT · BUSINESS · RESEARCH · ENGINEERING</div><span class="pill">설계 완료 / 구현·실증 전</span></div><button id="print">전체 인쇄</button></div>'+''.join(panels)+'<footer class="count">모든 가격·일정은 표시된 가정과 단계에 따른다. 이 페이지는 개발계획 문서이며 실제 운영 대시보드가 아니다.</footer></main><script>'+js+'</script></body></html>'
(OUT/'개발계획.html').write_text(page)

integrated=['# Cora — 통합 개발계획','', '2026-09-29 · 기준안1.0. 개별 문서와 같은 내용의 검색·인계용 합본이다. 구현 완료 보고서가 아니다.','']
for p in docfiles:
    integrated+=['\n---\n',p.read_text()]
(OUT/'전체_통합개발계획.md').write_text('\n'.join(integrated))
print(json.dumps({'features':len(features),'sections':len(feature_groups),'literature':len(sources['sources']),'tables':len(contract['tables']),'apis':len(contract['apis']),'documents':len(docfiles)},ensure_ascii=False))
