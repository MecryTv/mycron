# works-bot: shared Discord bot for works (W-0040).
# Build from the repository root, the service uses the Discord client of the works plugin:
#   docker build -f services/works-bot/Dockerfile -t works-bot .
FROM node:22-alpine

WORKDIR /app
COPY plugins/works/skills/works/scripts/discord-api.mjs plugins/works/skills/works/scripts/discord-api.mjs
COPY services/works-bot/server.mjs services/works-bot/server.mjs

ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1

CMD ["node", "services/works-bot/server.mjs"]
