# 카드뉴스 작업대 Lambda — 라벨링 사슬 «우리 것» 만.
#
# **저쪽(render-server)과 갈라 나온 상자다.** 그쪽에는 yt-dlp·밈 그림·얼굴
# 사진이 들어 있는데 우리 길은 하나도 안 쓴다. 여기는 글꼴·PIL·ffmpeg(영상
# 자리, 2026-09-16) 뿐이다.
#
# **넣을 것을 빠뜨리면 «모든» 문이 500 이 된다.** app.py 가 임포트하다 죽기
# 때문이다 — 저쪽에서 template_out.py 를 안 넣어 실제로 그랬다(2026-08-25).
# 그래서 모듈은 한 줄에 모아 두고, 시험(`test_상자.py`)이 이 파일과 실제
# 임포트를 대조한다.

FROM mwader/static-ffmpeg:7.1 AS ffmpeg

FROM public.ecr.aws/lambda/python:3.11

COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY fonts/ /var/task/fonts/
COPY template.json /var/task/
COPY weblib/ /var/task/weblib/
COPY app.py cardnews_compose.py edit_store.py rita.py template_out.py template_render.py workbench.py 주소.py 영상굽기.py 결과쪽.py 작업대말.py /var/task/

CMD ["app.handler"]
