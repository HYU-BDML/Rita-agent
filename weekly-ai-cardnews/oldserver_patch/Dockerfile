# 옛 서버(cardnews-render)에 2026-09-30 까지 올라가 있던 이미지 위에 고친 파일 셋만 얹는다.
#   cover.py          표지 Gemini → GPT 이미지 2.5 (2026-09-30)
#   procure/week.py   명단에서 Grok 뺌 (2026-10-01)
#   procure/blog.py   NVIDIA 블로그 RSS 설정 (2026-10-01)
#   app.py            표지 결과에 GPT 사용량을 싣는다 (2026-10-01, 주간 AI 소식이 쓴 돈을 센다)
# 나머지(굽기·글꼴·ffmpeg·다른 긁기)는 한 글자도 안 바뀐다. 올리기: python weekly/oldserver_patch/deploy.py
FROM <AWS 계정 번호>.dkr.ecr.ap-northeast-2.amazonaws.com/cardnews-render@sha256:98fa76764f42bc14ceac61e9f015129aeeb0f2e8776305dfb91fb4ceff7742b1
COPY cover.py app.py /var/task/
COPY procure/week.py procure/blog.py /var/task/procure/
