from pathlib import Path
import json, html, csv, collections
OUT=Path('outputs');OUT.mkdir(exist_ok=True)
R=[]
def add(group,source,level,rows):
 for line in rows.strip().split('\n'):
  p=line.split('|');assert len(p)==5,(group,line)
  name,inputs,flow,controls,unknown=p
  R.append(dict(id=f'F{len(R)+1:03}',group=group,name=name,level=level,source='https://www.mirra.my'+source,input=inputs,flow=flow,controls=controls,unknown=unknown))
add('01 입력·원문 수집','/en/ai/bulk-link-to-post','화면 확인','''링크에서 콘텐츠 만들기|웹페이지·블로그·상점·뉴스·YouTube URL|주소 입력→Fetch content→수집된 원문을 후속 제작에 사용. 카드뉴스·영상·블로그·게시물로 전환한다고 안내한다.|빈 URL에서는 수집 버튼 비활성. 일부 네이버 블로그는 차단·공개 설정·페이지 구조 때문에 수집 불가 안내.|추출 성공률·본문 정제·표 및 이미지 보존은 실행 미검증.
주제·완성 대본 직접 입력|주제, 설명, 기존 대본|카드뉴스·영상·블로그 각 제작기에 직접 입력할 수 있다. URL 없이도 제작을 시작하는 경로다.|직접 입력과 링크 가져오기 분리.|입력 길이 한도·장문 잘림·다국어 혼합 처리 미검증.
자기 사진·영상 사용|사용자 미디어 파일|제작기에서 파일 선택 후 생성 요청에 포함하는 UI가 있다.|카드뉴스는 사진·영상, 블로그는 이미지, 영상은 이미지·영상 첨부 버튼 확인.|실제 업로드·자동 배치·실패 복구는 미실행.''')
add('01 입력·원문 수집','/en/pdf-to-carousel','공식 설명','''PDF→카드뉴스|보고서·가이드·전자책·슬라이드|문서의 핵심 설명을 카드 단위로 다시 구성하고 편집 가능한 결과로 제공한다고 안내한다.|PDF를 입력원으로 명시.|이번 생성 첫 화면에서 PDF 전용 경로를 확인하지 못함. OCR·페이지 제한·표 추출은 미확인.''')
add('01 입력·원문 수집','/en/youtube-to-cardnews','공식 설명','''YouTube→새 콘텐츠|공개 영상 URL·대상 독자·강조할 내용|추출 내용을 검토하고 카드뉴스 또는 새 짧은 영상으로 재구성한다.|기존 영상의 구간을 잘라주는 클립 편집과 다르다고 명시.|자막 없는 영상·영상 언어·길이 제한·전사 방식 미확인.''')
add('02 기획·참고 조사','/en/ai/bulk-generate','화면 확인','''계정별 콘텐츠 아이디어|SNS 계정·아이디어 출처|계정을 선택하고 제안 요청→아이디어 목록에서 제작 및 사용 상태 관리.|My story / Trending / My files. 연결 계정 없는 현재 상태에서는 Get Suggestions 비활성.|계정 말투 반영 정도·제안 수·실제 추천 품질 미검증.
아이디어 상태 관리|생성된 아이디어|Pending→Draft Generated→Draft Used 세 영역으로 진행 상태를 구분한다.|각 영역의 개수 표시.|거절 상태·일괄 삭제는 API 문서에 별도 존재. 드래그 이동 여부 미확인.''')
add('02 기획·참고 조사','/en/ai/trend-repurpose','화면 확인','''광고 소재 검색|키워드 또는 경쟁사 광고 조건|Ad creatives에서 검색→결과 선택→기획 또는 카드뉴스 원자료로 사용한다.|Keyword search / Competitor ads, 광고 플랫폼, 미디어 유형, 기간. 검색 1크레딧 표시.|데이터 공급자·노출/집행액 범위·성과 좋은 광고 판정 기준 미공개.
인기 게시물 검색|주제·키워드|Viral content에서 검색하고 참고 결과를 후속 제작 입력으로 넘긴다.|Instagram·TikTok·YouTube·Reddit·X·LinkedIn, 기간, Viral score 정렬, 이미지 있는 결과 필터.|viralScore 산식·샘플링·플랫폼별 조회 범위 미공개. 실제 검색은 미실행.
참고 콘텐츠에서 아이디어 만들기|선택한 검색 결과|검색 우측 상세 영역에서 참고 콘텐츠를 기획 또는 카드뉴스 초안의 입력으로 연결한다고 안내.|API에는 원문 URL·작성자·요약·좋아요·댓글·viralScore를 연결하는 필드가 있다.|참고물의 내용을 얼마나 바꾸는지·출처 표시 방식 미검증.''')
add('03 브랜드·디자인 기억','/en/carousel-lab/designs','화면 확인','''참고 이미지로 디자인 학습|이미지 또는 공개 Instagram 게시물 URL|참고물 수집→비율·별도 지시 설정→Generate Template→학습한 디자인 재사용.|최대 10개 PNG/JPG/WEBP. 생성 버튼 5크레딧 표시. 공개 소개의 1–5장과 차이 있음.|이미지 분석 결과 구조·정확도·실제 템플릿 생성 미검증.
디자인 학습의 비율·지시|비율과 사용자 지시문|출력 매체에 맞는 비율을 고르고 추가 요구를 입력한다.|1:1·4:5·16:9·9:16·3:4 및 Custom Instructions.|비율 변경 시 배치 규칙·글자 넘침 처리 미확인.
이미 학습한 디자인 선택|저장된 디자인|Use a learned design으로 재사용 경로를 제공한다.|새 학습과 기존 디자인 선택을 분리.|템플릿 버전 관리·다른 사용자 공유·수정 영향 범위 미확인.''')
add('03 브랜드·디자인 기억','/en/ai/longform?tab=styles','화면 확인','''블로그 문체 학습|스타일 이름·설명·블로그 URL 또는 붙여넣은 글|여러 참고 글을 추가→Analyze Writing Style→저장 스타일을 블로그 작성 때 사용한다.|최소 2개 글을 추가하라는 안내. URL과 본문 모두 추가 가능.|분석 결과의 실제 항목·비용·학습 방식 미확인. 가중치 학습 증거 없음.''')
add('03 브랜드·디자인 기억','/en/help/brand-tone','공식 설명','''계정 말투 조정|말투 규칙·원하는 참고 게시물|구체적인 말투 지침과 예시를 저장해 생성 결과를 조정하도록 안내한다.|짧게·친근하게 등 추상어만 넣기보다 실제 예문 활용 권고.|계정별 설정 화면은 SNS 연결 후 검증 필요.''')
add('04 카드뉴스','/en/carousel-lab/create','화면 확인','''빠른 카드뉴스 생성|주제·대본·가져온 원문|Create Carousel Now에서 입력→AI가 디자인을 선택해 생성하는 경로.|표시 비용 15크레딧. 빈 입력에서는 생성 비활성.|실제 생성 시간·품질·차감은 미검증.
카드뉴스 비율·언어|원문·출력 비율·언어|입력 언어 자동 감지 또는 출력 언어 지정, 비율 선택 후 제작.|빠른 생성 1:1·4:5·9:16. 조사 시 4:5 선택.|학습 화면의 다섯 비율과 빠른 생성의 세 비율을 구분해야 함.
기획 단계 웹 검색|입력 주제·검색 on/off|최신 정보나 특수 주제의 사실을 기획 시 검색하도록 설정.|기본 on. 이후 디자인·이미지 단계에서는 이 웹 검색을 하지 않는다고 안내.|검색 공급자·출처 보존·검색 결과 신뢰도 판정 미확인.
기획 검토 후 제작|초안 기획·검토 여부|Review the plan before building을 켜면 먼저 슬라이드 계획을 검토하는 경로.|조사 시 검토 스위치 off.|기획 화면 자체·수정 가능 필드·확정 후 재생성 비용 미검증.
슬라이드 수 제어|자동 또는 지정 장수|고급 옵션에서 AI 자동 결정 또는 장수를 입력한다.|Auto·감소·숫자 입력·증가.|최소·최대 장수와 장수별 비용 변화 미확인.
템플릿 찾아 생성|검색어·템플릿·비율|Browse Templates→검색 또는 갤러리 선택→해당 디자인으로 제작.|All·Favorites·My Templates, 비율 필터, 새 스타일 학습, 제작 이력에서 가져오기.|전체 템플릿 수는 필터에 따라 달라지므로 고정 총수로 제시하지 않음.
템플릿 즐겨찾기·재사용|기본 템플릿·자기 템플릿·기존 제작물|선호 템플릿을 모으고 이력에서 다시 제작하는 진입점이 있다.|Favorites 버튼·From my history 버튼 확인.|저장·복제 동작은 실행하지 않음.''')
add('04 카드뉴스','/en/editable-carousel-ai','공식 설명','''카드별 시각 편집|생성된 카드|카드 선택→문구·이미지·서체·배치·스타일 조정→출력.|공식 페이지는 텍스트·이미지 교체 및 편집 가능성을 명시.|실제 편집기 미진입. 레이어 선택, undo, 자동 저장, 폰트 한도는 미확인.
Figma 내보내기|생성된 카드뉴스|Figma로 내보내 세부 디자인을 다듬는 경로를 안내.|외부 디자인 도구로 넘기는 기능.|전송 형식·레이어 보존·폰트 대체·Figma 왕복 동기화 미확인.
카드뉴스→Reel|완성된 카드뉴스|전환 효과와 배경음악을 더해 영상으로 변환한다고 안내.|Reels·TikTok·Shorts 용도.|단순 슬라이드 영상과 독립적인 새 영상 생성 경로를 구분. 실제 변환 미검증.''')
add('04 카드뉴스','/en/carousel-lab/history','화면 확인','''카드뉴스 이력|생성한 카드뉴스|History에서 과거 생성물을 다시 찾는 구조.|Refresh·Create Carousel 진입점.|현재 빈 계정이라 이력 항목의 세부 동작 미확인.''')
add('05 영상 제작','/en/video-lab/create','화면 확인','''영상 생성 경로 선택|주제·대본·템플릿|직접 생성, 기존 템플릿 사용, 모션그래픽 제작으로 시작점을 나눈다.|일반 영상과 AI motion graphics는 다른 제작 페이지.|세 경로의 실제 결과 차이 미검증.
대본 다시 쓰기·원문 유지|주제 또는 완성 대본|Auto는 내용을 구성하는 경로, My script as-is는 사용자의 대본을 유지하는 경로.|Auto / My script as-is / My style.|원문 유지 선택 시 문장·발음·숫자의 완전 보존 여부 미검증.
영상 비율·언어|언어·화면 비율|일반 제작 화면에서 언어와 가로·세로 비율을 선택.|UI 16:9·9:16, API는 1:1도 정의.|API 지원 값이 UI에 모두 노출되는 것은 아님.
영상 길이 조절|자동 또는 목표 초 수|자동 길이 또는 슬라이더·숫자로 목표 길이를 지정한다.|UI 1–150초, Set length 최초 60초. 범위 밖은 프롬프트로 요청하라는 안내.|최종 길이는 목표와 다를 수 있음. 긴 영상의 실제 상한 미검증.
영상 사실 검색과 검토|검색·기획 검토 설정|웹 검색은 대본 작성 단계에서 사용. 이후 제작 단계에서는 검색하지 않는다고 안내.|Use web search on, Skip plan review off 상태 확인.|검색된 사실과 영상 소재 검색은 다른 기능.
음성 선택·미리 듣기|언어·음성|음성 목록에서 내레이션 화자를 고르고 샘플을 재생하거나 즐겨찾기에 저장하는 UI.|조사 시 영어 기본 음성 Abby. 여러 화자와 Preview·Favorites 버튼.|언어별 전체 음성 수·발음 품질·유료 공급자 분기 미검증.
내 목소리 학습|본인 음성 자료|Train my voice 진입 시 음성 학습 기능 안내.|현재 체험 계정에서는 Launch 이상 필요 알림 확인.|녹음 길이·학습 시간·샘플 포맷·품질은 유료 경계 뒤.
배경음악 자동 추가|영상 내용·음악 스위치|자동 배경음악 선택을 켜거나 끈다.|Auto background music 기본 on.|곡 선택 기준·음량 자동 조절·음원 권리·음악별 교체 동작 미검증.
자막 핵심어 강조|대본·강조 스위치|AI가 중요한 단어를 선택해 자막에서 강조하도록 설정.|Highlight key caption words 기본 on, off는 균일한 자막.|강조 단어의 선택식·언어별 안정성 미확인.
영상 템플릿 재사용|기본 또는 개인 템플릿·새 내용|기존 영상의 디자인·편집 리듬을 새 입력에 적용.|검색, 시스템/개인 필터, 가로/세로. 조사 시 전체 25개·세로 16개·가로 9개 표시.|조사 시점 목록 수이며 고정 제품 규격 아님.
제작 이력에서 템플릿 만들기|기존 영상 제작물|Make a template from my history 버튼으로 과거 결과를 재사용하는 경로.|기본 템플릿과 개인 템플릿 분리.|이번 계정에 제작 이력이 없어 실제 저장은 미검증.''')
add('05 영상 제작','/en/shorts-lab/create','화면 확인','''모션그래픽 전용 제작|주제 또는 완성 대본|Topic/idea와 Script 중 선택→Content→Media→Style 순서로 구성.|Script 입력과 출력 언어, Next 버튼 확인.|후속 미디어·스타일 옵션과 실제 생성은 미진입. 대본을 넣어야 다음 단계 진행.''')
add('05 영상 제작','/en/video-lab/history','화면 확인','''영상 이력 필터|저장된 영상|검색·비율·상태로 제작물을 찾고 새 영상으로 이동.|Drafts·Completed·Failed, 9:16·16:9, Refresh.|실패 항목 재시도·재렌더 비용은 미확인.''')
add('06 블로그','/en/ai/longform','화면 확인','''글쓰기 톤 선택|주제·기본 또는 저장 문체|새 글에서 기본 톤을 고르거나 학습 스타일을 적용한다.|Default·Professional·Friendly·Casual·Educational·Persuasive.|저장 스타일이 기본 톤을 대체한다고 안내.
블로그 고급 입력|독자·단어 수·검색 키워드·참고 URL·추가 지시|단순 주제 외에 글의 대상·범위·근거를 구체적으로 지정한다.|기본 1,000단어. 참고 URL 최대 3개. 키워드 Enter 추가.|단어 수 실제 상한·한국어 길이 계산·출처 인용 정확도 미확인.
요약·FAQ·팁 구성|구조 옵션|요약, FAQ, 팁 박스 포함 여부를 설정한다.|요약 on, FAQ와 팁 off 상태 관찰.|모든 업종·언어에서의 문서 구조 정확성 미검증.
블로그 CTA|행동 유도 문구·연결 URL|글의 마지막 행동 유도 메시지와 링크를 입력한다.|문구·URL 두 필드.|버튼/텍스트 렌더 형식·링크 검사 미확인.
블로그 진행·기간 필터|제작한 글과 생성일|All·Review Outline·Draft·Editing Complete·Archived·Failed로 구분.|전체·7/30/90일 및 시작/종료 날짜.|빈 계정이라 개별 글 편집·다운로드 미검증.''')
add('06 블로그','/en/api-reference','API 명세','''조사→개요 승인→본문 작성|주제·독자·자료·승인한 목차|백그라운드 조사와 개요 생성→outline_review 대기→사용자가 개요 승인→본문·SEO·이미지 단계 진행→초안/완료.|기본 생성 10크레딧 설명. 상태 조회를 반복해 완료 확인.|요청 성공이 글 완성을 뜻하지 않는다. 실제 생성 미실행.
개요 중복 승인 방지|전체 승인 섹션·선택적 제목|동일 개요 승인은 재작업을 배포하지 않고 인정. 달라진 개요 또는 잘못된 상태는 충돌 응답.|409 OUTLINE_STATE_CONFLICT가 명시됨.|오래된 화면에서 중복 실행되는 것을 막는 구현 단서.
SEO 메타데이터·공유 이미지|본문과 조사 결과|메타 제목·설명·키워드·요약·FAQ·OG 이미지를 결과 필드로 저장한다.|조사 출처와 섹션 이미지의 대안 후보·선택 이미지 구조도 존재.|검색 순위 개선 효과를 보장하는 근거는 아님. WordPress 발행 미지원 명시.''')
add('07 반복 콘텐츠 자동화','/en/ai/agent/automations','화면 확인','''자연어로 반복 제작 계획|무엇을·언제·어떤 형식으로·어디에 전달할지|자연어 요청→Mirr가 계획 작성→계획 검토→실제 샘플 확인 후 시작하는 흐름을 안내.|Beta. 현재 체험 계정 최대 활성 1개. 일시정지는 활성 한도에 미포함.|계획 생성·샘플 비용·반복 실행은 미실행.
자동화 예시 세 가지|매일 인기 뉴스, 마케팅 팁, 하루 여섯 주제|트렌드 쇼츠·웹 검색 없는 카드뉴스·하루 분량 생성 및 분산 예약 예시 제공.|콘텐츠 탐색·생성·전달이 연결된 제품 기능.|예시가 모든 조건에서 성공한다는 뜻은 아님.''')
add('07 반복 콘텐츠 자동화','/en/ai/agent/outputs','화면 확인','''자동화 결과 검토|반복 작업의 산출물|완성 결과를 모아서 확인하고 편집기로 여는 구조.|자동화별·형식별·전달 상태별 필터. 카드뉴스·영상·이미지·텍스트, 발행·예약·이메일·미발행.|이메일 전달의 수신인·포맷·실패 처리 옵션은 미확인.''')
add('08 예약·발행','/en/calendar','화면 확인','''캘린더·목록 관리|콘텐츠·연결 계정·날짜|콘텐츠를 달력 또는 목록으로 보고 주·월 단위 이동.|Calendar/List, Week/Month, 이전/다음 월, Today.|드래그 일정 변경은 공식 소개에 있지만 빈 계정에서 실행 못 함.
새 예약 작성|연결 SNS 계정·원고·미디어·게시 시각|Schedule New Content로 작성기를 열지만 연결 계정이 없으면 계정 연결 안내가 나온다.|현재 환경에서 SNS 연결이 선행 조건.|예약·발행은 실행하지 않음. 실제 타임존·재시도 정책 미검증.''')
add('08 예약·발행','/en/api-reference','API 명세','''게시물 초안·예약·즉시 발행|본문·SNS 계정·미디어·예약 시각|게시물 생성/수정과 예약/즉시 발행 작업을 별도로 제공.|생성 기본 상태 draft, 예약은 scheduled. 계정별 게시물 구조.|SNS별 실제 권한·형식 제한은 별도 확인 필요.
재게시·예약 재게시|이미 발행한 게시물 ID·시간|원 게시물을 재게시하거나 재게시 시각을 예약하는 별도 작업.|즉시 재게시와 예약 재게시 분리.|중복 방지·지원 플랫폼 미검증.
연속 게시물·인용|여러 글 조각·인용할 게시물|스레드 구성 요소의 순서를 저장하고 전체를 교체하는 작업이 있다.|각 조각의 본문·이미지·원 게시물 ID. 인용 후보는 최신/인기 검색.|댓글과 연속 게시물이 각 SNS에서 어떻게 매핑되는지는 실행 미검증.
Instagram 발행 옵션|공동 작업자·위치·첫 댓글|게시물에 플랫폼별 옵션을 붙인다.|shareToFeed, 공동 작업자 최대 3개, 위치 ID/명칭, 첫 댓글.|문서 필드 존재만 확인. 실제 지원 조건은 API 실행 미검증.
TikTok 발행 옵션|공개 범위·상호작용·상업성·사진 표지|댓글·듀엣·스티치 허용과 콘텐츠 유형 관련 옵션을 지정한다.|개인/친구/팔로워/전체 공개 범주, 음악 자동 추가, 표지 사진 인덱스 등.|각 값의 사용 가능 여부는 연결 계정·TikTok 권한에 따라 검증 필요.
YouTube·X 특화 입력|YouTube 제목·공개 상태 또는 X 커뮤니티|플랫폼 특화 게시물 정보를 별도 보존한다.|YouTube public/private/unlisted. twitterCommunityId 필드.|현재 X 신규 연결 버튼 비활성. 문서와 현재 UI 상태 구분.''')
add('09 댓글·DM','/en/engagement/replies','화면 확인','''미응답 댓글 모아보기|SNS 계정·조회 기간|답변할 댓글이 있는 게시물을 모아 보고 AI 답변을 생성하는 화면.|계정·날짜·기답변 포함·정렬·최소 미응답 댓글 수 필터.|현재 SNS 미연결로 실제 목록과 송신 결과 미검증.''')
add('09 댓글·DM','/en/api-reference','API 명세','''AI 답변 작성과 전송 분리|댓글 배열·지시문·계정|AI 답변 생성 작업과 단건/일괄 전송 작업이 나뉜다.|생성 출력은 replies. 전송에는 계정과 답변 목록 필요.|생성만 했다고 자동 전송됐다고 판단하면 안 됨.
조건부 후속 댓글|댓글 본문·조회 임계값 또는 발행 후 시간|조회 수 도달, 시간 경과, 수동 조건에 따른 댓글 생성 경로가 있다.|viewCount/timeBased/manual, viewThreshold, minutesAfterPublish, CTA 템플릿.|플랫폼별 지원·중복 발송 제어 미검증.
CTA 문구 보관함|제목·내용·이미지·선택적 계정|문구 저장·조회·수정·삭제·복제·사용 표시 작업이 있다.|본문과 CTA를 분리해 재사용 가능.|화면 진입점은 이번 계정에서 확인 못 함.
외부 Threads 검색·대화|검색어·계정·외부 미디어 ID|외부 Threads를 TOP/RECENT로 검색하고 답글 또는 재게시하는 작업 정의.|검색과 답글·재게시가 각각 별도 작업.|실행하지 않음. 외부 커뮤니케이션은 사용자 승인하에 동작하도록 설계 필요.''')
add('09 댓글·DM','/en/automation/dm','화면 확인','''댓글→DM 자동화 만들기|연결 계정·대상 게시물·키워드·DM 내용|1 게시물 선택→2 키워드→3 메시지 작성. 오른쪽에서 DM 흐름 미리보기.|Instagram·Facebook 지원 문구. SNS 계정 선택 없으면 Next 비활성.|현재 Facebook 신규 연결은 비활성. 후속 키워드 일치 규칙·메시지 옵션 미진입.''')
add('09 댓글·DM','/en/instagram-auto-dm','공식 설명','''공개 답글과 DM 함께 보내기|댓글 키워드·공개 답글·DM|조건에 맞는 댓글에 공개 답글과 DM을 함께 보내는 흐름 안내.|링크·자료·쿠폰 전달 용도.|지연·전송 순서·중복 댓글·실패 시 보상 처리 미확인.''')
add('09 댓글·DM','/en/keyword-dm-automation','공식 설명','''키워드별 다른 메시지|여러 키워드와 메시지 매핑|이벤트·자료·쿠폰·문의별 서로 다른 메시지를 연결한다.|여러 캠페인 동시 운영 안내.|부분일치/완전일치·대소문자·다중 키워드 충돌 우선순위 미확인.''')
add('09 댓글·DM','/en/instagram-dm-auto-reply','공식 설명','''반복 DM 질문 자동 응답|FAQ 질문과 답|반복 질문을 등록하고 매칭되는 DM에 지정 답변을 보내는 흐름.|통합 받은편지함 안내.|현재 계정에서 해당 상세 UI 미확인. 자유 대화형 상담봇으로 단정 불가.''')
add('09 댓글·DM','/en/automation/dm/activity','화면 확인','''DM 실행 로그·성과|자동화 발동 및 송신 이벤트|Triggered/Sent/Failed/Success Rate 확인, 상태와 기간으로 기록 검색.|프로젝트/워크스페이스, All/Sent/Waiting/Failed, 게시물 필터, 사용자명·댓글 검색.|현재 0건인데 성공률 100% 표시. 실제 신뢰도 증거로 해석하면 안 됨.''')
add('10 성과·학습','/en/analytics','화면 확인','''통합 성과 분석 화면|연결 SNS 계정·기간|계정과 기간을 선택해 성과를 보고 비교·차트·내보내기를 설정.|기간, 비교 모드, Visibility 지표, Chart Type, Export.|SNS 미연결로 값이 있는 차트와 파일 형식 미검증.
성과 질의 AI Insights|분석 데이터·사용자의 질문|데이터에 근거한 질의를 통해 개인화된 인사이트를 받는 진입점.|AI Insights 버튼 확인.|추천 정확도·대화 기억·추천이 다음 생성에 자동 적용되는지 미검증.''')
add('10 성과·학습','/en/api-reference','API 명세','''노출 지표 정규화|플랫폼별 조회·노출·도달·반응|응답에 visibility와 visibilityMetricType을 함께 둬 지표 의미를 표시한다.|views/impressions/reach/unknown. 저장·좋아요·답글·재게시·인용·공유·갱신시각 포함.|플랫폼별 정의 차이가 사라지는 것은 아님. 누락값과 0을 구분해야 함.
기간 비교·팔로워 추이|현재 기간·비교 기간·계정|게시물 성과 합계·평균·게시물 수, 절대 변화·백분율 변화 비교와 팔로워 이력 조회.|이전 기간·전년·전월·전주·사용자 지정 비교.|표본·광고·계정 규모에 의한 차이를 통제한 인과분석은 아님.
계정 분석 리포트|선택적 계정 ID|보고서 생성 요청 후 보고서 ID로 결과 조회.|크레딧 표에서 계정 분석 리포트 3크레딧 안내.|출력 항목·파일 형식·품질 미검증.
계정 지식자료 관리|문서 파일·계정|서명 업로드 주소 발급→파일 업로드→처리 요청→지식 목록 조회 또는 원파일 기준 삭제.|기획 요청은 selectedKnowledgeIds를 참조할 수 있음.|청크 분할·임베딩·검색·재랭킹 알고리즘은 공개하지 않음.
계정별 생성 규칙 저장|콘셉트·독자·문체·참고 글·발행 시간|계정 설정에 생성 규칙을 보관하고 자동 생성·발행 설정을 연결.|문장 길이 5단계, 하루 1–5개, 참고 글, 자동/고정 카드 템플릿, 게시 시각.|과거 방식과 신규 자동화의 관계·현재 UI 노출 범위 미확인.''')
add('11 링크 페이지','/en/page','화면 확인','''프로필 링크 페이지 생성|페이지 주소와 이후 추가할 링크|주소 설정→Create page→여러 링크를 모으는 페이지 구성 경로.|mirra.my/@handle 형태. 소문자·숫자·하이픈·밑줄만 허용.|공개 페이지를 생성하지 않았음. 디자인·통계·폼·도메인 연결 등 후속 기능 미확인.''')
add('12 계정·팀·자산','/en/social-accounts/new','화면 확인','''SNS 연결|플랫폼 계정과 OAuth 권한|연결할 플랫폼 선택→해당 서비스 승인 경로로 이동하는 UI.|Instagram·TikTok·YouTube·Threads 활성, LinkedIn·Facebook·X 비활성 관찰.|실제 연결은 미실행. 비활성 원인이 요금제·지역·일시 중단 중 무엇인지는 미확인.''')
add('12 계정·팀·자산','/en/settings/workspace','화면 확인','''팀원·역할 관리|초대 이메일·Editor/Admin|워크스페이스에 팀원을 추가하고 역할별 권한을 관리한다.|Admin: 구조 변경·협업자·권한·일괄 삭제. Editor: 제작·편집·AI·분석, 구조 삭제 불가.|초대 메일·권한 변경은 실행하지 않음.
브랜드 로고 보관|로고 이미지|Logos 탭에서 파일 선택 또는 드래그 업로드하고 카드뉴스에 재사용.|투명 PNG·너비 200–400px 권장.|형식별 실제 제한·로고 위치 자동화 미확인.
워크스페이스 관리|이름·프로젝트·멤버|워크스페이스별로 제작물·계정·구독을 구분하는 구조.|이름 수정 진입점, Workspace management, 구독 관리, 삭제 버튼.|새 프로젝트 생성·이동·삭제·다른 팀 공유는 실행하지 않음.
이벤트 알림 설정|이메일 알림 선호|자동 생성 완료·발행·예약·Shorts 렌더 완료·크레딧 경고를 선택.|각 스위치. AI credits reach 90% or more 문구는 잔액/사용률 의미가 모호.|설정 저장 동작·실제 이메일 발송 미검증.''')
add('12 계정·팀·자산','/en/settings/account','화면 확인','''로그인 방식 연결|Google·Kakao·비밀번호|연결된 로그인 방법을 보고 다른 방법 추가 및 비밀번호 설정 경로 제공.|Google 연결 상태, Kakao 버튼, Set Password Login, Change password.|연결·비밀번호 변경은 미실행.
제품 언어 선택|UI 표시 언어|계정 설정에서 표시 언어를 고른다.|한국어·영어·일본어·번체중국어·스페인어·포르투갈어·아랍어·프랑스어·독일어.|생성 출력 언어와 별도 설정. 사용자 선호는 변경하지 않음.
로그아웃·회원 탈퇴|현재 계정|브라우저 로그아웃과 영구 계정 삭제 진입점 제공.|삭제 시 계정과 생성물이 영구 삭제된다는 안내.|실행하지 않음. 데이터 정리 실제 수행은 정책 수준으로만 확인.''')
add('13 구독·크레딧','/en/settings/plan','화면 확인','''체험 기간과 사용량|워크스페이스 이용권|기간·크레딧·연결 계정·좌석·자산·템플릿·자동화 사용량을 보여준다.|관찰 당시 7일 체험, 60크레딧, 계정 5개·좌석 3개·자산 100개·템플릿 40개 한도.|체험 한도를 영구 무료 요금제 한도로 혼동하지 않아야 함.
구독 변경·월/연 결제|선택 요금제와 주기|월별·연간 선택과 Subscribe 진입점, 구독/영수증 관리 설명 제공.|조사 시 월 19/49/99/199달러, 연간 20% 할인 표시.|결제 흐름 미실행. 세금·통화·지역별 실제 결제 금액은 확인 필요.
크레딧 사용 기록|생성 및 사용 내역|Credit history에서 언제 어떤 기능에 사용했는지 조회하는 경로.|잔액 표시와 기능별 단가 안내 링크.|실패 차감 복구·구매 크레딧 차감 우선순위 미검증.''')
add('13 구독·크레딧','/en/pricing/credits','화면 확인','''기능별 크레딧 단가|실행 기능|기능마다 정해진 사용량을 차감하는 모델.|아이디어 제안 Free 한정 5, 텍스트 2, 댓글 1, 분석 3, 카드뉴스 15, 블로그 10, 영상 15. AI 수정 포함 안내.|500크레딧 약 100개 예시는 과거 영상의 텍스트 5크레딧 설명과 일치한다. 현재 화면의 2크레딧과 시점 차이 가능성이 있으며 실제 차감 확인 필요.''')
add('13 구독·크레딧','/en/pricing','공식 설명','''추가 사용량·크레딧 정책|추가 계정·좌석·자동화·생성량|기본 요금 외 사용량을 별도로 계산한다.|월 포함 크레딧은 이월하지 않으며 별도 구매분은 월 초기화와 분리된다고 안내.|자동 충전·초과 사용의 실제 설정 화면과 차감 순서는 미확인.''')
add('14 API·MCP','/en/settings/developer','화면 확인','''API 키와 REST 문서|워크스페이스·API 키|키 목록·Create Key·API 문서 연결 제공.|키를 만들지 않고 문서만 조사. 문서상 Bearer 인증.|정확한 요금제 조건은 API 문서의 Standard와 현 요금표가 불일치.
원격 MCP·로컬 MCP 연결|MCP 클라이언트·워크스페이스 권한|원격 OAuth 연결을 기본으로 안내하고 로컬 파일 접근이 필요한 경우 로컬 API 키 설치를 안내.|원격 주소 /api/mcp. Claude Desktop/Code, Cursor, VS Code, Windsurf, Gemini CLI 탭.|권한 발급·MCP 설치·실제 도구 호출은 미실행. REST 작업 수와 MCP 도구 수는 다름.''')
add('15 유입·제휴','/en/partnership','공식 설명','''추천 링크와 보상|추천인 링크·신규 사용자의 유료 전환|추천 추적→체험 혜택→첫 유료 추천 크레딧→추가 유료 추천 수에 따른 수익 배분.|친구 체험 3일·50크레딧 추가, 첫 유료 추천 250크레딧. 이후 20/25/30% 단계.|정산은 보류 기간·구독 조건 적용. 실제 추천·정산 실행 미검증.
공개 소개·도움말·문의|방문자와 검색 유입|형식·채널·업종별 랜딩, 샘플 전환, FAQ, 블로그·도움말·문의 경로로 제품 유입.|업종 페이지가 반드시 독립된 업종 모델을 뜻하지 않음.|다양한 랜딩페이지의 기능명을 각각 독립 제품 기능으로 중복 계산하지 않음.''')
Path('work/features.json').write_text(json.dumps(R,ensure_ascii=False,indent=2))
print('FEATURE RECORDS',len(R))
# 추가로 직접 연 템플릿 편집기와 명세의 내부 동작
add('04 카드뉴스','/en/carousel-lab/create','화면 확인','''기본 템플릿을 개인 템플릿으로 편집|기본 디자인|템플릿 상세의 Edit로 페이지별 편집기를 연다. 기본 템플릿을 수정하면 새 My Template을 만든다고 안내.|예시 결과와 Design Structure 탭 분리. 조사한 예시는 구조 6페이지.|수정·Save Changes는 실행하지 않음.
텍스트·이미지·로고·영상 요소 추가|추가할 요소 유형|Add element에서 네 가지 요소 유형을 선택하는 메뉴 제공.|Text·Image·Logo·Video.|실제 요소 삽입·저장·출력은 미실행.
레이어 선택·순서·복제|페이지의 요소|Layers에서 문구·이미지를 구분해 선택. 앞/뒤 이동·맨 앞/맨 뒤·복제·삭제 버튼 제공.|겹침 순서를 제어하는 시각 편집기.|생성 결과 편집기와 템플릿 편집기의 모든 기능이 같은지는 미확인.
서체·글자 크기·색상|선택 텍스트|글자별 서체 선택·전체 페이지 서체 적용·크기 숫자 입력·색상 설정.|Size 프리셋 12·16·20·24·32·40·48·64·80·96. 현재 서체 Noto Sans KR 관찰.|프리셋이 입력 상한은 아님. 사용자 폰트 업로드는 가격표에만 확인.
문자 강조·정렬|선택 텍스트|두께·기울임·밑줄·취소선·대소문자·좌/중/우 정렬 UI.|Regular부터 Black까지 두께 선택.|선택된 텍스트 범위와 요소 전체 적용 차이는 미검증.
자간·행간|선택 텍스트|Spacing과 Line Height 숫자를 각각 조절한다.|증가/감소 및 숫자 입력.|실제 줄바꿈·자동 넘침 보정은 미검증.
이미지 속성|선택 이미지|Replace와 More에서 이미지 교체·모서리·투명도 설정 경로.|모서리 기본·0/4/8/12/16/24px·원형. 투명도 기본·100–30% 프리셋.|자르기·배경 제거 여부 미확인.
실행 취소·저장 상태|편집 동작|Undo·Redo·Done 및 Saved 상태 표시.|페이지 간 이동도 제공.|실제 저장 시점·네트워크 끊김 복구·버전 수는 미검증.
자연어 AI 디자인 수정|디자인 수정 지시|AI Designer에 변경 요청을 넣고 배경·글자·배치 등을 바꾸는 경로.|밝게/어둡게·따뜻하게/차갑게·글자 크게/작게, 이미지도 교체 스위치.|이번에는 지시 입력·실행 안 함. 수정 품질과 차감은 미검증.''')
add('05 영상 제작','/en/api-reference','API 명세','''영상 초안·확정·MP4 렌더 분리|프롬프트·검토된 문서|reviewBeforeFinalize=true로 대본/장면 초안→검토→finalize로 음성/소재 작업→render로 MP4 제작.|기본 확정 15크레딧. 전달된 브랜드 AI 이미지/영상 옵션 15/30 추가 설명.|무료 초안 문구는 API 명세 기준. UI 실제 차감은 미검증.
영상 문서의 편집 가능한 구조|장면·텍스트·미디어·트랙|MP4 외에 장면·자산·위치·시간·음성·스타일을 구조화된 문서로 저장한다.|이미지·영상·음성·텍스트·도형·아바타·차트·컴포넌트 자산 종류.|필드 존재는 해당 UI 기능을 모두 사용할 수 있다는 보장이 아님.
말 길이와 장면 길이 충돌 처리|대본·목표 길이·음성|문서에 음성 기준/고정/비율 길이 정책과 초과 처리 정책이 정의돼 있다.|speed-up·trim-script·extend-scene. 장면별 발화 속도 0.85–1.25 범위 정의.|어떤 상황에 어느 정책을 고르는지와 실제 동기화 품질 미공개.
AI 수정의 충돌 방지|수정 지시·문서 버전·확인 여부|검증된 수정 계획을 원자적으로 적용한다고 명시. 오래된 버전에 대한 변경을 식별할 수 있는 입력이 있다.|expectedUpdatedAt·문서 fingerprint·confirmed·이미지 교체 허용·전체/장면 범위.|실제 충돌 응답·롤백·보존 수준 미검증.
렌더 진행·실패 확인|생성물 ID|가벼운 상태 조회와 전체 문서 조회 분리. completed이면서 URL이 있어야 결과 사용.|실패 시 renderError 확인. 저장된 영상은 Remotion Lambda 백그라운드 렌더 설명.|평균 처리 시간·동시성·재시도 횟수 미공개.
영상 미디어 출처 제어|검색/개인 자료/브랜드 AI 자료|인터넷·상용 자료·브랜드 생성 이미지·브랜드 생성 영상·개인 미디어의 선택 필드.|개인 미디어 최대 30개, 브랜드 참고 이미지 최대 3개, 장면별 후보 1–6개.|어떤 UI에서 선택 가능한지와 공급자별 품질은 미검증.
자막·전환·차트 구조|영상 스타일 토큰|자막 프리셋·장면 전환·테마를 구조화해 저장. 막대·도넛·선 차트 자산도 정의.|스타일은 서체·강조색·배경색·자막·전환으로 표현.|문서 구조가 자체 신경망 학습을 뜻하지 않음. 차트 UI는 미확인.''')
for r in R:
 if r['name']=='카드별 시각 편집':
  r['unknown']='기본 템플릿 편집기는 후속 조사에서 직접 확인함. AI 생성 결과의 내보내기·실제 수정 저장은 미검증.'
