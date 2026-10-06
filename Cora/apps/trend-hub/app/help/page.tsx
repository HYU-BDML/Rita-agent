import { ContactForm } from '@/components/cora/inputs';
export const metadata = { title: 'Cora · 소개와 도움말', description: 'Cora가 하는 일, 시작 방법, 실제 연동과 모의 실행의 구분, 개인정보 안내' };
const page = { maxWidth: 760, margin: '0 auto', padding: '40px 20px', font: '16px/1.8 system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif', color: '#1d1d1b' } as const;
export default function Page() {
  return <main style={page}>
    <h1>Cora 소개와 도움말</h1>
    <h2>Cora가 하는 일</h2>
    <p>Cora는 브랜드 담당자가 소재를 고르고, 카드뉴스와 짧은 영상 초안을 만들고, 팀원의 검토를 받은 뒤 게시를 준비하는 콘텐츠 제작 도구입니다. 입력한 자료의 문장을 생략하지 않고 카드에 나누어 담으며, 카드마다 글과 사진을 직접 고칠 수 있습니다.</p>
    <h2>시작하는 방법</h2>
    <ol>
      <li>Cora 작업실(<a href="/studio">/studio</a>)에서 이메일과 비밀번호로 가입합니다.</li>
      <li>브랜드 이름, 읽는 사람, 자료 본문을 입력하거나 예시로 먼저 시작합니다.</li>
      <li>소재 방향을 고르면 카드 초안이 만들어지고, 카드 문구와 디자인을 고쳐 저장합니다.</li>
      <li>팀원에게 검토를 요청하고, 승인을 받은 버전으로 게시 준비 작업을 만듭니다.</li>
    </ol>
    <h2>실제로 작동하는 것과 모의로 작동하는 것</h2>
    <ul>
      <li>실제로 작동하는 것: 계정, 작업 저장과 버전 기록, 팀 초대와 검토, 카드 내보내기, PDF 글자 가져오기, 프로필 링크 페이지, 개인 API 키.</li>
      <li>연결 정보가 있어야 작동하는 것: YouTube 영상 정보 가져오기(YouTube API 키), Instagram 게시(계정 연결), 외부 게시 서비스 연동. 연결하지 않으면 해당 화면은 연결이 필요하다고 안내하며 게시하지 않습니다.</li>
      <li>모의로 처리되는 것: 연결하지 않은 상태의 게시 준비 작업은 실제 게시 없이 대기 상태로만 남습니다. 이 상태의 결과를 실제 게시 성과로 읽으면 안 됩니다.</li>
    </ul>
    <h2>개인정보 안내</h2>
    <p>가입 이메일, 비밀번호 확인값(원문은 저장하지 않음), 작성한 작업 내용은 운영 서버의 데이터베이스에 저장됩니다. 문의 양식에 적은 이름, 이메일, 내용은 답변을 위해서만 보관하며 이메일은 자동으로 발송하지 않습니다. 프로필 링크 페이지는 주소를 아는 누구나 볼 수 있으므로 공개해도 되는 내용만 넣어 주세요. 삭제를 원하시면 아래 문의 양식으로 요청해 주세요.</p>
    <h2>개발자용 API</h2>
    <p>개인 API 키로 내 작업 목록을 읽을 수 있습니다. 사용법은 <a href="/api-docs">API 문서</a>에 있습니다.</p>
    <h2>문의하기</h2>
    <ContactForm />
  </main>;
}
