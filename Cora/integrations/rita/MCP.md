# Cora 로컬 MCP 서버 연결 (F107)

`apps/trend-hub/scripts/cora-mcp.mjs` 는 표준 입출력(stdio)으로 통신하는 로컬 MCP 서버입니다. 의존 패키지가 없고 Node 22 이상만 필요합니다. 읽기 전용 도구 3개만 노출하며 Cora의 REST API를 개인 API 키로 호출합니다.

## 따른 MCP 규격

2026-09-30에 https://modelcontextprotocol.io/specification 에서 확인했습니다.

1. 최신판 2026-07-28: 요청마다 `_meta["io.modelcontextprotocol/protocolVersion"]` 를 싣고 `server/discover` 로 서버 정보를 묻습니다. 이 서버는 `server/discover`, `tools/list`, `tools/call`, `ping` 에 응답하며 결과에 `resultType: "complete"` 를 붙입니다. 지원하지 않는 버전은 오류 코드 -32022 (`Unsupported protocol version`)와 `data.supported` 목록으로 답합니다.
2. 이전판 2025-11-25: `initialize` 요청에 같은 버전으로 답하고 `notifications/initialized` 알림은 응답 없이 받습니다. 2025-06-18, 2025-03-26, 2024-11-05 를 요청해도 그 버전을 그대로 돌려줍니다. 이 세 판은 규격 페이지에서 다시 확인하지 않았으므로 도구 호출 형식이 같다는 점만 근거로 둔 호환 처리입니다.
3. 전송: 한 줄에 JSON-RPC 메시지 하나(줄바꿈 없음)를 표준 입력으로 받아 표준 출력으로 답하고, 로그는 표준 오류로만 냅니다.
4. `tools/call` 결과는 `content`(text)와 `structuredContent` 를 함께 주며, API 실패는 프로토콜 오류가 아닌 `isError: true` 결과로 알립니다.

## 도구

| 이름 | 호출하는 Cora API | 설명 |
|---|---|---|
| `list_projects` | `GET /api/v1/projects` | 내 작업 목록 |
| `get_project` (`id`) | `GET /api/v1/platform-project?id=` | 작업 한 개(카드 사진은 `hasImage` 로만 표시) |
| `list_assets` (`id`) | `GET /api/v1/platform-assets?id=` | 카드 사진의 번호, 형식, 바이트 크기(사진 자체는 주지 않음) |

## Claude Desktop 설정 예

Settings > Developer > Edit Config 로 `claude_desktop_config.json` 을 열어 `mcpServers` 에 넣습니다. 키는 Cora 화면의 API 키 발급에서 만든 `cora_` 로 시작하는 값으로 바꿉니다. 아래 값은 예시이며 실제 키가 아닙니다.

```json
{
  "mcpServers": {
    "cora": {
      "command": "node",
      "args": ["/절대/경로/Cora/apps/trend-hub/scripts/cora-mcp.mjs"],
      "env": {
        "CORA_BASE_URL": "http://127.0.0.1:3000",
        "CORA_API_KEY": "cora_여기에_발급받은_키"
      }
    }
  }
}
```

## 한계

1. 읽기 전용입니다. 작업 생성, 수정, 게시 도구는 없습니다.
2. API 키는 분당 60회 제한이 있습니다(`API_RATE_LIMIT`). 키가 폐기되면 도구 호출이 `isError` 로 답합니다.
3. 원격(HTTP) MCP 전송은 구현하지 않았습니다. 이 서버는 내 컴퓨터에서 실행하는 로컬 방식입니다.
4. 키는 환경 변수로만 받으며 파일에 저장하지 않습니다.