R.sort(key=lambda r:(r['group'],int(r['id'][1:])))
for i,r in enumerate(R,1):r['id']=f'F{i:03}'
Path('work/features.json').write_text(json.dumps(R,ensure_ascii=False,indent=2))
print('FINAL FEATURES',len(R))
for r in R:
 if r['name']=='모션그래픽 전용 제작':
  r['flow']='주제/대본 선택→Content에서 입력→Media에서 AI 준비 또는 자기 자료 선택→Style에서 비율·디자인 방향 선택→장면 기획 생성.'
  r['controls']='9:16·16:9·1:1, Auto 또는 Custom Prompt. 비민감 예시 대본으로 세 단계 확인.'
  r['unknown']='장면 기획 생성·완성 영상은 미실행. 고급 옵션을 펼쳤으나 추가 필드는 보이지 않았음.'
# OpenAPI 작업 목록을 사실 필드 중심으로 재구성. 원문 전체를 배포하지 않는다.
API=json.load(open('work/customer-openapi.json'))
titles='''영상 검토용 문서 생성
검토한 영상 초안 확정
영상 문서 MP4 렌더
영상 제작 이력 조회
AI 없이 빈 영상 또는 원본 영상 문서 생성
저장된 영상 문서 조회
영상 문서 저장·수정
영상 문서 삭제
영상 렌더 상태 조회
검토 중 영상 초안 수정
자연어로 영상 문서 수정
영상 템플릿 목록
영상 문서를 템플릿으로 저장
템플릿으로 영상 생성
영상 스타일 목록
영상 스타일 생성 — 관리자 한정
블로그 목록 조회
블로그 조사·개요 생성 시작
블로그 내용·진행 조회
블로그 본문·메타데이터 수정
블로그 삭제
블로그 개요 승인·본문 작성 시작
계정 인사이트 조회
팔로워 이력 조회
게시물 인사이트 조회
게시물 지표 동기화
게시물 성과 및 기간 비교
전체 계정 통계
댓글의 AI 답변 생성
댓글 답변 일괄 전송
댓글 답변 스냅샷 다운로드
댓글 답변 단건 전송
미응답 댓글이 있는 게시물 조회
게시물 댓글 조회
게시물 댓글 생성
즉시 수동 댓글 게시
조건부 댓글 예약
URL 기반 게시물 생성
URL 원문 추출
기존 AI 콘텐츠 수정
AI 텍스트 콘텐츠 생성
아이디어 목록 조회
콘텐츠 아이디어 생성
아이디어 일괄 삭제
아이디어 상세 조회
아이디어 사용 표시
아이디어 삭제
아이디어 상태 변경
아이디어의 콘텐츠 조회
아이디어에서 콘텐츠 제작
CTA 템플릿 목록
CTA 템플릿 저장
CTA 템플릿 상세
CTA 템플릿 수정
CTA 템플릿 삭제
CTA 사용 표시
CTA 템플릿 복제
게시물 목록 조회
게시물 초안·예약 생성
게시물 상세 조회
게시물 수정
게시물 삭제
스레드 구성 글 조회
스레드 구성 글 전체 교체
인용 가능한 게시물 검색
게시물 예약
게시물 재게시
게시물 재게시 예약
게시물 즉시 발행 작업 시작
계정 보고서 생성
계정 보고서 조회
연결 SNS 계정 전체 목록
SNS 계정 조회
계정 지식자료 조회
지식자료 업로드 주소 발급
업로드한 지식자료 처리
원파일 기준 지식자료 삭제
계정 게시물 조회
계정 생성·발행 설정 조회
계정 생성·발행 설정 수정
외부 Threads 검색
외부 Threads 답글
외부 Threads 재게시'''.splitlines()
operations=[]
def schema_brief(s):
 if not s:return '명세에 상세 타입 없음'
 typ=s.get('type') or ('선택형' if 'oneOf'in s or 'anyOf'in s else '복합형')
 if typ=='array':typ+='['+s.get('items',{}).get('type','복합형')+']'
 cons=[]
 for k,label in [('enum','허용'),('minimum','최소'),('maximum','최대'),('minItems','최소 항목'),('maxItems','최대 항목'),('minLength','최소 길이'),('maxLength','최대 길이'),('default','기본'),('format','형식')]:
  if k in s:cons.append(label+': '+str(s[k]))
 if s.get('nullable'):cons.append('null 허용')
 return typ+(' / '+'; '.join(cons) if cons else '')
