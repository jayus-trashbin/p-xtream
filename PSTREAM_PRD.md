# P-Stream Ecosystem — Product Requirements Document (PRD)

> **Version:** 1.0  
> **Status:** Active  
> **Audience:** AI coding agents, contributors, tech leads  
> **Repos:** [web](https://github.com/xp-technologies-dev/p-stream) · [providers](https://github.com/xp-technologies-dev/providers) · [proxy](https://github.com/xp-technologies-dev/simple-proxy) · [backend](https://github.com/xp-technologies-dev/backend) · [userscript](https://github.com/xp-technologies-dev/userscript)

---

## 1. Product Overview

P-Stream is a self-hosted streaming aggregator. It does not host content — it scrapes publicly accessible embeds from third-party sites and plays them through a unified HLS player in the browser.

**Core value proposition:** One interface to browse, search, and watch movies/shows from dozens of sources, with optional user accounts for sync, bookmarks, watch progress, and watch parties.

**Who uses it:** Self-hosters who want a Netflix-like experience without a subscription. Technical users comfortable running Docker or Node.js services.

---

## 2. System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      BROWSER (User)                          │
│                                                              │
│  ┌─────────────┐  ┌────────────┐  ┌─────────────────────┐   │
│  │  Extension   │  │ Userscript │  │  Desktop App (stub) │   │
│  │  (Plasmo)    │  │ (GM_xhr)   │  │ (__PSTREAM_DESKTOP__)│  │
│  └──────┬───────┘  └─────┬──────┘  └──────────┬──────────┘  │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│  ┌───────────────────────▼──────────────────────────────┐    │
│  │           FRONTEND  (React 18 + Vite 5)              │    │
│  │  474 TS/TSX files · 14 Zustand stores                │    │
│  │  55 locales · 22 themes · HLS player                 │    │
│  │  Watch Party · Trakt sync · Debrid support           │    │
│  └──────────────────┬──────────────────────────────────┘    │
└─────────────────────┼──────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          │                       │
┌─────────▼──────────┐  ┌────────▼─────────┐
│   CORS Proxy        │  │  M3U8 Proxy       │
│   (Nitro/h3)        │  │  (Nitro/h3)       │
│   Turnstile + JWT   │  │  Cache + Prefetch │
│   Header rewriting  │  │  Rewrites .ts URLs│
└─────────────────────┘  └──────────────────┘
          │
┌─────────▼──────────────────────────────────┐
│          PROVIDERS  (@p-stream/providers)   │
│  50+ sources · 38+ embeds · anime/film/TV  │
│  Debrid: Real-Debrid, TorBox               │
└──────────────┬─────────────────────────────┘
               │
┌──────────────▼─────────────────────────────┐
│          BACKEND  (Nitro + Prisma 7 + PG)  │
│  Auth (Ed25519) · Sessions (JWT 21d)       │
│  Bookmarks · Progress · Lists · Settings   │
│  Discover (TMDB+Trakt) · Watch Party       │
│  Metrics (Prometheus)                      │
└────────────────────────────────────────────┘
```

---

## 3. Repositories & Tech Stack

| Repo | Runtime | Framework | Key Deps | Purpose |
|------|---------|-----------|----------|---------|
| `p-stream` (web) | Browser | React 18 + Vite 5 + TS | Zustand, hls.js, i18next, Tailwind | Main SPA |
| `providers` | Browser/Node | TypeScript | cheerio, crypto-js | Scraping engine |
| `simple-proxy` | Node 18+ | Nitro (h3) | jose | CORS + M3U8 proxy |
| `backend` | Node 18+ | Nitro + Prisma 7 | PostgreSQL, prom-client, tweetnacl | API server |
| `userscript` | Browser (GM) | Vanilla JS | GM_xmlhttpRequest | Fallback scraper |

**Package manager:** pnpm  
**Monorepo tool:** Not yet (target: Turborepo)  
**DB:** PostgreSQL (Prisma ORM, 20+ migrations)  
**Container:** Docker + docker-compose

---

## 4. Features & Requirements

### 4.1 Authentication

**Current implementation:**
- Passwordless — Ed25519 keypair generated client-side (tweetnacl)
- Registration: challenge-response (UUID challenge, 10 min TTL, signed with private key)
- Sessions: JWT HS256, 21-day TTL, bumped on every authenticated request
- Mnemonic seed phrase (BIP39) shown to user for account recovery
- WebAuthn credential ID stored in localStorage (outside Zustand, not migrated)

**Requirements:**
- [x] Register without email/password
- [x] Session persistence across browser restarts
- [ ] Admin role enforcement (field exists, never checked — BUG-02)
- [ ] CORS locked to specific origins (currently `*` — security gap)
- [ ] Rate limiting on `/auth/` routes (currently none)

### 4.2 Content Discovery

- TMDB API for metadata (posters, descriptions, cast, ratings)
- Trakt API for trending/popular lists (optional integration, crashes if keys absent — BUG-11)
- Rotten Tomatoes: scraped directly from HTML (fragile, breaks on markup changes)
- Cache: 1h on discover endpoint (comment incorrectly says "20 min" — BUG-07)

**Requirements:**
- [x] Movie and TV show search via TMDB
- [x] Trending/popular via Trakt (optional)
- [ ] RT scraper replaced with stable data source or cached backend call
- [ ] Discover endpoint must not crash if Trakt/TMDB partial failure

### 4.3 Video Playback

- HLS via hls.js
- Subtitles, picture-in-picture, Chromecast support
- M3U8 proxy rewrites playlist and segment URLs for CORS-blocked streams
- Debrid integration: Real-Debrid and TorBox for torrent-backed sources

**Stream resolution order:**
1. Provider scrapes source → returns embed URLs
2. Embed extractor pulls stream URL (HLS m3u8 or direct mp4)
3. If `!CORS_ALLOWED` flag: route through M3U8 proxy
4. hls.js loads and plays

**Requirements:**
- [x] HLS playback with quality selection
- [x] Subtitle tracks
- [x] Debrid torrent sources
- [ ] M3U8 proxy URL must throw on misconfiguration (currently silent fail — BUG-06)
- [ ] Proxy SSRF protection (currently any URL accepted — BUG-05)

### 4.4 User Data Sync

Stored in backend PostgreSQL, synced via API with JWT auth:

| Feature | Endpoint group | Notes |
|---------|---------------|-------|
| Bookmarks | `/api/bookmarks` | Movie/show saves |
| Watch progress | `/api/progress` | Per-episode timestamps |
| Watch history | `/api/history` | Viewing log |
| Custom lists | `/api/lists` | Public/private, shareable |
| Settings | `/api/settings` | 24+ preferences synced |
| Trakt sync | `/api/trakt` | Bidirectional OAuth sync |

**Critical bug:** Private lists are returned with HTTP 200 instead of 403 due to `return createError()` instead of `throw createError()` — BUG-01. Fix: 1 line change.

### 4.5 Watch Party

**Current:** Polling REST (1 POST + 1 GET per second per user). Room code: 4 numeric digits (9000 combinations, high collision risk). No auth on endpoints (anyone can spoof host status — BUG-04). State stored in-memory Map (lost on restart, not horizontally scalable).

**Target:** WebSocket-based, Redis-backed, authenticated, 6+ char alphanumeric room codes.

### 4.6 Internationalization

- 55 languages via Weblate (~1.7MB of JSON locale files)
- Currently all loaded eagerly — only `en.json` has a manual chunk split
- Target: lazy-load selected locale on demand

### 4.7 Theming

- 22 built-in themes + custom theme support
- Custom themes stored in backend (no schema validation before save)
- Custom theme Zod schema validation required before persistence

### 4.8 Provider / Scraping Engine

- 50+ active sources, 38+ embed extractors
- 20+ archived/dead providers (in `archive/` folder)
- No health monitoring — broken providers are silent until user notices
- No circuit breaker — a broken provider blocks scraping thread for full timeout (up to 30s)
- Static priority order — no dynamic ranking by performance
- Debrid provider reads directly from `window.localStorage` (violates separation of concerns — BUG, item 7 in technical debt)

---

## 5. Non-Functional Requirements

### 5.1 Security

| Requirement | Priority | Status |
|-------------|----------|--------|
| Private lists inaccessible to non-owners | Critical | ❌ Broken (BUG-01) |
| Admin routes require auth + permission check | Critical | ❌ Missing (BUG-02) |
| Metrics endpoint requires auth token | High | ❌ Open (BUG-03) |
| Watch Party requires valid session | Critical | ❌ Open (BUG-04) |
| Proxy blocks SSRF (private IPs, localhost, cloud metadata) | Critical | ❌ Missing (BUG-05) |
| CORS locked to allowlist, not `*` | High | ❌ Wildcard everywhere |
| Sensitive tokens encrypted at rest | Medium | ❌ Plaintext in DB |
| Auth routes rate-limited | High | ❌ None |

### 5.2 Performance

| Requirement | Target |
|-------------|--------|
| Initial JS bundle (gzip) | < 1.5 MB |
| Locale load | 1 eager (en) + lazy per language |
| Provider scrape (happy path) | < 5s |
| Provider scrape (with circuit breaker) | < 8s max |
| Watch Party sync latency | < 100ms (WebSocket) |
| CI build time | < 5 min |

### 5.3 Reliability

- Provider circuit breaker: 3 failures → disable 5 min → exponential backoff
- Backend must not crash when Trakt/TMDB partially unavailable
- M3U8 proxy cache bounded (LRU, max `CACHE_MAX_MEMORY_MB` env)
- All Zustand stores versioned with migration path (currently none have versions)

### 5.4 Observability

- Backend: Prometheus metrics at `/metrics` (auth-protected)
- Proxy: `/health` endpoint + structured JSON logs
- Provider: health check CLI + status dashboard
- All services: structured JSON logging in production

### 5.5 Developer Experience

- Monorepo: `pnpm install && pnpm dev` starts everything
- Local setup time: < 5 minutes
- All env vars documented in a single `.env.example` (~45 variables)
- 0 test coverage today → target 35% in 3 months
- CI runs on every PR: lint + type-check + tests

---

## 6. Known Bugs (Prioritized)

### 🔴 Critical (fix before anything else)

| ID | File | Description | Fix |
|----|------|-------------|-----|
| BUG-01 | `backend/routes/lists/[id].get.ts:17` | `return createError()` leaks private list data with HTTP 200 | Change to `throw createError()` |
| BUG-02 | `p-stream/src/pages/admin/AdminPage.tsx` | `/admin` route has no auth guard or permission check | Add `useAuth()` guard + `permissions.includes('admin')` |
| BUG-03 | `backend/routes/metrics/index.get.ts` | Prometheus metrics publicly accessible | Add `METRICS_TOKEN` env check |
| BUG-04 | `backend/api/player/status.post.ts` | Watch Party accepts any userId without JWT validation | Require + validate Bearer token, match userId to session |
| BUG-05 | `simple-proxy/src/routes/index.ts` | Proxy accepts any destination URL (SSRF) | Block private IPs, localhost, cloud metadata endpoints |

### 🟡 Important

| ID | Description | Fix |
|----|-------------|-----|
| BUG-06 | M3U8 proxy URL defaults to `proxy.example.com` — silent failure | Throw error if not configured |
| BUG-07 | Cache comment says "20 Minutes", value is 3600s (1 hour) | Fix comment |
| BUG-08 | `nanoid` v3 vs v5 split between packages | Align to one major |
| BUG-09 | `maintenanceTime` = past date with typo "31th" | Remove or move to env |
| BUG-10 | Logger swallows all output in dev (`NODE_ENV !== 'production'`) | Log always, format by env |
| BUG-11 | `trakt` can be `null`, used without null check in discover | Add null check or throw on startup |

---

## 7. Technical Debt Register

### Frontend (474 TS/TSX files)

| # | Item | Severity | Action |
|---|------|----------|--------|
| 1 | `src/stores/__old/` runs migrations on every boot | Medium | Remove after verifying no-op |
| 2 | `letterboxd.ts` — declared dead code | Low | Delete |
| 3 | RT scraper does string matching on HTML | Medium | Replace with stable source |
| 4 | `public/streamhelper_bg.wasm` — no source, no docs | High | Investigate via git history; remove if unresolvable |
| 5 | ~20 direct `localStorage` calls outside Zustand | Medium | Centralize in `useLocalStorageState(key)` hook |
| 6 | `Jip.tsx` / `Pas.tsx` reinvent Button with inline styles | Low | Replace with actual Button component |
| 7 | Debrid reads `window.localStorage` in provider lib | High | Pass token via `ScrapeContext` |
| 8 | 14 Zustand stores with no schema version | Medium | Add `__version` field + migration runner |
| 9 | `embed-preview.png` (1.6MB), splash screens (819KB) | Medium | Convert to WebP |
| 10 | 55 locales loaded eagerly (1.7MB) | Medium | Lazy-load by selected language |
| 11 | `import 'core-js/stable'` (~200KB gzip) | Medium | Remove; target is Chrome 90+ |
| 12 | Single `ErrorBoundary` at root | Medium | Add boundaries at player, discover, settings |
| 13 | `VITE_GA_ID` not in `example.env` | Low | Document |
| 14 | `window.__CONFIG__` override not documented | Medium | Add to README |
| 15 | `__PSTREAM_DESKTOP__` target — no desktop app exists | Medium | Decide: build or remove dead code |
| 16 | `RuntimeConfig` has 35 fields inline | Medium | Split into sub-interfaces with Zod |
| 17 | `splitVendorChunkPlugin()` deprecated in Vite 5 | Low | Remove |
| 18 | `"name": "P-Stream"` in package.json (space invalid for npm) | Low | Rename to `"p-stream"` |
| 19 | 0 tests (vitest configured but empty) | High | Write tests |
| 20 | `PlayerView.preload()` called at import time | Low | Move to route-based preload |

### Providers

| # | Item | Severity |
|---|------|----------|
| 1 | No health monitoring for any provider | High |
| 2 | Static priority order | Medium |
| 3 | No circuit breaker | High |
| 4 | `crypto-js` (~400KB) — replaceable with Web Crypto | Medium |
| 5 | `node-fetch` redundant (Node 18+ has native fetch) | Low |
| 6 | `cheerio@1.0.0-rc.12` — years-old RC | Low |
| 7 | `archive/` folder with 20+ dead providers | Low |
| 8 | CI does not run existing tests | High |

### Simple Proxy

| # | Item | Severity |
|---|------|----------|
| 1 | SSRF — no URL validation | Critical |
| 2 | No rate limiting | High |
| 3 | Cache: up to 10GB RAM (2000 entries × 5MB) | High |
| 4 | User-Agent from 2021 (`Firefox/93.0`) | Medium |
| 5 | No `/health` endpoint | Low |
| 6 | Aggressive prefetch (all .ts segments at once) | Medium |

### Backend

| # | Item | Severity |
|---|------|----------|
| 1 | CORS `*` on all routes including auth | High |
| 2 | `jsonwebtoken` has historical CVEs (`jose` already in proxy) | Medium |
| 3 | Auth logic copy-pasted per route | Medium |
| 4 | Sensitive tokens stored plaintext (debrid, tidb, trakt keys) | Medium |
| 5 | Watch Party state in-memory Map | Medium |
| 6 | `ratings` field is JSON string, not relational | Low |
| 7 | `permissions` field exists but is never checked | Medium |
| 8 | Challenge codes accumulate (no cleanup cron) | Low |
| 9 | `fs.writeFile('.metrics.json')` — race condition risk | Medium |
| 10 | Profile update logs full body (may contain tokens) | Low |

---

## 8. Roadmap

### Phase 0 — Security Hotfixes (1–2 days) 🔴

Fix all 5 critical bugs + misc typos/URLs. No new features. Ship immediately.

### Phase 1 — Monorepo (Weeks 1–2)

Consolidate 5 repos into one pnpm workspace with Turborepo. Shared types, unified `.env.example`, CI on PRs.

```
p-stream/
├── apps/
│   ├── web/
│   ├── backend/
│   └── proxy/
├── packages/
│   ├── providers/
│   ├── userscript/
│   └── shared/          ← NEW: types, Zod schemas, constants
├── docker/
├── pnpm-workspace.yaml
├── turbo.json
└── .env.example         ← ALL ~45 vars documented
```

### Phase 2 — Backend Security & Quality (Weeks 3–4)

- Centralized auth middleware
- Rate limiting on auth routes
- CORS allowlist
- Replace `jsonwebtoken` → `jose`
- Encrypt sensitive tokens at rest
- Watch Party → WebSocket + Redis
- Zod validation on all routes
- Integration tests with testcontainers

### Phase 3 — Frontend Cleanup (Weeks 5–6)

- Remove: `__old` stores, letterboxd, core-js polyfill, maintenance text, Jip/Pas
- Investigate: WASM file, Desktop App stubs, RT scraper
- Refactor: RuntimeConfig → sub-interfaces, localStorage → hook, locales → lazy
- Error boundaries per feature area
- Image optimization (WebP)
- Store versioning

### Phase 4 — Provider Improvements (Weeks 7–8)

- Health check system with CLI and dashboard
- Circuit breaker (3 failures → exponential backoff)
- Dynamic priority scoring
- Debrid token via context, not localStorage
- Replace crypto-js, remove node-fetch, update cheerio

### Phase 5 — Proxy Hardening (Weeks 9–10)

- SSRF blocklist enforced
- Rate limiting per IP
- LRU cache with memory cap
- Rotating modern User-Agent pool
- `/health` + Prometheus metrics
- Streaming responses for .ts segments

### Phase 6 — Userscript + A11y + Docs (Weeks 11–12)

- Userscript → TypeScript + esbuild build
- WCAG 2.1 AA audit: player, modals, forms
- Monorepo README, API docs, ADRs, deploy guide

### Phase 7 — DevOps (Weeks 13–14)

- Unified docker-compose with Redis service
- Full CI/CD: lint → test → build → push GHCR → deploy
- Dependabot/Renovate for dependency updates
- Weekly provider health check workflow

---

## 9. Success Metrics

| Metric | Now | 1 Month | 3 Months | 6 Months |
|--------|-----|---------|----------|----------|
| Critical security bugs | 5 | 0 | 0 | 0 |
| Test coverage | 0% | 15% | 35% | 50%+ |
| CI build time | N/A | < 8 min | < 5 min | < 3 min |
| Local setup time | ~30 min | < 5 min | < 2 min | < 1 min |
| Bundle size (gzip) | Unknown | Measured | < 2 MB | < 1.5 MB |
| Watch Party latency | ~1s | ~1s | < 100ms | < 50ms |
| Providers monitored | 0/50 | 10/50 | 50/50 | Auto-heal |
| Stores with versioning | 0/14 | 5/14 | 14/14 | + migration |
| npm audit criticals | Unknown | 0 | 0 | 0 |

---

## 10. Environment Variables Reference

All env vars across all services. Full values in `.env.example` (to be created in Phase 1).

### Backend

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `CRYPTO_SECRET` | ✅ | HS256 JWT signing key (min 32 chars) |
| `ALLOWED_ORIGINS` | ✅ | Comma-separated origins for CORS |
| `TMDB_API_KEY` | ✅ | TMDB v3 API key |
| `TRAKT_CLIENT_ID` | ⬜ | Trakt OAuth client ID |
| `TRAKT_CLIENT_SECRET` | ⬜ | Trakt OAuth client secret |
| `METRICS_TOKEN` | ⬜ | Bearer token for `/metrics` endpoint |
| `TURNSTILE_SECRET` | ⬜ | Cloudflare Turnstile secret for registration |

### Proxy (simple-proxy)

| Variable | Required | Description |
|----------|----------|-------------|
| `CORS_ALLOWED_ORIGINS` | ✅ | Comma-separated allowed origins |
| `JWT_SECRET` | ✅ | Shared with backend for proxy JWT auth |
| `CACHE_MAX_MEMORY_MB` | ⬜ | Max memory for M3U8 cache (default: 512) |
| `PREFETCH_ENABLED` | ⬜ | Enable .ts segment prefetch (default: true) |
| `PREFETCH_CONCURRENCY` | ⬜ | Max concurrent prefetch requests (default: 3) |
| `RATE_LIMIT_RPM` | ⬜ | Requests per minute per IP (default: 100) |

### Frontend (Vite build-time)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_TMDB_API_KEY` | ✅ | TMDB key for client-side metadata |
| `VITE_BACKEND_URL` | ✅ | Backend API base URL |
| `VITE_PROXY_URL` | ✅ | CORS proxy base URL |
| `VITE_M3U8_PROXY_URL` | ✅ | M3U8 proxy base URL |
| `VITE_TRAKT_CLIENT_ID` | ⬜ | Trakt OAuth client ID |
| `VITE_GA_ID` | ⬜ | Google Analytics measurement ID |
| `VITE_TURNSTILE_SITE_KEY` | ⬜ | Cloudflare Turnstile site key |

---

*Last updated: 2026-04-06*