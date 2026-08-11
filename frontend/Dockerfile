FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --frozen-lockfile

FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S massanalysis && adduser -S massanalysis -G massanalysis

COPY --from=deps /app/node_modules ./node_modules

COPY --from=builder /app/.next ./.next

COPY --from=builder /app/package.json ./package.json

# COPY --from=builder /app/public ./public

USER massanalysis

EXPOSE 3000

ENV PORT=3000

CMD ["npm", "start"]
