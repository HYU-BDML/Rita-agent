/** Tiny i18n layer: ko is the default and the fallback for any missing English key. */
export const LANGS = ['ko', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);
const ko = {
  'nav.studio': '카드뉴스 제작실', 'nav.workbench': '콘텐츠 작업실', 'nav.team': '팀 관리', 'nav.settings': '설정', 'nav.ideas': '아이디어 보드',
  'nav.material': '소재 탐색', 'nav.writing': 'AI 글·대본', 'nav.analysis': '성과 분석', 'nav.calendar': '콘텐츠 달력', 'nav.automation': '자동화 레시피', 'nav.library': '자산 보관함',
  'settings.title': '설정과 알림', 'settings.language': '언어', 'settings.language.hint': '화면 언어를 고릅니다. 번역이 없는 문구는 한국어로 표시됩니다.',
  'settings.prefs': '알림 설정', 'settings.channel.inapp': '앱 안 알림', 'settings.channel.email': '이메일', 'settings.email.unconfigured': '이메일 발송 연결이 없으면 이메일은 보내지 않고 앱 안 알림만 남습니다.',
  'settings.center': '알림 센터', 'settings.empty': '알림이 없습니다.', 'settings.markAll': '모두 읽음', 'settings.markRead': '읽음', 'settings.unread': '안 읽음', 'settings.saved': '저장했습니다.',
  'event.review_requested': '검토 요청 도착', 'event.review_decided': '검토 결과 도착', 'event.publish_result': '게시 결과', 'event.schedule_failed': '예약 작업 실패', 'event.team_invite': '팀 초대', 'event.credit_low': '크레딧 부족',
  'ideas.title': '아이디어 보드', 'ideas.empty': '이 상태의 아이디어가 없습니다.', 'ideas.all': '전체', 'ideas.moveTo': '다음 상태로 이동', 'ideas.history': '변경 기록',
  'status.새 아이디어': '새 아이디어', 'status.검토 중': '검토 중', 'status.제작 예정': '제작 예정', 'status.제작 완료': '제작 완료', 'status.보류': '보류',
  'content.title': '블로그·대본 목록', 'content.status': '진행 상태', 'content.from': '시작일', 'content.to': '종료일', 'content.brand': '브랜드', 'content.keyword': '키워드', 'content.search': '조회', 'content.more': '더 보기', 'content.empty': '조건에 맞는 글이 없습니다.', 'content.total': '조건에 맞는 글',
  'content.draft': '초안', 'content.edited': '수정됨', 'content.approved': '승인됨',
} as const;
export type Key = keyof typeof ko;
const en: Partial<Record<Key, string>> = {
  'nav.studio': 'Card news studio', 'nav.workbench': 'Content workbench', 'nav.team': 'Team', 'nav.settings': 'Settings', 'nav.ideas': 'Ideas board',
  'nav.material': 'Find material', 'nav.writing': 'AI writing & scripts', 'nav.analysis': 'Performance', 'nav.calendar': 'Content calendar', 'nav.automation': 'Automation recipes', 'nav.library': 'Library',
  'settings.title': 'Settings and notifications', 'settings.language': 'Language', 'settings.language.hint': 'Choose the display language. Text without a translation appears in Korean.',
  'settings.prefs': 'Notification settings', 'settings.channel.inapp': 'In-app', 'settings.channel.email': 'Email', 'settings.email.unconfigured': 'Without an email integration, email is not sent and only in-app notifications are kept.',
  'settings.center': 'Notification center', 'settings.empty': 'No notifications.', 'settings.markAll': 'Mark all read', 'settings.markRead': 'Mark read', 'settings.unread': 'Unread', 'settings.saved': 'Saved.',
  'event.review_requested': 'Review requested', 'event.review_decided': 'Review decided', 'event.publish_result': 'Publish result', 'event.schedule_failed': 'Scheduled job failed', 'event.team_invite': 'Team invite', 'event.credit_low': 'Credits low',
  'ideas.title': 'Ideas board', 'ideas.empty': 'No ideas in this status.', 'ideas.all': 'All', 'ideas.moveTo': 'Move to next status', 'ideas.history': 'History',
  'status.새 아이디어': 'New idea', 'status.검토 중': 'In review', 'status.제작 예정': 'Planned', 'status.제작 완료': 'Produced', 'status.보류': 'On hold',
  'content.title': 'Blog and script list', 'content.status': 'Progress', 'content.from': 'From', 'content.to': 'To', 'content.brand': 'Brand', 'content.keyword': 'Keyword', 'content.search': 'Search', 'content.more': 'Load more', 'content.empty': 'No matching posts.', 'content.total': 'Matching posts',
  'content.draft': 'Draft', 'content.edited': 'Edited', 'content.approved': 'Approved',
};
const dict: Record<Lang, Partial<Record<Key, string>>> = { ko, en };
/** Translation with fallback: requested language, then ko, then the key itself. */
export function t(lang: string, key: string): string { const d = dict[isLang(lang) ? lang : 'ko'] as Record<string, string | undefined>; return d[key] ?? (ko as Record<string, string>)[key] ?? key; }
