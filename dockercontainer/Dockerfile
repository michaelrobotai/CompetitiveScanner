# ---------- Stage 1: dependencies ----------
FROM node:20.11-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Stage 2: runtime ----------
FROM node:20.11-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache curl tini tzdata && addgroup -S nodegrp && adduser -S nodeusr -G nodegrp
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Bootstrap (UI) assets are served from /app/public by Express; server-rendered templates live in /app/views
RUN mkdir -p /app/uploads /app/reports /app/logs && chown -R nodeusr:nodegrp /app
USER nodeusr
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]