#!/usr/bin/env bash
# 카드뉴스 «분석» Lambda 배포 — 도커 굽기 → ECR → Lambda
#
#   bash cardnews/analyze/deploy.sh
#
# **API Gateway 에 길을 안 건다.** 이 함수는 사람이 직접 부르는 것이 아니라
# 작업대 Lambda 가 «비동기» 로 부른다(`POST /analyze/{id}`). 계량이 1~2분
# 걸리는데 게이트웨이는 30초에서 끊기 때문이다.
#
# **열쇠는 환경에서 받아 파일로 넘긴다.** 명령줄에 실으면 실패 메시지가 그대로
# 뱉는다. 값은 어디에도 안 찍고 «몇 자인지» 만 알린다.
#
# 필요한 환경변수:
#   BOARD_URL · BOARD_PASSWORD      라벨과 그림을 받아 오는 게시판
#   OPENROUTER_API_KEY              글자 읽기 (루나, 네모당 $0.0002)
#   FAL_KEY                         장식 누끼 (GPT Image 2.5 low, 장식당 $0.006)
#   DEEPSEEK_API_KEY                말투·역할 판정 (대본짓기)
# **변수 이름은 영문으로 쓴다.** bash 는 한글 변수명을 못 받는다
# (`render/deploy.sh` 머리에 적힌 그대로인데 여기서 또 밟았다).
set -euo pipefail

ACCT=554608989606
REGION=ap-northeast-2
NAME=cardnews-analyze
BUCKET=${BUCKET:-cardnews-render-$ACCT}
ROLE=$NAME-role
REPO=$ACCT.dkr.ecr.$REGION.amazonaws.com/$NAME
HERE="$(cd "$(dirname "$0")" && pwd)"
CTX="$(dirname "$HERE")"          # cardnews/ — 저장소 구조를 그대로 담는다

say() { printf '\n== %s\n' "$*"; }

# ---------------------------------------------------------------- 열쇠 관문
say "열쇠 살피기 (값은 안 찍는다)"
MISSING=""
# **`DEEPSEEK_API_KEY` 는 여기서 안 따진다.** 이 컴퓨터에 없거나 죽어 있어도
# 람다에 살아 있는 것이 있으면 그것을 쓴다(바로 아래). 둘 다 없을 때만 멈춘다.
#
# 열쇠 없는 람다가 나가면 안 되는 까닭은 그대로다(2026-09-19 실물): 말투 판정이
# 첫 줄에서 튕겼는데 그 실패가 조용히 삼켜져 **골격이 전부 「미정」인 틀**이
# 창고에 쌓였다 — 그런데도 분석은 `ok: true` 였다. 못 쓰는 틀을 만드느니
# **배포를 안 하는 편이 낫다.**
for k in BOARD_URL BOARD_PASSWORD; do
  v="${!k:-}"
  if [ -z "$v" ]; then MISSING="$MISSING $k"; else echo "  $k — ${#v}자"; fi
done
if [ -n "$MISSING" ]; then
  echo "!! 없어서 못 간다:$MISSING" >&2
  exit 1
fi

# ---------------------------------------------------- 지금 람다에 있는 환경변수
#
# `update-function-configuration --environment` 는 **통째로 갈아엎는다.** 그냥
# 올리면 사람이 콘솔에 직접 넣은 열쇠가 배포 한 번에 사라진다. 그래서 있던 것
# 위에 이번 것을 덧칠한다. **값은 어디에도 안 찍는다** — 셸 변수에만 담아
# 파이썬에 환경으로 넘긴다(명령줄에 실으면 실패할 때 그대로 뱉는다).
#
# **못 읽으면 멈춘다.** 읽기 실패를 «환경이 비었다» 로 치면, 토큰이 만료된 날이나
# 그물이 끊긴 날에 콘솔에 넣은 열쇠를 이 컴퓨터 것으로 덮어쓴다 — 그것도 조용히,
# 아무 자국도 안 남기고. 함수가 아예 없는 첫 배포만 «비었다» 로 친다.
say "지금 람다에 있는 환경변수 읽기 (값은 안 찍는다)"
ERRFILE="$(mktemp)"
if CURRENT_ENV="$(aws lambda get-function-configuration --function-name "$NAME" \
      --region "$REGION" --query 'Environment.Variables' --output json 2>"$ERRFILE")"; then
  echo "  읽었다"