def flatten_fields(s,prefix='',depth=0):
 rows=[]
 for k,v in s.get('properties',{}).items():
  nm=prefix+k
  rows.append((nm,'필수' if k in s.get('required',[]) else '선택',schema_brief(v)))
  if depth<1 and k not in ['document','plan']:
   if v.get('type')=='object':rows+=flatten_fields(v,nm+'.',depth+1)
 return rows
for path, methods in API['paths'].items():
 for method,o in methods.items():
  if method not in ['get','post','put','patch','delete']:continue
  idx=len(operations)
  request=o.get('requestBody',{}).get('content',{}).get('application/json',{}).get('schema',{})
  params=[(a.get('name',''), '필수' if a.get('required') else '선택',a.get('in','')+' / '+schema_brief(a.get('schema',{}))) for a in o.get('parameters',[])]
  responses=[]
  for status,res in o.get('responses',{}).items():
   for mime,c in res.get('content',{}).items():
    s=c.get('schema',{});keys=list(s.get('properties',{}));responses.append(status+' '+mime+' / '+(', '.join(keys) if keys else schema_brief(s)))
  operations.append(dict(id=f'A{idx+1:03}',name=titles[idx],method=method.upper(),path=path,group=o.get('tags',['Other'])[0],fields=params+flatten_fields(request),responses=responses))
