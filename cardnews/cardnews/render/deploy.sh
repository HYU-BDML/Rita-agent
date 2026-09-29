#!/usr/bin/env bash
# 카드뉴스 작업대 배포 — 도커 굽기 → ECR → Lambda → API Gateway 길 걸기
#
#   bash cardnews/render/deploy.sh
#
# **저쪽(render-server)과 갈라 나온 배포다.** 예전에는 함수 하나에 양쪽 길이
# 다 있어서, 한쪽이 배포하면 다른 쪽 코드가 사라졌다(2026-08-25, /render/cardnews
# 404). 이제 각자 자기 함수만 올린다 — **서로 못 덮어쓴다.**
#
# **API 주소는 그대로다.** 같은 API Gateway 에 우리 길만 명시적으로 걸어서 이
# 함수로 보낸다. 이미 만들어 둔 작업대 링크와 틀 주소가 전부 그대로 산다.
#
# **열쇠가 하나도 없다.** 우리 길은 바깥 API 를 안 부른다 — 그림을 그리고 S3 에
# 넣을 뿐이다. 그래서 저쪽 deploy.sh 의 열쇠 관문이 여기엔 없다.
#
# **변수 이름은 영문으로 쓴다.** bash 는 한글 변수명을 못 받는다.
set -euo pipefail

ACCT=554608989606
REGION=ap-northeast-2
NAME=cardnews-workbench
BUCKET=${BUCKET:-cardnews-render-$ACCT}
APIID=l26m3zzcjd
ROLE=$NAME-role
REPO=$ACCT.dkr.ecr.$REGION.amazonaws.com/$NAME
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

# 우리가 가져가는 길. 저쪽 $default 는 그대로 두고 이것만 명시적으로 건다.
ROUTES=(
  "POST /render/cardnews"
  "POST /workbench"
  "GET /edit/{id}"      "POST /edit/{id}"
  "GET /template/{id}"  "POST /template/{id}"
  "POST /template/resolve"
  "POST /template/rename"
  "POST /upload"
  # 영상은 창고에 직접 올린다 — 서명 주소만 여기서 준다(게이트웨이 10MB 제한).
  "POST /upload/sign"
  # 「새 대화」가 그 대화에서 올린 사진·로고를 지운다. **워커가 부르는 문이라
  # `OPTIONS` 는 안 건다** — 브라우저가 직접 안 두드린다(담기와 같은 자리).
  "POST /upload/delete"
  # 분석 걸기. **`{코드}` 는 게이트웨이의 자리표시자다** — 브라우저가 아니라
  # 워커가 부른다(`web/_worker.js` 의 `/api/analyze/`).
  "POST /analyze/{code}"
  # **RITA 채팅 규격 길(`POST /chat` · `GET /jobs/{id}`)은 2026-09-24 에 뺐다.**
  # 리타가 2026-09-06 부터 그 길을 안 쓴다 — 리타에 올리는 길은 «배포한 웹앱의
  # 공개 주소를 등록하는 것» 하나뿐이고, 우리는 2026-09-19 에 등록을 끝냈다
  # (`cardnews/rita-agent-api-spec.md` 머리말). 즉 리타 안에서 우리 화면이 그대로 돈다.
  # 웹 화면이 부르는 문. 채팅과 같은 사슬을 쓴다.
  "POST /make"  "GET /make/{id}"
  # 「그만두기」 — 번호표에 「그만」만 적는다. 실제로 멈추는 것은 분석 람다다
  # (2026-09-24). **`GET /make/{id}` 와 다른 길이다** — 조각이 하나 더 있다.
  "POST /make/{id}/stop"
  # 굽기 «전» 에 멈추는 두 문(사람 결정 2026-09-19 「항상 거친다」).
  # `/make` 를 둘로 나눈 것이다 — `draft` 는 대본까지만, `bake` 는 사람이 보고
  # 고친 초안을 굽는다. 물어보는 문은 `/make/{id}` 를 같이 쓴다.
  #
  # **`OPTIONS` 는 안 건다.** 브라우저가 아니라 워커가 부르는 문이라 프리플라이트가
  # 없다 — 담기(`POST /ingest`)와 같은 자리다.
  "POST /draft"  "POST /bake"
  # 채팅 페이지가 인스타 주소를 담을 때 부르는 문. 채팅의 담기와 같은 사슬이다.
  "POST /ingest"
  # 고를 것들. 목록은 GET(그림 카드로 펼 값), 찾기는 POST(이름을 몸통에 담는다).
  "GET /templates"  "GET /tones"  "POST /tone/resolve"
  # 프리플라이트. **`OPTIONS /{proxy+}` 로 뭉뚱그리지 않는다** — 그러면 저쪽
  # 길의 프리플라이트까지 이 함수가 가로챈다. 우리 길만 하나씩 적는다.
  "OPTIONS /render/cardnews"  "OPTIONS /workbench"
  "OPTIONS /edit/{id}"        "OPTIONS /template/{id}"
  "OPTIONS /template/resolve" "OPTIONS /upload"
  "OPTIONS /template/rename"
  "OPTIONS /analyze/{code}"
  "OPTIONS /chat"             "OPTIONS /jobs/{id}"
  "OPTIONS /make"            "OPTIONS /make/{id}"
  "OPTIONS /templates"        "OPTIONS /tones"
  "OPTIONS /tone/resolve"
)

