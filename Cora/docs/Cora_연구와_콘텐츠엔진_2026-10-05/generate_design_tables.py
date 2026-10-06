"""Create proposal tables only. Does not discover accounts or collect platform data."""
from pathlib import Path
import csv

BASE = Path(__file__).resolve().parent

def save(name, fields, rows):
    with (BASE / name).open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

themes = [('education_practical', '교육·업무 실용지식'),
          ('daily_skills', '요리·생활 기술'), ('beauty_style', '뷰티·스타일 사용법')]
samples = []
for platform in ['youtube', 'instagram', 'tiktok']:
    for code, theme in themes:
        samples.append(dict(
            cell_id=f'ko_{platform}_{code}', language='ko', platform=platform,
            theme_code=code, theme=theme, unit='플랫폼 계정; 독립 창작자 수 별도',
            pilot_accounts=4, pilot_posts_per_account_max=20,
            expanded_panel_accounts=100, early_visible_age_0_90_days=70,
            developing_visible_age_91_365_days=30,
            initial_visible_posts_per_account_max=30, prospective_weeks=24,
            inception_cohort_accounts=10, english_external_accounts=20,
            first_operational_target=100 if platform == 'youtube' else 10,
            access_status='미확인/미승인; 실제 계정0',
            route=('공식 API 허용 분석·보관/소유자 원자료' if platform == 'youtube'
                   else '동의한 소유자 원자료/허용 내보내기; 연구 경로 별도'),
            selection='발견 표본틀 안에서 층화 무작위; 전체 플랫폼 확률표본 아님',
            caveat='계정/코호트 중복 제거; 숫자는 확정/검정력 보장이 아닌 제안'))
assert len(samples) == 9
assert sum(r['pilot_accounts'] for r in samples) == 36
assert sum(r['expanded_panel_accounts'] for r in samples) == 900
assert sum(r['inception_cohort_accounts'] for r in samples) == 90
assert sum(r['english_external_accounts'] for r in samples) == 180
assert all(r['early_visible_age_0_90_days'] + r['developing_visible_age_91_365_days']
           == r['expanded_panel_accounts'] for r in samples)
save('01_표본설계.csv', list(samples[0]), samples)