assert len(operations)==len(titles)==83
apim=['# Mirr 고객 API 작업 부록','2026-09-28 공개 명세 조사. 총 83개는 메서드+경로 조합 수이며, 화면 기능 수나 MCP 도구 수와 다르다. 호출 성공을 검증한 목록이 아니다.','출처: [API 문서](https://www.mirra.my/en/api-reference), [공개 OpenAPI](https://www.mirra.my/api/v1/customer-openapi.json).','Bearer API 키 인증을 사용하는 명세다. 문서의 Standard 이상 조건과 현재 요금제 명칭은 다르므로 실제 이용 자격은 확인해야 한다. 입력 표의 필수/선택은 스키마 표기이며, 별도 비즈니스 검증 조건이 있을 수 있다. document와 plan의 대형 중첩 구조는 핵심 구조 설명으로 대체했다. 응답 예시는 실제 실행 결과가 아니다.']
for a in operations:
 apim+=['',f"## {a['id']} {a['name']}",f"`{a['method']} {a['path']}` · {a['group']}",'']
 if a['fields']:
  apim+=['| 입력 | 구분 | 타입·범위 |','|---|---|---|']+[f'| {x} | {y} | {z} |' for x,y,z in a['fields']]
 else:apim+=['이 작업은 별도 입력 본문이 없거나 명세가 입력 세부사항을 생략한다. 상세 입력 없음과 입력 불필요를 동일시하지 않는다.']
 apim+=['','응답 명세: '+' / '.join(a['responses'])]