say() { printf '\n== %s\n' "$*"; }

# ---------------------------------------------------------------- 작업대 코드 복사
say "작업대 기하 코드를 상자에 넣을 자리로 복사 (원본은 ../web/lib 한 곳뿐)"
rm -rf weblib && mkdir -p weblib
# 줄을 잇지 않고 나눠 부른다 — 이음 역슬래시를 잘못 넣어 「역슬래시 n」 이 «n»
# 이라는 이름의 파일로 읽힌 적이 있다(2026-08-25).
cp ../web/lib/boxedit.js weblib/
cp ../web/lib/workbench.js weblib/
# 내려받기. 작업대와 결과 쪽이 **같이** 쓴다 — 한 벌만 둔다.
cp ../web/lib/zip.js weblib/
cp ../web/lib/받기.js weblib/
ls weblib/

# ---------------------------------------------------------------- 상자 점검
say "상자에 넣을 것을 빠뜨리지 않았나"
# 하나라도 빠지면 app.py 임포트가 죽어 «모든» 문이 500 이 된다. 배포 전에 잡는다.
python -m pytest test_상자.py -q

# ---------------------------------------------------------------- 도커
say "도커 굽기"
aws ecr describe-repositories --repository-names "$NAME" --region "$REGION" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$NAME" --region "$REGION" >/dev/null

# **옛 판은 최근 5개만 남긴다**(2026-09-24). 배포할 때마다 `:latest` 꼬리표가 새 그림으로
# 옮겨 가고 **옛 그림은 꼬리표를 잃은 채 그대로 쌓인다** — 지우는 규칙이 없어서 분석 창고에
# 57개(19.1GB), 작업대 창고에 38개(11.6GB)가 쌓여 달마다 $3.07 를 먹고 있었다.
#
# 5개를 남기는 것은 **되돌아갈 자리**다. 되돌리려면 남은 그림의 다이제스트로
# `update-function-code --image-uri "$REPO@sha256:…"` 를 하면 된다.
aws ecr put-lifecycle-policy --repository-name "$NAME" --region "$REGION" --lifecycle-policy-text '{
  "rules":[{"rulePriority":1,"description":"untagged: keep 5 newest",
    "selection":{"tagStatus":"untagged","countType":"imageCountMoreThan","countNumber":5},
    "action":{"type":"expire"}}]}' >/dev/null
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ACCT.dkr.ecr.$REGION.amazonaws.com"
# `--provenance=false --sbom=false` 가 꼭 필요하다 — 없으면 buildx 가 OCI 매니페스트
# 목록을 만들고 Lambda 가 그걸 못 받는다(저쪽 deploy.sh 의 실측 기록과 같다).
docker build --platform linux/amd64 --provenance=false --sbom=false -t "$NAME" .
docker tag "$NAME:latest" "$REPO:latest"
docker push "$REPO:latest"

