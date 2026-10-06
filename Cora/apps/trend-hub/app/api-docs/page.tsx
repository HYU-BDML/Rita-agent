export const metadata = { title: 'Cora · API 문서', description: 'Cora 개인 API 키로 프로젝트 목록을 읽는 REST 엔드포인트 안내' };
const page = { maxWidth: 800, margin: '0 auto', padding: '40px 20px', font: '16px/1.8 system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif', color: '#1d1d1b' } as const;
const pre = { background: '#f1efe8', padding: 14, borderRadius: 8, overflowX: 'auto', fontSize: 14, lineHeight: 1.6 } as const;
export default function Page() {
  return <main style={page}>
    <h1>Cora REST API 문서</h1>
    <p>현재 제공하는 엔드포인트는 읽기 전용 하나입니다. 키를 만든 계정의 프로젝트 목록만 돌려주며, 다른 계정의 자료는 어떤 경우에도 나오지 않습니다.</p>
    <h2>인증</h2>
    <p>작업실의 API 키 화면에서 키를 만들면 <code>cora_</code>로 시작하는 키가 한 번만 표시됩니다. 서버에는 키의 해시와 끝 4자리만 저장되므로 분실하면 다시 볼 수 없고, 폐기한 뒤 새로 만들어야 합니다. 모든 요청에 다음 헤더를 넣습니다.</p>
    <pre style={pre}>Authorization: Bearer cora_xxxxxxxxxxxxxxxx</pre>
    <h2>GET /api/v1/projects</h2>
    <p>프로젝트를 최근 수정 순으로 돌려줍니다.</p>
    <pre style={pre}>{`curl -H "Authorization: Bearer $CORA_API_KEY" https://<도메인>/api/v1/projects

200 OK
{"projects":[{"id":"...","version":3,"brand":"모퉁이 책방","title":"...","count":6,
  "workStatus":"draft","updatedAt":"2026-09-30T01:23:45.000Z"}]}`}</pre>
    <h2>오류</h2>
    <table style={{ borderCollapse: 'collapse', width: '100%' }}><tbody>
      <tr><td style={{ border: '1px solid #ccc', padding: 8 }}>401</td><td style={{ border: '1px solid #ccc', padding: 8 }}>헤더가 없거나 키가 틀렸거나 폐기된 키입니다.</td></tr>
      <tr><td style={{ border: '1px solid #ccc', padding: 8 }}>429</td><td style={{ border: '1px solid #ccc', padding: 8 }}>분당 호출 한도를 넘었습니다. <code>Retry-After</code> 헤더의 초 뒤에 다시 호출하세요.</td></tr>
    </tbody></table>
    <p>오류 본문은 <code>{'{"error":"설명"}'}</code> 형식입니다.</p>
    <h2>호출 한도</h2>
    <p>키 하나당 1분에 60회입니다. 응답 헤더 <code>X-RateLimit-Limit</code>과 <code>X-RateLimit-Remaining</code>으로 남은 횟수를 볼 수 있습니다. 이 한도는 서버 한 대의 메모리에서 세므로 서버를 다시 시작하면 초기화됩니다.</p>
    <p><a href="/help">도움말로 돌아가기</a></p>
  </main>;
}