# entity|field|type|meaning|missing handling|point-in-time / use condition
definitions = '''sampling_members|frame_id|string|발견 표본틀 버전|필수|검색 결과는 전체 플랫폼 모집단이 아님
sampling_members|cell_id|string|플랫폼·테마·나이 구간 층|필수|콘텐츠 분류 코드북 버전 연결
sampling_members|discovery_route|string|검색/목록/모집 경로|필수|경로별 선택 편향 기록
sampling_members|query_parameters|json|검색어·기간·필터·정렬·페이지|경로상 미지원 기록|수집 및 저장 허용 조건 적용
sampling_members|discovered_at|datetime_utc|계정을 발견한 실제 시각|필수|과거 성과 시각으로 사용하지 않음
sampling_members|eligibility_status|enum|적격/제외/미확인|미확인 허용|제외 이유 별도
sampling_members|selection_seed|string|표본틀 내 추출 seed|수동 모집이면 not_applicable|플랫폼 발견 확률을 설명하지 않음
sampling_members|selection_rank|integer|본/예비 계정 추출 순서|미추출이면 null|초기 대체와 추적 탈락 분리
sampling_members|inception_cohort|boolean|진짜 시작부터 추적하는 코호트 여부|미확인이면 null|신규 여부 확인 근거 필요
creators|creator_id|string|연구용 가명 창작자 식별자|필수|교차 플랫폼 계정/군집 단위
creators|prior_experience|json|다른 계정 경험·기존 팬층·외부 유명세|미확인은 null|자기보고/검증 여부 구분
creators|goal_audience|json|목표·의도한 독자·약속한 문제|동의 없음/미응답 사유|과거 값은 당시 설문/기록만
creators|resources|json|제작 시간·기술·원자료·협업 역량|미응답 사유|변경 시 버전/시각 유지
accounts|account_id|string|플랫폼 포함 계정 고유키|필수|플랫폼 큰 정수도 문자열
accounts|creator_id|string|확인 가능한 소유 창작자 연결|공개 확인/동의 없으면 null|얼굴 비교로 동일인 추정하지 않음
accounts|platform|string|youtube/instagram/tiktok|필수|다른 모집 경로의 자료 합산 주의
accounts|first_visible_post_at|datetime_utc|현재 확인 가능한 최초 공개 게시 시각|미확보면 null|진짜 시작일과 다름
accounts|verified_start_at|datetime_utc|소유자/기록으로 확인한 실제 시작 시각|검증 불가면 null|최초 공개 게시와 확인 출처 저장
accounts|profile_snapshot|json|관측 당시 프로필·선언 테마|미지원/보관 제한 사유|현재 프로필을 과거 프로필로 쓰지 않음
accounts|account_state|enum|관측중/비공개/삭제/미게시/철회/오류|필수|상태를 사업 성공/실패로 자동 변환하지 않음
posts|post_id|string|플랫폼 포함 게시물 고유키|필수|중복 키·계정 재배정 여부 확인
posts|account_id|string|게시 계정|필수|소유자 변경/재게시 기록
posts|content_family_id|string|재게시·편집·교차 게시 동일 소재 가족|확인 불가면 null|학습/평가에 가족이 걸치지 않게 함
posts|published_at|datetime_utc|공개 게시 시각과 출처|미확보면 null|업로드/공개 전환/지역시각 구별
posts|sequence_visible|integer|보이는 게시물의 시간순 번호|미확보면 null|삭제한 이전 게시물이 없다는 뜻 아님
posts|format|string|릴스/쇼츠/일반 영상/카드 등|불명확하면 unknown|길이만으로 쇼츠 단정하지 않음
posts|language|json|실제 언어·복수언어·판정 방법|unknown 허용|지역 코드는 언어/국적이 아님
posts|source_url|string|원본 게시물 링크|표시/저장 제한 사유|출처 표시·현재 접근 상태 필요
posts|material_source_id|string|원고/원본 영상/허용 전사의 출처|자료 없으면 null|영상/자막 무단 다운로드를 기본 경로로 두지 않음
posts|commercial_context|json|협찬·부스팅·상업 표시와 근거|확인 불가면 unknown|무표시를 비상업으로 단정하지 않음
snapshots|snapshot_id|string|계정/게시 지표 관측 고유키|필수|중복·재시도 idempotency
snapshots|entity_id|string|계정 또는 게시물 ID|필수|대상 유형도 함께 기록
snapshots|collected_at|datetime_utc|실제 수집 시각|필수|API 자료 갱신 시각과 다름
snapshots|source_data_asof|datetime_utc|제공자가 명시한 자료 기준 시각|모르면 null|collected_at으로 임의 대체하지 않음
snapshots|freshness_status|enum|현재/지연/미확인|미확인 허용|목표 관측창과 실제 시점 구별
snapshots|elapsed_hours|number|게시 후 실제 수집 경과시간|게시 시각 없으면 null|정확한7일 성과를 자동 의미하지 않음
snapshots|metric_name|string|제공된 지표 원래 이름|필수|조회·도달·재생·완료율을 혼합하지 않음
snapshots|metric_value|number_or_string|원래 숫자 또는 정밀도 보존 값|지원 안 됨/비공개/실패 등의 null|값0과 결측 구분; 음의 순증도 가능
snapshots|metric_definition_version|string|제공자·정의·변경 시점|미확인이면 unknown|YouTube 등 집계 방식 변경 고려
snapshots|metric_window|json|누적/일별/기간·분모|미지원이면 unknown|과거 현재누적을 당시7일 수로 역산하지 않음
snapshots|precision_status|string|정확/반올림/내림/미확인|unknown 허용|YouTube 공개 구독자 작은 변화를 주의
content_features|feature_id|string|계산된 특징 식별자|필수|출처/권리 계보 연결
content_features|input_cutoff_at|datetime_utc|이 특징에 사용한 정보의 최종 시각|필수|미래 정보 누수 검증
content_features|modality_scope|string|제목/캡션/전사/이미지/영상 범위|필수|제목만으로 영상 전체 분석이라 하지 않음
content_features|model_code_version|string|모델·프롬프트·코드/토픽 버전|필수|학습 자료에서만 튜닝
content_features|value_and_evidence|json|특징값·근거 위치·불확실성|판단 불가 허용|조회수 보고 내용 라벨 붙이지 않음
annotations|annotator_id|string|가명 평가자 ID|필수|두 독립 평가와 조정 구별
annotations|codebook_version|string|구성개념·척도 버전|필수|변경 이력 유지
annotations|raw_label|json|독립 사람 코딩/모름/근거|판단 불가 허용|성과·모델·실험군 가림 여부 기록
annotations|adjudicated_label|json|불일치 조정 결과와 이유|조정 안 했으면 null|원래 평가를 덮어쓰지 않음
decision_events|decision_id|string|후보 선택 시점/회차|필수|기존 Cora 후보/주간 데이터와 대응
decision_events|candidate_set|json|노출한 후보 전체와 순서·모델 버전|과거 미기록이면 null|선택된 후보만 복원하지 않음
decision_events|information_cutoff_at|datetime_utc|당시 운영자가 알 수 있던 자료 시각|미기록이면 null|미래 지표로 과거 선택 설명 금지
decision_events|action_reason|json|선택/거절/수정/보류와 이유|미응답 이유|미게시 후보 성과를0으로 만들지 않음
decision_events|production_outcome|json|제작·게시·미게시·취소·사람 시간|아직 진행중 구별|성장 성과와 운영 결과 분리
source_items|source_id|string|원자료 취득 경로/계보 ID|필수|raw/특징/임베딩/모델까지 연결
source_items|retention_deadline|datetime_utc|제공자 조건에 따른 갱신/삭제 기한|조건 확인 전 unknown|장기 보관 권한 자동 부여하지 않음
rights_grants|purpose|string|연구/고객처리/공용학습/평가/사례/재사용/외부전송|필수|목적별 허용; 동의와 제공자 조건 둘 다
rights_grants|status|enum|승인/거절/미확인/만료|미확인 기본|미확인·만료 학습 제외
rights_grants|basis_restrictions|json|계약/동의/플랫폼 조건·범위·만료|확인 전 unknown|사용자 체크 하나로 제공자 조건 덮어쓰지 못함
research_runs|run_id|string|분석/특징/학습 실행 식별자|필수|실제 실행하지 않은 결과 생성 금지
research_runs|dataset_code_seed|json|데이터/코드/환경/seed 버전|필수|재현 가능하나 제한 자료는 배포하지 않음
split_memberships|split_and_role|string|train/validation/test/external와 단위|필수|기존 계정 미래와 새 계정 평가 구분
split_memberships|creator_family_time|json|창작자/가족/시간 누수 방지 키|필수|행 단위 무작위 분할만으로 평가하지 않음
experiment_assignments|experiment_unit|string|수용자/창작자 등 무작위 배정 단위|필수|플랫폼 계정 수와 독립 사람 수 구분
experiment_assignments|arm_time_seed|json|배정 조건·시각·seed·사전 결과|필수|탈락/미게시 보존; 실제 실험만 기록'''
rows=[]
for line in definitions.splitlines():
    entity,field,kind,meaning,missing,condition=line.split('|')
    rows.append(dict(entity=entity,field=field,type=kind,definition=meaning,
                     missing=missing,condition=condition,status='제안; 실제 DB 구현/자료 없음'))
