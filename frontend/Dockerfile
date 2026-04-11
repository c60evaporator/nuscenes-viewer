# ── 共通ベース ────────────────────────────────
FROM node:20-slim AS base

WORKDIR /app
COPY package*.json ./

# ── 開発ステージ ──────────────────────────────
FROM base AS development

RUN npm ci

# node_modulesはコンテナ内に残し、ソースはvolumeでマウント
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

# ── ビルドステージ ─────────────────────────────
FROM base AS builder

RUN npm ci
COPY . .

# 本番ビルド（型チェックも実行）
RUN npm run build

# ── 本番ステージ ───────────────────────────────
FROM nginx:1.27-alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