api_md='\n'.join(apim)
(OUT/'Mirr_API_83개_작업.md').write_text(api_md)
# 읽기 쉬운 본문 + 항목별 조사 기록
base=Path('work/analysis.md').read_text()
moat=Path('work/moat.md').read_text()
yt_text=Path('outputs/Mirr_영상분석_보완보고서.md').read_text()
yt_rows=json.loads(Path('work/youtube/supplement.json').read_text())
yt_map={r['id']:[y for y in yt_rows if r['id'] in y['ids'].split()] for r in R}
md=[base,'\n## 세부 기능 대장\n','현재 정리된 항목은 '+str(len(R))+'개다. 한 제품 기능의 옵션이나 단계도 별도 항목으로 나누었으므로 독립된 제품 모듈 개수가 아니다.\n']
last=''
for r in R:
 if r['group']!=last:md+=['\n## '+r['group']];last=r['group']
 md += [f"\n### {r['id']} {r['name']}",f"근거 수준: **{r['level']}** · [확인 위치]({r['source']})",f"- 입력: {r['input']}",f"- 작동·출력: {r['flow']}",f"- 설정·조건: {r['controls']}",f"- 미확인·한계: {r['unknown']}"]
md+=['\n---\n',moat,'\n---\n',yt_text]
(OUT/'Mirr_기능해부_상세보고서.md').write_text('\n'.join(md))
with (OUT/'Mirr_기능대장.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.writer(f);w.writerow(['ID','분류','기능','근거 수준','입력','작동·출력','설정·조건','미확인·한계','근거 URL','영상 보완 ID','영상 근거','영상 보완 설명'])
 for r in R:w.writerow([r[k] for k in ['id','group','name','level','input','flow','controls','unknown','source']]+[' / '.join(y['id'] for y in yt_map[r['id']]),' / '.join(y['evidence'] for y in yt_map[r['id']]),' / '.join(y['flow'] for y in yt_map[r['id']])])
# 작은 Markdown 렌더러: 이 보고서에 쓰인 문단·목록·표·링크만 지원.
import re
def inline(t):
 t=html.escape(t)
 t=re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)',r'<a href="\2" target="_blank" rel="noopener">\1</a>',t)
 t=re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',t)
 t=re.sub(r'`([^`]+)`',r'<code>\1</code>',t)
 return t
