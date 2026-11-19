FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY api ./api
COPY web ./web
COPY vite.config.ts tsconfig.json ./
RUN pnpm build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache su-exec && corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY api ./api
COPY --from=build /app/web/dist ./web/dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p /app/data && chown -R node:node /app && chmod 755 /usr/local/bin/docker-entrypoint.sh
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
EXPOSE 3000
USER root
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["pnpm", "start"]