elif grep -q 'ResourceNotFoundException' "$ERRFILE"; then
  CURRENT_ENV='{}'
  echo "  아직 함수가 없다 — 첫 배포다"
else
  echo "!! 람다 환경을 못 읽었다 — 여기서 멈춘다" >&2
  echo "   (그냥 올리면 콘솔에 넣은 열쇠를 이 컴퓨터 것으로 덮어쓴다)" >&2
  cat "$ERRFILE" >&2
  rm -f "$ERRFILE"
  exit 1
fi
rm -f "$ERRFILE"
export CURRENT_ENV

# **모델 열쇠 관문 — 도커를 굽기 «전» 이다.** (딥시크 · 글자 모델)
#
# 뒤에 두면 코드는 이미 올라간 뒤라, 열쇠가 없을 때 «새 코드 + 옛 환경» 인 람다가
# 살아남는다. 배포는 「멈췄다」고 하는데 서비스는 망가진 채로 도는, 제일 나쁜 꼴이다.
# **찍는 글은 한글과 아스키만 쓴다.** 윈도 콘솔이 cp949 라 줄표(—)·낫표(«»)를
# 못 찍고 거기서 파이썬이 죽는다(실물 2026-09-22: 이 관문이 그래서 멈췄다).
# 그래도 새는 것이 있을 때를 대비해 못 찍는 글자는 물음표로 바꾸게 해 둔다.
python - <<'PY'
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

있던것 = json.loads(os.environ.get("CURRENT_ENV") or "null") or {}

# **글자 읽기(OPENROUTER)도 같은 규칙이다**(2026-09-24). 구글 비전을 통째로
# 뺐으므로 이 열쇠가 없으면 **글자를 아예 못 읽는다** — 물러설 곳이 없다.
# 예전처럼 조용히 딴 길로 새지 않고 `merge_labeled` 가 그 자리에서 터진다.
for 이름 in ("DEEPSEEK_API_KEY", "OPENROUTER_API_KEY"):
    람다것 = (있던것.get(이름) or "").strip()
    컴퓨터것 = (os.environ.get(이름) or "").strip()
    if not (람다것 or 컴퓨터것):
        print(f"!! {이름} 가 람다에도 이 컴퓨터에도 없다. 배포를 멈춘다",
              file=sys.stderr)
        sys.exit(1)
    print(f"  {이름}: "
          + ("람다에 있는 것을 쓴다 (콘솔에 넣은 것이 임자다)" if 람다것
             else f"이 컴퓨터 것을 쓴다 ({len(컴퓨터것)}자)"))
PY

# ---------------------------------------------------------------- 도커
say "도커 굽기 (짓는 자리: $CTX)"
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
# 목록을 만들고 Lambda 가 그걸 못 받는다.
docker build --platform linux/amd64 --provenance=false --sbom=false \
  -f "$HERE/Dockerfile" -t "$NAME" "$CTX"
docker tag "$NAME:latest" "$REPO:latest"
docker push "$REPO:latest"

