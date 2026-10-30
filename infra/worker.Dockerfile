# Ejemplo conceptual; fijar imagen por digest tras revisión supply chain.
FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
RUN groupadd -g 10001 worker && useradd -r -u 10001 -g worker worker
WORKDIR /opt/worker
COPY workers/render/ /opt/worker/
RUN mkdir -p /opt/worker/out && chown -R worker:worker /opt/worker
USER worker
# El orquestador real debe inyectar job manifest validado; imagen de prueba solamente.
CMD ["bash","-lc","echo 'Worker image prepared; queue consumer pending implementation' && sleep 1"]
