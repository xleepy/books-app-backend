FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json nodemon.json ./
COPY prisma ./prisma
COPY src ./src

RUN npm run db:generate
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

RUN npm ci --omit=dev --ignore-scripts

USER app

EXPOSE 3000

CMD ["node", "dist/index.js"]
