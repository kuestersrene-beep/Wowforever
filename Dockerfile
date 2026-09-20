# --- Stufe 1: Abhängigkeiten installieren ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# --- Stufe 2: App bauen ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Diese Werte müssen zur Build-Zeit vorhanden sein, weil Next.js
# NEXT_PUBLIC_* Variablen fest ins Client-Bundle einbaut.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SURVEY_DEADLINE
ARG NEXT_PUBLIC_LAUNCH_DATE
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SURVEY_DEADLINE=$NEXT_PUBLIC_SURVEY_DEADLINE
ENV NEXT_PUBLIC_LAUNCH_DATE=$NEXT_PUBLIC_LAUNCH_DATE
RUN npm run build

# --- Stufe 3: schlankes Laufzeit-Image ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
