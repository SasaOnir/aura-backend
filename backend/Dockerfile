# Backend Dockerfile per Aura — Alpine + native modules (argon2)
# Semplificato: singolo stage per evitare problemi di optional deps musl
# quando si copiano node_modules tra stage con --omit=dev.

FROM node:20-alpine AS builder
WORKDIR /app

# Installa dipendenze build (alcuni native modules possono richiederli)
RUN apk add --no-cache python3 make g++ libc6-compat

COPY package.json package-lock.json* ./
# npm ci installa ESATTAMENTE quello in package-lock (inclusi optional deps musl)
# --include=optional assicura che i platform-specific binary vengano scaricati
RUN npm ci --include=optional --no-audit --no-fund

# Copia il codice e builda
COPY . .
RUN npx prisma generate --schema=prisma/schema.prisma && npx nest build

# Rimuovi devDependencies dopo il build per ridurre la size
RUN npm prune --omit=dev

# --- Stage runner finale ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# libc6-compat serve per alcuni native modules su Alpine
RUN apk add --no-cache libc6-compat wget

# Copia solo quello che serve per runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "dist/main.js"]
