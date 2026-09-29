# 카드뉴스 «분석» Lambda — 웹의 「분석하기」 단추가 실제로 계량을 돌리는 상자.
#
# **작업대 상자와 갈라 놓았다.** 까닭은 `lambda_분석.py` 독스트링에 적어 뒀다 —
# 무게(OpenCV)·열쇠(글자 모델·게시판 암호)·시간이 다 다르다.
#
# **짓는 자리가 `cardnews/` 다**(`docker build -f analyze/Dockerfile ..`).
# 저장소 구조를 그대로 담아야 하기 때문이다: `make_dsl_cardnews` 가
# `ROOT/analyze` 와 `ROOT/render` 를 찾아 들어간다. 구조를 옮기면 경로를 손질할
# 일이 없다 — 손질하면 그때부터 «내 기계에서만 되는» 코드가 된다.
#
# **넣을 것을 빠뜨리면 임포트에서 죽는다.** 그러면 비동기로 불린 판이라 아무도
# 답을 못 보고 게시물이 「분석중」에 갇힌다. `test_분석상자.py` 가 이 파일과
# 실제 임포트를 대조한다.

FROM public.ecr.aws/lambda/python:3.11

COPY analyze/requirements-lambda.txt .
RUN pip install --no-cache-dir -r requirements-lambda.txt

# 분석 알맹이. `data/` 와 시험은 뺀다 — 쓸 자리는 /tmp 로 따로 준다.
COPY analyze/*.py            /var/task/analyze/
COPY analyze/ruler/          /var/task/analyze/ruler/
COPY analyze/fonts/          /var/task/analyze/fonts/
COPY analyze/calibration.json /var/task/analyze/
COPY analyze/app.py          /var/task/app.py

# 틀을 뽑는 데 필요한 것들. `make_dsl_cardnews` 가 저 둘을 임포트한다.
COPY dify/*.py               /var/task/dify/
COPY render/rita.py render/template_out.py render/template_render.py render/주소.py \
     render/cardnews_compose.py render/edit_store.py    /var/task/render/
COPY render/fonts/           /var/task/render/fonts/
COPY render/template.json    /var/task/render/

# **쓸 자리는 /tmp 다.** `/var/task` 는 읽기 전용이라 `config.py` 가 임포트에서
# `mkdir` 하다 죽는다(그러면 이 함수의 «모든» 판이 죽는다).
ENV CARDNEWS_DATA=/tmp/cardnews-data
ENV CARDNEWS_RECIPES=/tmp/cardnews-recipes
# 파이썬이 `analyze/` 를 못 찾으면 `lambda_분석.py` 자신도 못 뜬다.
ENV PYTHONPATH=/var/task/analyze:/var/task/dify:/var/task/render

# 손잡이 이름만 ASCII 로 둔다 — `app.py` 독스트링 참고.
CMD ["app.handler"]
