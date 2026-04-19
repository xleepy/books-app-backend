# Infrastructure Risk Analysis

## Current Setup: 6 vCPU ARM · 8 GB RAM · 256 GB Disk · Germany (EU)

The frontend is a React Native/Expo app that ships to app stores. The server hosts the **backend API** (~17 endpoints), likely **PostgreSQL** (via Supabase or self-hosted), and a Node.js/similar API process. Initial user base is EU-region — Germany is well-positioned with ~10–50ms latency across the continent, so no geographic distribution is needed at this stage.

---

## Risk Assessment

### Compute (6 vCPU ARM)

| Risk | Severity | Notes |
|------|----------|-------|
| CPU saturation under concurrent users | **Medium** | Feed queries + personalization + leaderboard aggregations are CPU-heavy. At ~500 concurrent users, you'll hit contention |
| Single-node SPOF | **High** | No redundancy — one bad deploy or OOM kill takes down the whole app |
| ARM compatibility | **Low** | Node.js, PostgreSQL, and most backend stacks have solid ARM64 support |
| No horizontal scaling path | **Medium** | Single server can't distribute load without a migration |

**Estimated runway:** Comfortable up to ~200–500 daily active users with typical read-heavy patterns. Leaderboards and feed aggregations are the first bottlenecks.

---

### Memory (8 GB RAM)

| Risk | Severity | Notes |
|------|----------|-------|
| PostgreSQL + API process competing | **Medium** | PG shared_buffers default + Node.js heap + OS = likely already at 60–70% utilization |
| OOM kills under traffic spikes | **High** | No swap = silent API crashes. Add swap immediately if not present |
| No room for Redis/cache layer | **Medium** | Leaderboards, feed caching, and session store all want in-memory cache |
**Estimated runway:** Fine for <300 concurrent sessions. One memory leak in the API will take everything down.

---

### Disk (256 GB)

| Risk | Severity | Notes |
|------|----------|-------|
| PostgreSQL data growth | **Medium** | Swipe events + library entries + reviews grow fast. At 10k users, swipes alone can hit 10–50 GB/year |
| No disk monitoring/alerts | **High** | Full disk = PostgreSQL corruption and silent write failures |
| Backup footprint | **Medium** | Backups on same disk = no recovery if disk fails |

**Estimated runway:** ~1–2 years at small scale. Media is URL-based so disk is primarily PostgreSQL data and backups.

---

### Overall Runway Estimate

```
Current stage (dev/early prod, <1k users):  ✅ Fine
Growth stage (1k–10k DAU):                 ⚠️  Memory and DB become bottlenecks
Scale stage (10k+ DAU):                    ❌  Single-node fails here
```

---

## Immediate Low-Cost Fixes (Do Now)

1. **Add swap** (4–8 GB) — prevents OOM kills from taking down the whole server
2. **Set up disk alerts** — alert at 70% / 85% disk usage
3. **Add a process manager** — pm2 or systemd with auto-restart for the API
4. **Daily PG backups off-disk** — `pg_dump` to R2/S3 daily via cron
5. **Add a reverse proxy** (Nginx or Caddy) — SSL termination, gzip, rate limiting, request buffering in front of Node.js. A load balancer is not needed until you run 2+ API instances.

---

## Migration Roadmap

### Phase 1 — Stabilize (Now → 1k users)

**Goal:** Survive traffic spikes without manual intervention

- Move to **managed PostgreSQL** (Supabase Pro, Neon, or Railway) — removes DB ops burden
- Keep API on current server + add swap
- Cost delta: ~$25–50/mo

### Phase 2 — Decouple (1k → 10k users)

**Goal:** Independent scaling of API and DB

- **API**: Move to containerized deployment (Railway, Render, or Fly.io) — auto-scales, zero-downtime deploys
- **DB**: Stay on managed PostgreSQL, upgrade plan as needed
- **Cache**: Add Upstash Redis (serverless, pay-per-use) for leaderboards and feed caching
- **Auth**: Already on Supabase — keep it
- Cost delta: ~$50–150/mo total infra

### Phase 3 — Scale (10k+ users)

**Goal:** Horizontal scale, observability, geographic distribution

- **API**: Kubernetes (if team has ops capacity) or stay on Fly.io/Railway with multiple regions
- **DB**: Read replicas for feed/leaderboard queries; connection pooling via PgBouncer
- **Search**: Typesense or Meilisearch for book search (offload from PG LIKE queries)
- **CDN**: Cloudflare in front of everything
- **Observability**: Grafana Cloud or Datadog for metrics/logs/alerts
- Cost delta: $300–800/mo depending on traffic

---

## Recommended Next Step

The single highest-leverage action right now is **moving your database to a managed service** (Supabase Pro or Neon). It eliminates the biggest SPOF, gives automatic backups, and costs ~$25/mo — much cheaper than an incident at 3am.
