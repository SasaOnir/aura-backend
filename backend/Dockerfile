# Backend Dockerfile — multi-stage per immagine leggera
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npx prisma generate --schema=prisma/schema.prisma && npx nest build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Solo node_modules di produzione + dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
# Lo schema.sql è già applicato dal init-script di Postgres; qui facciamo solo
# prisma generate per il client (già fatto sopra) + bootstrap Super Admin.
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "dist/main.js"]