assert len({(r['entity'],r['field']) for r in rows}) == len(rows)
save('02_공통데이터사전.csv', list(rows[0]), rows)

tasks=[
('R01','설계','공동 설계·출처 1차 확인','1차 완료','00 문서·01 표본·02 사전','기여/허용 승인 확정은 아님'),
('R02','논문','두 질문의 체계적 문헌/독창성 검토','미실행','교수: 기여 지도와 핵심 이론','초록 확인과 전문 리뷰 구분'),
('R03','접근','플랫폼 경로·보관·파생·학습·반출 허용','미실행','출처별 권한 매트릭스·승인 근거','한국 TikTok 연구 API 자격 제약'),
('R04','참여','연구심의·분리 동의·신규 창작자 모집 계획','미실행','연구/상업학습/사례 선택 구분','신규 계정과 기존 저팔로워 구분'),
('R05','개발','현재 source/rights/weekly와 연구 계약 매핑','미실행','중복 없는 스키마 확장 설계','기존 코드·사용자 자료 보존'),
('R06','개발','어댑터·스냅숏·추출·결측·권리·재실행 시험','미실행','합성 계약 시험과 분리된 실제 증거','API 승인/실수집 완료로 표시 금지'),
('R07','측정','36계정·최대720개 접근/측정 파일럿','미실행','접근 셀·누락·지연·비용 보고','미확보 셀은 미확보로 기록'),
('R08','측정','36개 이중 코딩·코드북 수정','미실행','평가자2명의 원래 라벨·근거·시간','잠근 평가와 수정용 자료 구분'),
('R09','측정','135개 이중 코딩·측정 타당성/신뢰도','미실행','개념별 오차·일치도·신뢰구간','6분 가정27사람시간+관리'),
('R10','표본','표본틀 고정·seed·예비·결과·분석 사전등록','미실행','군집/탈락/분산 기반 표본 산정','900 목표가 검정력 보장 아님'),
('R11','관측','허용 플랫폼부터24주 패널/신규 코호트','미실행','실제 시각과 당시 정보의 종단 기록','현재 누적으로 과거 성장 복원 금지'),
('R12','분석','논문1 적응 경로·조건·민감도','미실행','시간순 관계·대안 설명·검증','고정효과만으로 인과 주장 금지'),
('R13','실험','논문2 적합성 측정·수용자 파일럿/실험','미실행','사전 주요 결과·배정·자극/사람 군집','실험 화면 선택과 실제 성장 구분'),
('R14','엔진','허용 사례 검색/첫 콘텐츠·시리즈 추천','미실행','대상·자료·형식·이유·다음 관측','성장률 숫자 확신 생성 금지'),
('R15','엔진','기준값·회귀/다층·XGBoost 비교','미실행','잠근 새 창작자/미래 평가와 오차','SHAP과 인과 처방 구분'),
('R16','제품','추천 선택/수정/미게시 로그·후속 효과 검증','미실행','후보 전체·ITT·사람시간·채택','2시간 사용성을 성장 검증으로 표시 금지'),
('R17','운영','철회·삭제·반출·재현 패키지 검수','미실행','원문/특징/임베딩/모델의 계보','제한 데이터·키·고객 자료 Git 제외')]
check=[dict(id=i,section=s,task=t,status=st,evidence=e,caveat=c) for i,s,t,st,e,c in tasks]
save('03_실행체크리스트.csv',list(check[0]),check)
print(f'Proposal only: {len(samples)} sampling cells, {len(rows)} field definitions, {len(check)} checklist rows; no collection.')
