FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache su-exec
COPY package*.json ./
RUN npm install --omit=dev
COPY api ./api
COPY web ./web
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p /app/data && chown -R node:node /app && chmod 755 /usr/local/bin/docker-entrypoint.sh
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
EXPOSE 3000
USER root
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm","start"]