# ---------------------------------------------------------------- IAM
say "IAM 역할 — 로그와 이 창고뿐"
# **분석 함수를 «부르는» 권한은 여기서 안 준다.** `analyze/deploy.sh` 가 이 역할에
# 얹는다(`invoke-analyze`) — 분석 함수를 만든 쪽이 자기 이름을 안다.
# Bedrock 권한은 안 준다. 바깥 모델은 이 함수가 안 부른다.
# **`s3:ListBucket` 은 일부러 안 준다.** 없는 열쇠에 S3 가 `AccessDenied` 를
# 주는데, `_S3창고.읽기` 가 그것을 «없음» 으로 받게 이미 짜여 있다.
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document '{
    "Version":"2012-10-17","Statement":[{"Effect":"Allow",
    "Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  sleep 10
fi
aws iam put-role-policy --role-name "$ROLE" --policy-name s3-workbench --policy-document "{
  \"Version\":\"2012-10-17\",\"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":[\"s3:PutObject\",\"s3:GetObject\"],
     \"Resource\":\"arn:aws:s3:::$BUCKET/*\"}]}"

# 영상 든 저장은 자기 자신을 비동기로 불러 굽는다(게이트웨이 30초를 안 탄다).
aws iam put-role-policy --role-name "$ROLE" --policy-name invoke-self --policy-document "{
  \"Version\":\"2012-10-17\",\"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":\"lambda:InvokeFunction\",
     \"Resource\":\"arn:aws:lambda:$REGION:$ACCT:function:$NAME\"}]}"

# ---------------------------------------------------------------- Lambda
say "Lambda 함수"
# 메모리 3008·10분·/tmp 2GB — 영상 자리 ffmpeg 인코딩(2026-09-16)
if aws lambda get-function --function-name "$NAME" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$NAME" --region "$REGION" \
    --image-uri "$REPO:latest" >/dev/null
  aws lambda wait function-updated --function-name "$NAME" --region "$REGION"
else
  aws lambda create-function --function-name "$NAME" --region "$REGION" \
    --package-type Image --code "ImageUri=$REPO:latest" \
    --role "arn:aws:iam::$ACCT:role/$ROLE" \
    --memory-size 3008 --timeout 600 --ephemeral-storage '{"Size":2048}' \
    --architectures x86_64 >/dev/null
  aws lambda wait function-active --function-name "$NAME" --region "$REGION"
fi
# **환경변수는 파일로 넘긴다.** 명령줄에 실으면 실패 메시지가 그대로 뱉는다.
# 여기엔 열쇠가 없지만 결을 맞춰 둔다 — 나중에 하나라도 생기면 이 자리다.
ENVFILE=".env-$$.json"
trap 'rm -f "$ENVFILE"' EXIT
# **열쇠를 명령줄에 안 싣는다.** 명령은 실패하면 자기 자신을 그대로 화면에
# 뱉는다 — 성공할 때만 안전한 방식은 안전한 방식이 아니다. 환경변수로 넘기고,
# 화면에는 길이만 적는다.
#
# **이미 있으면 그대로 쓴다.** 배포할 때마다 열쇠가 바뀌면 RITA 등록이 매번
# 깨진다. 새로 만들고 싶으면 RITA_AGENT_SECRET 을 넣어 돌린다.
RITA_AGENT_SECRET="${RITA_AGENT_SECRET:-}"
if [ -z "$RITA_AGENT_SECRET" ]; then
  RITA_AGENT_SECRET="$(aws lambda get-function-configuration --function-name "$NAME" \
    --region "$REGION" --query 'Environment.Variables.RITA_AGENT_SECRET' \
    --output text 2>/dev/null)"
  [ "$RITA_AGENT_SECRET" = "None" ] && RITA_AGENT_SECRET=""
fi
if [ -z "$RITA_AGENT_SECRET" ]; then
  RITA_AGENT_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
  echo "  RITA 열쇠를 새로 만들었다 (${#RITA_AGENT_SECRET}자) — 값은 안 찍는다"
else
  echo "  RITA 열쇠가 이미 있다 (${#RITA_AGENT_SECRET}자) — 그대로 쓴다"
fi
export RITA_AGENT_SECRET

# **웹 전용 열쇠는 따로 둔다**(사람 결정 2026-09-22).
#
# RITA 열쇠를 돌려쓰면 **RITA 도 우리 돈 쓰는 문을 열 수 있게 된다** — 저쪽에
# 준 열쇠이고 저쪽은 `/chat` 과 `/jobs` 만 쓰면 된다. 돈이 나가는 문은 우리
# 워커만 두드리므로 열쇠도 우리만 갖는다.
#
# 만드는 법·지키는 법은 RITA 열쇠와 똑같다 — 있으면 그대로 쓰고, 없으면 새로
# 만들고, 화면에는 길이만 적는다.
WEB_SECRET="${WEB_SECRET:-}"
if [ -z "$WEB_SECRET" ]; then
  WEB_SECRET="$(aws lambda get-function-configuration --function-name "$NAME"     --region "$REGION" --query 'Environment.Variables.WEB_SECRET'     --output text 2>/dev/null)"
  [ "$WEB_SECRET" = "None" ] && WEB_SECRET=""
fi
if [ -z "$WEB_SECRET" ]; then
  WEB_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
  echo "  웹 열쇠를 새로 만들었다 (${#WEB_SECRET}자) — 값은 안 찍는다"
  echo "  !! 워커에도 같은 값을 넣어야 한다: npx wrangler secret put WEB_SECRET"
else
  echo "  웹 열쇠가 이미 있다 (${#WEB_SECRET}자) — 그대로 쓴다"
fi
export WEB_SECRET
python - "$ENVFILE" "$BUCKET" <<'ENVPY'
import json, os, sys
open(sys.argv[1], "w", encoding="utf-8").write(json.dumps({"Variables": {
    "BUCKET": sys.argv[2], "ANALYZE_FN": "cardnews-analyze",
    "RITA_AGENT_SECRET": os.environ["RITA_AGENT_SECRET"],
    "WEB_SECRET": os.environ["WEB_SECRET"]}}))
ENVPY
unset RITA_AGENT_SECRET WEB_SECRET
aws lambda update-function-configuration --function-name "$NAME" --region "$REGION" \
  --memory-size 3008 --timeout 600 --ephemeral-storage '{"Size":2048}' \
  --environment "file://$ENVFILE" >/dev/null
aws lambda wait function-updated --function-name "$NAME" --region "$REGION"
rm -f "$ENVFILE"

# 죽으면 다시 부르지 않는다 — 판이 겹쌓인다. 영상 굽기는 자기 자신을 비동기로
# 부르는데, 람다는 비동기 호출이 실패하면 기본으로 두 번 더 부른다. 그러면 같은
# 설계도가 판 셋으로 쌓인다.
aws lambda put-function-event-invoke-config --function-name "$NAME" --region "$REGION" \
  --maximum-retry-attempts 0 >/dev/null

# ---------------------------------------------------------------- API Gateway
say "API Gateway — 우리 길만 이 함수로 건다 (저쪽 \$default 는 그대로)"
FNARN="arn:aws:lambda:$REGION:$ACCT:function:$NAME"
aws lambda add-permission --function-name "$NAME" --region "$REGION" \
  --statement-id apigw --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$REGION:$ACCT:$APIID/*" >/dev/null 2>&1 || true

INTID=$(aws apigatewayv2 get-integrations --api-id "$APIID" --region "$REGION" \
  --max-results 500 --query "Items[?IntegrationUri=='$FNARN'].IntegrationId | [0]" --output text)
if [ "$INTID" = "None" ] || [ -z "$INTID" ]; then
  INTID=$(aws apigatewayv2 create-integration --api-id "$APIID" --region "$REGION" \
    --integration-type AWS_PROXY --integration-uri "$FNARN" \
    --payload-format-version 2.0 --query IntegrationId --output text)
  echo "  새 통로 $INTID"
else
  echo "  통로 $INTID (이미 있음)"
fi

# **길을 한 쪽에 다 받는다.** aws CLI 는 기본 25개씩 쪽을 나눠 답하고, `--query`
# 를 **쪽마다** 매겨 결과를 여러 줄로 뱉는다. 길이 25개를 넘은 날(2026-08-27)
# 그 두 줄이 한 변수에 붙어 «Invalid route identifier» 로 배포가 멈췄다.
for R in "${ROUTES[@]}"; do
  EXIST=$(aws apigatewayv2 get-routes --api-id "$APIID" --region "$REGION" \
    --max-results 500 --query "Items[?RouteKey=='$R'].RouteId | [0]" --output text)
  if [ "$EXIST" = "None" ] || [ -z "$EXIST" ]; then
    aws apigatewayv2 create-route --api-id "$APIID" --region "$REGION" \
      --route-key "$R" --target "integrations/$INTID" >/dev/null
    echo "  걺   $R"
  else
    aws apigatewayv2 update-route --api-id "$APIID" --region "$REGION" \
      --route-id "$EXIST" --target "integrations/$INTID" >/dev/null
    echo "  고침 $R"
  fi
done

# ---------------------------------------------------------------- 창고에 올릴 것
say "글꼴을 창고에 올린다 (작업대 쪽이 브라우저에서 받는다)"
for F in Pretendard-Bold.otf Pretendard-Medium.otf; do
  aws s3 cp "fonts/$F" "s3://$BUCKET/$F" --content-type font/otf --region "$REGION" >/dev/null
  echo "  $F"
done

say "틀 저장소의 «빈 자리만» 채운다 (Dify 가 이름·주소로 받아 쓴다)"
# **덮어쓰지 않는다. 씨앗만 뿌린다.**
#
# 창고의 틀은 이제 «서버가 만든 것» 이다 — 사람이 지은 별명과 표지 미리보기가
# 거기 실려 있다. 여기 있는 것은 그 게시물을 내 컴퓨터에서 다시 잰 사본이라
# 별명도 표지도 없다. 그대로 올리면 배포할 때마다 사람이 지은 이름이 날아간다.
#
# `목록.json` 은 더 나쁘다 — 그건 창고 전체의 «간판» 이라, 내 컴퓨터에 있는
# 두 줄로 덮으면 서버에서 분석한 틀들이 통째로 목록에서 사라진다
# (2026-08-27 실제로 그랬다: 셋이던 목록이 둘이 됐다).
#
# `sync --delete` 를 안 쓰는 것도 같은 결이다 — 작업대에서 「틀로 내보내기」한
# 파일이 창고에만 있는데, 그걸 쓰면 사람이 만든 틀을 배포가 날린다.
for F in ../dify/templates/*.json; do
  KEY="templates/$(basename "$F")"
  if aws s3api head-object --bucket "$BUCKET" --key "$KEY" --region "$REGION" >/dev/null 2>&1; then
    echo "  $KEY — 창고 것이 이긴다, 그대로 둔다"
    continue
  fi
  aws s3 cp "$F" "s3://$BUCKET/$KEY" \
    --content-type "application/json; charset=utf-8" --region "$REGION" >/dev/null
  echo "  $KEY — 씨앗을 뿌렸다"
done

say "끝"
echo "  함수   $NAME"
echo "  주소   https://$APIID.execute-api.$REGION.amazonaws.com"
echo "  창고   https://$BUCKET.s3.$REGION.amazonaws.com/"
echo
echo "  시험:  curl -s -XPOST https://$APIID.execute-api.$REGION.amazonaws.com/render/cardnews \\"
echo "           -H 'Content-Type: application/json' -d '{\"slides\":[]}'"