# ---------------------------------------------------------------- IAM
say "IAM 역할 — 로그와 이 창고뿐"
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document '{
    "Version":"2012-10-17","Statement":[{"Effect":"Allow",
    "Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  sleep 10
fi
# **`s3:ListBucket` 이 있어야 명단을 다시 지을 수 있다**(2026-09-19). 여럿을 동시에
# 분석할 때는 각자 명단을 안 건드리고(`목록건너뛰기`), 끝나고 `명단다시짓기` 가 창고의
# 틀 파일들을 «훑어» 명단을 새로 만든다 — 훑기가 이 권한이다. 대상이 통 자체라
# `$BUCKET/*` 가 아니라 `$BUCKET` 이다.
aws iam put-role-policy --role-name "$ROLE" --policy-name s3-templates --policy-document "{
  \"Version\":\"2012-10-17\",\"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":[\"s3:PutObject\",\"s3:GetObject\"],
     \"Resource\":\"arn:aws:s3:::$BUCKET/*\"},
    {\"Effect\":\"Allow\",\"Action\":[\"s3:ListBucket\"],
     \"Resource\":\"arn:aws:s3:::$BUCKET\"}]}"

# 대본을 쓰는 데 쓴다. **모델 부르기 하나뿐이다** — 목록 보기도 설정 바꾸기도
# 안 준다. 프로필(`global.…`)은 여러 지역에 걸쳐 있어 자원을 * 로 둔다.
aws iam put-role-policy --role-name "$ROLE" --policy-name bedrock-invoke --policy-document '{
  "Version":"2012-10-17","Statement":[
    {"Effect":"Allow","Action":["bedrock:InvokeModel"],"Resource":"*"}]}'

# 굽기(`/render/cardnews`)를 작업대 Lambda 에 **직접** 낸다(2026-09-24).
# 여태는 API Gateway 주소로 냈는데 그 문지기가 30초에서 끊었다 — 사진을 만든
# 일곱 장이 30,340ms 로 **0.3초 차에** 실패한 적이 있다. 문지기를 안 거치면
# 그 벽이 없고(작업대 자체는 600초), 3장씩 세 번 돌던 것이 한 번이 된다.
# **대상은 작업대 하나뿐이다** — 아무 람다나 부르게 두지 않는다.
aws iam put-role-policy --role-name "$ROLE" --policy-name invoke-workbench --policy-document "{
  \"Version\":\"2012-10-17\",\"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":\"lambda:InvokeFunction\",
     \"Resource\":\"arn:aws:lambda:$REGION:$ACCT:function:cardnews-workbench\"}]}"

# ---------------------------------------------------------------- Lambda
say "Lambda 함수 — 메모리 3008, 시간 900초"
# 계량은 일곱 장에 1~2분이고 OpenCV 가 그림을 통째로 편다. 굽기(2048·120초)와
# 다른 몸이라 따로 잡는다.
if aws lambda get-function --function-name "$NAME" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$NAME" --region "$REGION" \
    --image-uri "$REPO:latest" >/dev/null
  aws lambda wait function-updated --function-name "$NAME" --region "$REGION"
else
  aws lambda create-function --function-name "$NAME" --region "$REGION" \
    --package-type Image --code "ImageUri=$REPO:latest" \
    --role "arn:aws:iam::$ACCT:role/$ROLE" \
    --memory-size 3008 --timeout 900 --architectures x86_64 >/dev/null
  aws lambda wait function-active --function-name "$NAME" --region "$REGION"
fi

# **환경변수는 파일로 넘긴다.** 파이썬으로 짜서 따옴표·역슬래시를 안전하게 싣는다.
# **상대 경로로 쓴다.** 셸이 아는 `/tmp/...`·`/c/Users/...` 를 주면 윈도우에서
# 도는 `aws` 가 그 경로를 못 본다(실측 둘 다: "Unable to load paramfile").
# 상대 경로는 aws 가 제 작업 폴더 기준으로 풀어서 양쪽 다 통한다.
cd "$HERE"

ENVFILE=".env-$$.json"
trap 'rm -f "$ENVFILE"' EXIT
python - "$ENVFILE" <<'PY'
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

있던것 = json.loads(os.environ.get("CURRENT_ENV") or "null") or {}

# 이 컴퓨터에서 가져갈 것. **모델 열쇠는 여기 없다** — 아래에서 따로 다룬다.
#
# **`APIFY_TOKEN` 도 여기 있다.** 예전엔 이 앞에서 `get-function-configuration` 을
# 한 번 더 불러 따로 이어받았는데, 이제 `있던것` 이 그 일을 한다 — 같은 일을 두
# 벌로 두면 한쪽만 고쳐질 때 조용히 어긋난다.
칸 = ["BOARD_URL", "BOARD_PASSWORD", "APIFY_TOKEN", "FAL_KEY"]
값 = dict(있던것)
값.update({k: os.environ[k] for k in 칸 if os.environ.get(k, "").strip()})

# **모델 열쇠만 반대다 — 람다에 있는 것이 임자다.**
#
# 사람이 콘솔에 직접 넣는 값이다(이 컴퓨터에 안 두려고, 또는 이 컴퓨터 것이 죽어
# 있어서). 이 컴퓨터 값으로 덮으면 그 뜻이 정확히 뒤집힌다 — 실물 2026-09-21:
# 컴퓨터에 옛 열쇠가 남아 있어서 **콘솔에 막 넣은 것을 첫 배포가 덮었다.**
for 이름 in ("DEEPSEEK_API_KEY", "OPENROUTER_API_KEY"):
    if not (값.get(이름) or "").strip():
        값[이름] = os.environ.get(이름, "").strip()

# **`OPENAI_API_KEY` 는 있으면 그대로 둔다 — 안 지운다.**
#
# 2026-09-21 에 OpenAI 로 갔다가 2026-09-22 에 딥시크로 돌아왔다. 이틀에 두 번
# 뒤집혔다. 지우면 다음에 뒤집을 때 사람이 콘솔에 다시 넣어야 한다 — 안 쓰는
# 칸 하나가 그보다 싸다.

값["BUCKET"] = os.environ.get("BUCKET") or "cardnews-render-554608989606"
값["CARDNEWS_DATA"] = "/tmp/cardnews-data"
값["CARDNEWS_RECIPES"] = "/tmp/cardnews-recipes"

open(sys.argv[1], "w", encoding="utf-8").write(json.dumps({"Variables": 값}))
print(f"  환경변수 {len(값)}개를 파일로 넘긴다 (값은 안 찍는다)")
print("  이름: " + " ".join(sorted(값)))
print("  담기: " + ("열려 있다" if (값.get("APIFY_TOKEN") or "").strip()
                  else "열쇠 없음. 채팅에서는 웹 링크로 물러선다"))
PY
aws lambda update-function-configuration --function-name "$NAME" --region "$REGION" \
  --memory-size 3008 --timeout 900 --environment "file://$ENVFILE" >/dev/null
aws lambda wait function-updated --function-name "$NAME" --region "$REGION"
rm -f "$ENVFILE"

# **죽으면 다시 부르지 않는다**(2026-09-24). 람다는 «답을 안 기다리는» 부름이
# 실패하면 **기본으로 두 번 더 부른다.** 여기는 사진(fal)·대본(딥시크)·글자
# 읽기(루나)가 다 도는 자리라, 한 번 터지면 **그 값이 세 배로 나간다.**
#
# 「이미 끝난 일이면 또 안 한다」는 장치가 있지만 **번호표에 «성공» 이라고
# 적혀 있을 때만** 걸린다. 900초에 전원이 뽑히면 번호표는 「도는 중」인 채로
# 멈추므로 그 장치가 안 걸린다 — 터져서 다시 부르는 바로 그 경우에 무용지물이다.
#
# 작업대 배포(`render/deploy.sh`)는 진작부터 이렇게 막아 뒀다. 정작 돈이
# 나가는 이쪽이 빠져 있었다.
aws lambda put-function-event-invoke-config --function-name "$NAME" --region "$REGION" --maximum-retry-attempts 0 >/dev/null

# ---------------------------------------------------------------- 작업대가 부를 수 있게
say "작업대 Lambda 에 «이 함수를 부를» 권한을 준다"
aws iam put-role-policy --role-name cardnews-workbench-role \
  --policy-name invoke-analyze --policy-document "{
  \"Version\":\"2012-10-17\",\"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":\"lambda:InvokeFunction\",
     \"Resource\":\"arn:aws:lambda:$REGION:$ACCT:function:$NAME\"}]}"

say "끝 — 작업대의 POST /analyze/{코드} 가 이 함수를 비동기로 부른다"