def render_md(text):
 out=[];lines=text.splitlines();i=0
 while i<len(lines):
  l=lines[i].strip()
  if not l:i+=1;continue
  if l.startswith('|'):
   rows=[]
   while i<len(lines) and lines[i].strip().startswith('|'):
    a=[x.strip() for x in lines[i].strip().strip('|').split('|')]
    if not all(re.fullmatch(r'[-: ]+',x) for x in a):rows.append(a)
    i+=1
   out.append('<div class="tablewrap"><table><thead><tr>'+''.join('<th>'+inline(x)+'</th>' for x in rows[0])+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+inline(x)+'</td>' for x in rr)+'</tr>' for rr in rows[1:])+'</tbody></table></div>');continue
  h=re.match(r'^(#{1,3}) (.+)',l)
  if h:out.append(f'<h{len(h[1])}>{inline(h[2])}</h{len(h[1])}>')
  elif l.startswith('- '):out.append('<p class="bullet">• '+inline(l[2:])+'</p>')
  else:out.append('<p>'+inline(l)+'</p>')
  i+=1
 return ''.join(out)
style='''*{box-sizing:border-box}body{margin:0;color:#1d2836;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;line-height:1.75}header{background:#152b3b;color:white;padding:46px max(24px,calc((100vw - 1150px)/2))}header h1{margin:0;font-size:34px}header p{color:#d2e5ed;max-width:900px}nav{display:flex;gap:16px;flex-wrap:wrap;margin-top:20px}nav a{color:white;text-decoration:none;border-bottom:1px solid #739cad}main{max-width:1200px;margin:auto;padding:24px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.stat{background:white;border:1px solid #dfe6eb;padding:20px;border-radius:12px}.stat b{display:block;font-size:28px;color:#17686b}.stat span{font-size:13px;color:#536577}section{scroll-margin-top:16px;background:white;border:1px solid #dfe6eb;border-radius:14px;padding:30px;margin:24px 0}h2{font-size:24px;margin-top:36px}h3{font-size:19px}p{max-width:1000px}a{color:#006e88}code{font-size:12px;background:#eef3f5;padding:3px;overflow-wrap:anywhere}.tablewrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;border-bottom:1px solid #dce4ea;padding:12px;vertical-align:top}th{background:#edf4f6}.controls{position:sticky;top:0;background:#fff;padding:16px 0;z-index:3;display:flex;gap:10px;flex-wrap:wrap}input,select{font:inherit;padding:10px;border:1px solid #a9bdc8;border-radius:8px}input{flex:1;min-width:240px}details{border:1px solid #d7e2e8;border-radius:10px;margin:12px 0;overflow:hidden}summary{cursor:pointer;list-style:none;padding:18px;background:#f8fafb;display:flex;gap:12px;align-items:center;flex-wrap:wrap}summary:hover{background:#edf4f6}.badge{font-size:12px;padding:3px 9px;border-radius:20px;background:#e2eef2;color:#1f5867}.id{font-family:monospace;color:#687987;font-size:13px}.body{padding:0 22px 20px}.body dl{display:grid;grid-template-columns:100px 1fr;gap:10px}.body dt{font-weight:700}.body dd{margin:0}.limit{background:#fff8e8;border-left:4px solid #c9a14a;padding:12px 16px}.minor{font-size:13px;color:#667b88}.group{font-size:22px;border-bottom:2px solid #dce8eb;padding-bottom:10px}.hide{display:none!important}button{font:inherit;cursor:pointer;padding:10px 15px;background:#e8f1f4;border:1px solid #a9bdc8;border-radius:8px}footer{padding:30px;text-align:center;color:#59707d}@media(max-width:650px){main{padding:12px}section{padding:18px}.stats{grid-template-columns:1fr 1fr}header h1{font-size:26px}.body dl{grid-template-columns:1fr}.body dt{margin-top:12px}}@media print{nav,.controls{display:none}section{break-inside:auto}details{break-inside:avoid}body{background:white}}'''
counts=collections.Counter(r['level'] for r in R)
head=f'''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mirr 기능 해부 · 영상 보완 2026-09-29</title><style>{style}</style><header><div class="minor" style="color:#b9d5df">PRODUCT RESEARCH · 2026.09.28 / VIDEO UPDATE · 2026.09.29</div><h1>Mirr의 기능과 노하우를 펼쳐보기</h1><p>같은 동작을 구현하는 것과 같은 품질을 내는 것은 별도 과제다. 실제 화면, 공식 설명, API 명세를 구분해 조사했다.</p><nav><a href="#youtube">영상 보완 35개</a><a href="#analysis">해석과 작동 흐름</a><a href="#features">세부 기능 {len(R)}개</a><a href="#api">API 작업 83개</a><a href="#moat">노하우·재현 가능성</a><a href="#sources">출처·범위</a></nav></header><main><div class="stats"><div class="stat"><b>{len(R)}</b><span>세부 기능·옵션 항목</span></div><div class="stat"><b>83</b><span>REST 명세 작업 · 실행 미검증</span></div><div class="stat"><b>71</b><span>공개 URL 수집 · 중복·리디렉션 포함</span></div><div class="stat"><b>15</b><span>기능 분류</span></div></div><p class="limit">로그인 후 메뉴·입력·템플릿 편집기를 직접 확인했다. AI 생성·유료 결제·SNS 연결·실제 게시와 메시지 전송은 실행하지 않았다. 109개와 83개는 겹치므로 합산하지 않는다.</p><p class="limit"><b>2026-09-29 보완:</b> 공식 튜토리얼·웨비나 6편 약 190분의 자동 자막을 읽고 중복을 합친 35개 보완 기록을 연결했다. <a href="#youtube">영상 근거·구현 제안·완료 테스트 보기</a>. 35개는 기존 기능과 겹친다.</p><section id="analysis">{render_md(base)}</section><section id="features"><h2>기능 대장</h2><p>화면 확인은 해당 UI와 설정의 존재를 확인했다는 뜻이다. 실제 처리 성공 또는 품질을 보장하지 않는다. 각 항목을 펼치면 입력, 처리, 조건, 미검증 범위를 볼 수 있다.</p><div class="controls"><input id="q" aria-label="기능 검색" placeholder="기능·입력·옵션·미확인 내용 검색"><select id="group" aria-label="기능 분류"><option value="">모든 분류</option>{''.join('<option>'+html.escape(g)+'</option>' for g in sorted(set(r['group'] for r in R)))}</select><select id="level" aria-label="근거 수준"><option value="">모든 근거</option>{''.join('<option>'+x+'</option>' for x in counts)}</select><button id="expand">검색 결과 펼치기</button></div><p id="count" class="minor"></p>'''
parts=[head]
for r in R:
 search=' '.join(str(v) for v in r.values())+' '+' '.join(y['name']+' '+y['flow'] for y in yt_map[r['id']])
 parts.append(f'<details class="feature" data-group="{html.escape(r["group"])}" data-level="{r["level"]}" data-search="{html.escape(search.lower(),quote=True)}"><summary><span class="id">{r["id"]}</span><strong>{html.escape(r["name"])}</strong><span class="badge">{r["level"]}</span><span class="minor">{r["group"]}</span></summary><div class="body"><dl>')
 for k,label in [('input','입력'),('flow','작동·출력'),('controls','설정·조건'),('unknown','미검증 범위')]:parts.append('<dt>'+label+'</dt><dd>'+html.escape(r[k])+'</dd>')
 parts.append('</dl>'+''.join('<p class="limit"><a href="#'+y['id']+'">'+y['id']+' '+html.escape(y['name'])+'</a><br>'+html.escape(y['flow'])+'<br><span class="minor">영상 자동 자막 근거 · 직접 실행 검증과 구분</span></p>' for y in yt_map[r['id']]))
 parts.append(f'<a href="{html.escape(r["source"])}" target="_blank" rel="noopener">원본 확인 위치 ↗</a></div></details>')
