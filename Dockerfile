FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node . .
# APP_VERSION: commit đang build (Coolify truyền SOURCE_COMMIT) — hiện ở /health để đối chiếu deploy.
ARG SOURCE_COMMIT=""
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data APP_VERSION=$SOURCE_COMMIT
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
