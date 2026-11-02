# Solo ejecuta un plan ya validado: sin base de datos, sin secretos y sin red (docker run --network none).
# Liberation Sans sustituye a Arial por las reglas de fontconfig.
FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fontconfig fonts-liberation \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin render
COPY run-plan.mjs /app/run-plan.mjs
ENV HOME=/tmp XDG_CACHE_HOME=/tmp
USER 10001:10001
WORKDIR /work
ENTRYPOINT ["node", "/app/run-plan.mjs"]