parts.append('</section><section id="api"><h2>API 명세의 83개 작업</h2><p>화면에서 숨겨진 구조를 보충한다. 실제 호출은 하지 않았다. 입력 표는 명세의 필수 필드·타입·선택값을 정리했고, 대형 문서 구조는 본문에서 설명했다. <a href="Mirr_API_83개_작업.md">Markdown 부록</a></p>')
for a in operations:
 parts.append('<details class="api"><summary><span class="id">'+a['id']+'</span><strong>'+html.escape(a['name'])+'</strong><span class="badge">'+a['method']+'</span><span class="minor">'+a['group']+'</span></summary><div class="body"><p><code>'+a['method']+' '+html.escape(a['path'])+'</code></p>')
 if a['fields']:parts.append('<div class="tablewrap"><table><tr><th>입력</th><th>구분</th><th>타입·범위</th></tr>'+''.join('<tr>'+''.join('<td>'+html.escape(x)+'</td>' for x in row)+'</tr>' for row in a['fields'])+'</table></div>')
 else:parts.append('<p>별도 입력 본문이 없거나 명세에서 상세 입력을 생략했다.</p>')
 parts.append('<p><b>응답 명세</b> '+html.escape(' / '.join(a['responses']))+'</p></div></details>')
yt_html=render_md(yt_text)
for y in yt_rows:yt_html=yt_html.replace('<h3>'+y['id']+' ', '<h3 id="'+y['id']+'">'+y['id']+' ')
parts.append('</section><section id="youtube"><p><a href="Mirr_영상분석_보완보고서.md">영상 보완 보고서</a> · <a href="Mirr_영상분석_구현대장.csv">구현 대장 CSV</a></p>'+yt_html)
parts.append('</section><section id="moat">'+render_md(moat)+'</section><section id="sources"><h2>출처와 조사 기록</h2><p>공개 페이지 71개, 로그인한 화면, 고객 API 문서를 조사했다. 공개 자료의 설명은 실측 결과가 아니다. 본문에 계정 이메일·워크스페이스 ID·토큰 등 개인 식별값을 넣지 않았다.</p><p><a href="Mirr_기능해부_상세보고서.md">전체 상세 보고서</a> · <a href="Mirr_기능대장.csv">기능 대장 CSV</a> · <a href="Mirr_API_83개_작업.md">API 부록</a></p>')
D=json.load(open('work/pages.json'))+json.load(open('work/extra.json'))
parts.append('<details><summary>공개 수집 URL 71개 펼치기</summary><div class="body">'+''.join('<p class="minor"><a href="https://www.mirra.my'+html.escape(d['path'])+'">'+html.escape(d['path'])+'</a>'+(' → '+html.escape(d.get('url','')) if d.get('url')!='https://www.mirra.my'+d['path'] else '')+'</p>' for d in D)+'</div></details>')
parts.append('''</section></main><footer>공개 자료 + 로그인 화면 관찰 + 공식 영상 자막 · 2026-09-29 보완 · 기능 동일성과 품질 동일성은 별도 검증</footer><script>const fs=[...document.querySelectorAll('.feature')];function filter(){const q=document.getElementById('q').value.toLowerCase().trim(),g=document.getElementById('group').value,l=document.getElementById('level').value;let n=0;for(const e of fs){const ok=(!g||e.dataset.group===g)&&(!l||e.dataset.level===l)&&(!q||q.split(/\\s+/).every(w=>e.dataset.search.includes(w)));e.classList.toggle('hide',!ok);if(ok)n++}document.getElementById('count').textContent=n+' / '+fs.length+'개 표시';}for(const id of ['q','group','level'])document.getElementById(id).addEventListener('input',filter);document.getElementById('expand').addEventListener('click',()=>{let a=fs.filter(e=>!e.classList.contains('hide'));let open=a.some(e=>!e.open);a.forEach(e=>e.open=open);document.getElementById('expand').textContent=open?'검색 결과 접기':'검색 결과 펼치기';});filter();</script></html>''')
(OUT/'Mirr_기능해부.html').write_text(''.join(parts))
print('OUTPUTS',[(p.name,p.stat().st_size) for p in OUT.iterdir()])
