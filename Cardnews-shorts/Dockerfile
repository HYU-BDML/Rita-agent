# ffmpeg 가 필요해 정적 호스팅에는 올릴 수 없다. 컨테이너를 돌리는 곳(Render, Railway, Fly.io, 클라우드 VM)에 올린다.
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-nanum \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ /srv/app/
COPY tools/ /srv/tools/
RUN python app/get_fonts.py

ENV HOST=0.0.0.0
ENV PORT=8080
ENV PROJECTS_DIR=/data/projects
EXPOSE 8080
CMD ["python", "app/studio.py"]
ENV ALLOW_LOCAL_KEY=0
