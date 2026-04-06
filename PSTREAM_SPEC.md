# P-Stream Ecosystem — Technical Specification

> **For:** AI coding agents and contributors implementing changes  
> **How to use this doc:** Every section maps to a concrete task. Each task has exact file paths, current code, expected output, and constraints. Start with Phase 0.

---

## Table of Contents

1. [Conventions](#1-conventions)
2. [Phase 0 — Security Hotfixes](#2-phase-0--security-hotfixes)
3. [Phase 1 — Monorepo Setup](#3-phase-1--monorepo-setup)
4. [Phase 2 — Backend Security & Quality](#4-phase-2--backend-security--quality)
5. [Phase 3 — Frontend Cleanup](#5-phase-3--frontend-cleanup)
6. [Phase 4 — Provider Improvements](#6-phase-4--provider-improvements)
7. [Phase 5 — Proxy Hardening](#7-phase-5--proxy-hardening)
8. [Phase 6 — Userscript + A11y + Docs](#8-phase-6--userscript--a11y--docs)
9. [Phase 7 — DevOps](#9-phase-7--devops)
10. [Data Models](#10-data-models)
11. [API Reference](#11-api-reference)
12. [Testing Patterns](#12-testing-patterns)

---

## 1. Conventions

### Code Style

- TypeScript strict mode everywhere (`"strict": true` in tsconfig)
- No `any` without explicit `// eslint-disable-next-line @typescript-eslint/no-explicit-any` + comment justifying why
- Zod for all external data validation (API bodies, env vars, localStorage reads)
- All async functions return explicit `Promise<T>` types
- Error handling: `throw` typed errors, never return them

### Commit Messages

```
type(scope): short description

Types: fix | feat | refactor | chore | test | docs | security
Scope: web | backend | proxy | providers | userscript | monorepo
Examples:
  security(backend): throw instead of return in private list guard
  fix(proxy): block SSRF via private IP validation
  feat(backend): centralize auth middleware
```

### File Naming

- React components: `PascalCase.tsx`
- Utilities/hooks: `camelCase.ts`
- Routes (Nitro): `[paramName].method.ts` (e.g., `[id].get.ts`)
- Tests: `*.test.ts` or `*.spec.ts` adjacent to source file

### Import Order (enforced by ESLint)

```typescript
// 1. Node built-ins
import { readFile } from 'fs/promises';
// 2. External packages
import { z } from 'zod';
// 3. Internal packages (@p-stream/*)
import { scrapeSource } from '@p-stream/providers';
// 4. Relative imports
import { useAuth } from '../hooks/useAuth';
```

---

## 2. Phase 0 — Security Hotfixes

**Do these in order. Do not skip any. Each is a small, self-contained change.**

---

### TASK-001: Fix Private List Leak (BUG-01)

**File:** `backend/server/routes/lists/[id].get.ts`

**Problem:** `return createError(...)` serializes the Error object and sends it as HTTP 200 with the list data attached.

**Find this pattern:**
```typescript
return createError({ statusCode: 403, message: 'List is not public' })
```

**Replace with:**
```typescript
throw createError({ statusCode: 403, message: 'List is not public' })
```

**Verification:** `GET /api/lists/{private_list_id}` without auth or as wrong user must return `403`, not `200`. The response body must not contain any list fields.

---

### TASK-002: Add Auth Guard to Admin Page (BUG-02)

**File:** `p-stream/src/pages/admin/AdminPage.tsx`

**Problem:** Route renders for any visitor — no auth check, no permission check.

**Step 1 — Wrap with auth guard:**
```typescript
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';

export function AdminPage() {
  const { loggedIn, account } = useAuth();

  if (!loggedIn) {
    return <Navigate to="/" replace />;
  }

  const isAdmin = account?.permissions?.includes('admin') ?? false;
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  // ... existing JSX
}
```

**Step 2 — Backend admin middleware:**

Create `backend/server/middleware/admin.ts`:
```typescript
import { defineEventHandler, createError, getHeader } from 'h3';
import { verifySession } from '../utils/auth';

export default defineEventHandler(async (event) => {
  // Only apply to /admin/* routes
  if (!event.node.req.url?.startsWith('/admin')) return;

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '');
  if (!token) throw createError({ statusCode: 401, message: 'Unauthorized' });

  const session = await verifySession(token);
  if (!session) throw createError({ statusCode: 401, message: 'Unauthorized' });

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user?.permissions.includes('admin')) {
    throw createError({ statusCode: 403, message: 'Forbidden' });
  }
});
```

**Verification:** `GET /admin` without token → 401. With valid non-admin token → 403. With valid admin token → 200.

---

### TASK-003: Protect Metrics Endpoint (BUG-03)

**File:** `backend/server/routes/metrics/index.get.ts`

**Add at the top of the handler:**
```typescript
import { getHeader, createError } from 'h3';

// Inside handler, before returning metrics:
const metricsToken = process.env.METRICS_TOKEN;
if (metricsToken) {
  const authorization = getHeader(event, 'authorization');
  if (authorization !== `Bearer ${metricsToken}`) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }
}
```

**Note:** If `METRICS_TOKEN` is not set, endpoint remains open (backwards compatible). Document in `.env.example` that setting this is strongly recommended in production.

---

### TASK-004: Authenticate Watch Party Endpoint (BUG-04)

**File:** `backend/server/api/player/status.post.ts`

**Add JWT validation and userId verification:**
```typescript
import { getHeader, readBody, createError } from 'h3';
import { verifySession } from '../../utils/auth';

export default defineEventHandler(async (event) => {
  // Require auth
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '');
  if (!token) throw createError({ statusCode: 401, message: 'Unauthorized' });

  const session = await verifySession(token);
  if (!session) throw createError({ statusCode: 401, message: 'Invalid session' });

  const body = await readBody(event);

  // Verify userId matches authenticated session
  if (body.userId !== session.userId) {
    throw createError({ statusCode: 403, message: 'userId mismatch' });
  }

  // ... existing handler logic
});
```

**Also protect** `backend/server/api/player/status.get.ts` to require auth for reading room status.

---

### TASK-005: Block SSRF in Proxy (BUG-05)

**File:** `simple-proxy/src/routes/index.ts`

**Create utility** `simple-proxy/src/utils/validateDestination.ts`:
```typescript
import { createError } from 'h3';

// Private IPv4 ranges
const PRIVATE_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^169\.254\./, // link-local
  /^::1$/,       // IPv6 loopback
  /^fc00:/,      // IPv6 unique local
];

const BLOCKED_HOSTS = [
  'localhost',
  'metadata.google.internal',
  '169.254.169.254', // AWS/GCP/Azure metadata
];

export function validateDestination(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid destination URL' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw createError({ statusCode: 400, message: 'Only HTTP/HTTPS allowed' });
  }

  const host = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTS.includes(host)) {
    throw createError({ statusCode: 400, message: 'Destination not allowed' });
  }

  for (const range of PRIVATE_RANGES) {
    if (range.test(host)) {
      throw createError({ statusCode: 400, message: 'Private IP destinations not allowed' });
    }
  }

  return parsed;
}
```

**In the main route handler**, call `validateDestination(destination)` before making any outbound request. If it throws, the error propagates.

---

### TASK-006: Fix M3U8 Proxy URL Silent Failure (BUG-06)

**File:** `providers/src/utils/proxy.ts`

**Find:**
```typescript
const DEFAULT_PROXY_URL = 'https://proxy.example.com';
let m3u8ProxyUrl = DEFAULT_PROXY_URL;
```

**Replace with:**
```typescript
let m3u8ProxyUrl: string | null = null;

export function getM3U8ProxyUrl(): string {
  if (!m3u8ProxyUrl) {
    throw new Error(
      '[P-Stream Providers] M3U8 proxy URL is not configured. ' +
      'Call setM3U8ProxyUrl(url) before using providers.'
    );
  }
  return m3u8ProxyUrl;
}
```

Update all call sites from `m3u8ProxyUrl` to `getM3U8ProxyUrl()`.

---

### TASK-007: Fix Logger in Dev Mode (BUG-10)

**File:** `backend/server/utils/logger.ts`

**Find the guard** that checks `NODE_ENV === 'production'` and silences all logs otherwise.

**Replace** with format-based logging:
```typescript
const isDev = process.env.NODE_ENV !== 'production';

export const log = {
  info: (msg: string, data?: Record<string, unknown>) => {
    if (isDev) {
      console.log(`[INFO] ${msg}`, data ?? '');
    } else {
      console.log(JSON.stringify({ level: 'info', msg, ...data, ts: Date.now() }));
    }
  },
  error: (msg: string, data?: Record<string, unknown>) => {
    if (isDev) {
      console.error(`[ERROR] ${msg}`, data ?? '');
    } else {
      console.error(JSON.stringify({ level: 'error', msg, ...data, ts: Date.now() }));
    }
  },
  warn: (msg: string, data?: Record<string, unknown>) => {
    if (isDev) {
      console.warn(`[WARN] ${msg}`, data ?? '');
    } else {
      console.warn(JSON.stringify({ level: 'warn', msg, ...data, ts: Date.now() }));
    }
  },
};
```

---

### TASK-008: Fix Trakt Null Crash (BUG-11)

**File:** `backend/server/routes/discover/index.ts`

**Find all usages of `trakt.*` methods.** Wrap each in a null guard:
```typescript
import { trakt } from '../utils/trakt';

// Before:
const trending = await trakt.lists.trending();

// After:
const trending = trakt ? await trakt.lists.trending().catch(() => []) : [];
```

**Also:** If `trakt` is null, the discover endpoint should still work using only TMDB data. Do not throw — return partial results.

---

### TASK-009: Fix Orphaned References

**Edit these files — find-and-replace the old repo slug:**

| File | Find | Replace |
|------|------|---------|
| `notifications.xml` | `p-stream/p-stream` | `xp-technologies-dev/p-stream` |
| `userscript/src/*.js` (`@updateURL`, `@downloadURL`) | `p-stream/Userscript` | `xp-technologies-dev/userscript` |
| `CONTRIBUTING.md` | `p-stream/p-stream/issues` | `xp-technologies-dev/p-stream/issues` |
| `SECURITY.md` | any reference to original project | update to current org |
| `docker-compose.yaml` (service name) | `movieweb` | `p-stream-web` |
| `README.md` (frontend) | `cd smov` | `cd p-stream` |

---

### TASK-010: Fix Typos and Dead Constants

| File | Find | Replace |
|------|------|---------|
| `p-stream/src/App.tsx` | `"March 31th 11:00 PM - 5:00 AM EST"` | Remove entire `maintenanceTime` export or move to `.env` |
| `public/config.js` | `AENBALED` | `ENABLED` |
| `backend/server/routes/discover/index.ts:124` | `// 20 Minutes for prod` | `// 1 hour for prod` |
| `p-stream/package.json` | `"name": "P-Stream"` | `"name": "p-stream"` |

**Remove** `const maintenance = false` and all related JSX from `App.tsx` unless it will be used.

---

## 3. Phase 1 — Monorepo Setup

### TASK-011: Initialize pnpm Workspace

**Root `pnpm-workspace.yaml`:**
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
``` 

**Folder structure to create:**
```
p-stream/                         ← new monorepo root
├── apps/
│   ├── web/                      ← move p-stream repo here
│   ├── backend/                  ← move backend repo here
│   └── proxy/                    ← move simple-proxy repo here
├── packages/
│   ├── providers/                ← move providers repo here
│   ├── userscript/               ← move userscript repo here
│   └── shared/                   ← NEW (see TASK-014)
├── docker/
│   ├── Dockerfile.web
│   ├── Dockerfile.backend
│   ├── Dockerfile.proxy
│   └── docker-compose.yml
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── weekly-health.yml
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .eslintrc.base.js
├── .prettierrc
├── .env.example
└── package.json
```

**Root `package.json`:**
```json
{
  "name": "p-stream-monorepo",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "type-check": "turbo run type-check"
  },
  "devDependencies": {
    "turbo": "latest",
    "typescript": "5.x",
    "eslint": "8.x",
    "prettier": "3.x"
  }
}
```

---

### TASK-012: Configure Turborepo

**`turbo.json`:**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".output/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "outputs": []
    },
    "test": {
      "outputs": ["coverage/**"],
      "dependsOn": ["^build"]
    },
    "type-check": {
      "outputs": []
    }
  }
}
```

---

### TASK-013: Shared TypeScript Config

**`tsconfig.base.json` at root:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

Each `apps/*/tsconfig.json` and `packages/*/tsconfig.json` should extend this:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  }
}
```

---

### TASK-014: Create `packages/shared`

**Purpose:** Eliminate type duplication across packages.

**`packages/shared/src/types/media.ts`:**
```typescript
export type MediaType = 'movie' | 'show';

export interface Media {
  id: string;
  tmdbId: number;
  type: MediaType;
  title: string;
  year?: number;
  poster?: string;
}

export interface Episode {
  season: number;
  episode: number;
}
```

**`packages/shared/src/types/progress.ts`:**
```typescript
import { Media, Episode } from './media';

export interface WatchProgress {
  media: Media;
  episode?: Episode;
  progress: number;       // seconds
  duration: number;       // seconds
  updatedAt: string;      // ISO 8601
}
```

**`packages/shared/src/types/bookmark.ts`:**
```typescript
import { Media } from './media';

export interface Bookmark {
  media: Media;
  createdAt: string;
}
```

**`packages/shared/src/validation/index.ts`:**
```typescript
import { z } from 'zod';

export const MediaTypeSchema = z.enum(['movie', 'show']);

export const ProgressSchema = z.object({
  tmdbId: z.number().int().positive(),
  type: MediaTypeSchema,
  progress: z.number().min(0),
  duration: z.number().positive(),
  season: z.number().int().positive().optional(),
  episode: z.number().int().positive().optional(),
});

export const BookmarkSchema = z.object({
  tmdbId: z.number().int().positive(),
  type: MediaTypeSchema,
});
```

**`packages/shared/package.json`:**
```json
{
  "name": "@p-stream/shared",
  "version": "0.0.1",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts",
    "./validation": "./src/validation/index.ts"
  }
}
```

---

### TASK-015: Align Dependencies

Run these from monorepo root after workspace setup:

```bash
# Check for version mismatches
pnpm ls nanoid --recursive
pnpm ls fuse.js --recursive
pnpm ls typescript --recursive

# Align nanoid to v5 everywhere
pnpm --filter "@p-stream/providers" add nanoid@5
pnpm --filter "p-stream-web" add nanoid@5  # if not already

# Remove node-fetch from providers (Node 18+ has native fetch)
pnpm --filter "@p-stream/providers" remove node-fetch
```

---

### TASK-016: Unified `.env.example`

Create `/.env.example` at monorepo root with ALL variables, organized by service:

```env
# ============================================================
# P-STREAM MONOREPO — Environment Variables
# Copy to .env and fill in your values
# ============================================================

# ── DATABASE ─────────────────────────────────────────────────
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pstream"

# ── BACKEND AUTH ─────────────────────────────────────────────
# Min 32 chars. Generate: openssl rand -hex 32
CRYPTO_SECRET=""

# ── BACKEND CORS ─────────────────────────────────────────────
# Comma-separated origins (no trailing slash)
ALLOWED_ORIGINS="http://localhost:5173,https://yourdomain.com"

# ── TMDB ─────────────────────────────────────────────────────
TMDB_API_KEY=""          # Server-side (backend)
VITE_TMDB_API_KEY=""     # Client-side (web)

# ── TRAKT (optional) ─────────────────────────────────────────
TRAKT_CLIENT_ID=""
TRAKT_CLIENT_SECRET=""
VITE_TRAKT_CLIENT_ID=""

# ── PROXY ────────────────────────────────────────────────────
VITE_PROXY_URL="http://localhost:3001"
VITE_M3U8_PROXY_URL="http://localhost:3001"
PROXY_CORS_ALLOWED_ORIGINS="http://localhost:5173"
CACHE_MAX_MEMORY_MB=512
PREFETCH_ENABLED=true
PREFETCH_CONCURRENCY=3
RATE_LIMIT_RPM=100

# ── METRICS ──────────────────────────────────────────────────
# Strongly recommended in production
METRICS_TOKEN=""

# ── CLOUDFLARE TURNSTILE (optional) ──────────────────────────
TURNSTILE_SECRET=""
VITE_TURNSTILE_SITE_KEY=""

# ── ANALYTICS (optional) ─────────────────────────────────────
VITE_GA_ID=""

# ── FEATURE FLAGS ────────────────────────────────────────────
VITE_ENABLE_WATCH_PARTY=true
VITE_ENABLE_TRAKT=false

# ── BACKEND SERVICE URLS (for web build) ─────────────────────
VITE_BACKEND_URL="http://localhost:3000"
```

---

### TASK-017: CI Workflow

**`.github/workflows/ci.yml`:**
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    name: Lint, Type-check, Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2  # needed for --filter=[HEAD^1]

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm turbo lint --filter=[HEAD^1]

      - name: Type Check
        run: pnpm turbo type-check --filter=[HEAD^1]

      - name: Test
        run: pnpm turbo test --filter=[HEAD^1]
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
```

---

## 4. Phase 2 — Backend Security & Quality

### TASK-018: Centralize Auth Middleware

**Create `backend/server/middleware/auth.ts`:**
```typescript
import { defineEventHandler, getHeader, createError, H3Event } from 'h3';
import { verifyJwt } from '../utils/jwt';
import prisma from '../utils/prisma';

// Public routes that do not require auth
const PUBLIC_ROUTES = [
  '/auth/register/start',
  '/auth/register/complete',
  '/auth/login/start',
  '/auth/login/complete',
  '/discover',
  '/health',
];

export interface AuthContext {
  userId: string;
  sessionId: string;
}

export default defineEventHandler(async (event: H3Event) => {
  const url = event.node.req.url ?? '';

  // Skip auth for public routes
  if (PUBLIC_ROUTES.some((r) => url.startsWith(r))) return;

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '');
  if (!token) throw createError({ statusCode: 401, message: 'Unauthorized' });

  const payload = verifyJwt(token);
  if (!payload) throw createError({ statusCode: 401, message: 'Invalid token' });

  // Bump session expiry
  const session = await prisma.session.findUnique({ where: { id: payload.sessionId } });
  if (!session || session.expiresAt < new Date()) {
    throw createError({ statusCode: 401, message: 'Session expired' });
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { expiresAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000) },
  });

  // Attach to event context for route handlers
  event.context.auth = { userId: session.userId, sessionId: session.id } satisfies AuthContext;
});
```

**Update all route handlers** to use `event.context.auth` instead of re-deriving the session.

---

### TASK-019: Replace jsonwebtoken with jose

**Install:**
```bash
pnpm --filter backend remove jsonwebtoken @types/jsonwebtoken
pnpm --filter backend add jose
```

**Create `backend/server/utils/jwt.ts`:**
```typescript
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.CRYPTO_SECRET!);
const alg = 'HS256';

export interface JwtPayload {
  sessionId: string;
  userId: string;
}

export async function signJwt(payload: JwtPayload): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime('21d')
    .sign(secret);
}

export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}
```

---

### TASK-020: CORS Allowlist

**File:** `backend/server/middleware/cors.ts` (create or update):
```typescript
import { defineEventHandler, setHeader, getHeader } from 'h3';

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export default defineEventHandler((event) => {
  const origin = getHeader(event, 'origin');

  if (origin && allowedOrigins.includes(origin)) {
    setHeader(event, 'Access-Control-Allow-Origin', origin);
    setHeader(event, 'Vary', 'Origin');
  }

  setHeader(event, 'Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  setHeader(event, 'Access-Control-Allow-Headers', 'Content-Type, Authorization');
  setHeader(event, 'Access-Control-Allow-Credentials', 'true');
});
```

**Remove** any `Access-Control-Allow-Origin: *` from route-level code.

---

### TASK-021: Rate Limiting on Auth Routes

**Install:**
```bash
pnpm --filter backend add @upstash/ratelimit  # or use in-memory with a simple Map
```

**Simple in-memory rate limiter** (no Redis needed yet):
```typescript
// backend/server/utils/rateLimit.ts
const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): void {
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || record.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (record.count >= maxAttempts) {
    throw createError({ statusCode: 429, message: 'Too many attempts. Try again later.' });
  }

  record.count++;
}
```

**Apply in auth routes:**
```typescript
// In /auth/register/start and /auth/login/start handlers:
import { checkRateLimit } from '../../utils/rateLimit';
import { getHeader } from 'h3';

const ip = getHeader(event, 'x-forwarded-for') ?? event.node.req.socket.remoteAddress ?? 'unknown';
checkRateLimit(`auth:${ip}`, 5, 60_000); // 5 attempts per 60 seconds
```

---

### TASK-022: Encrypt Sensitive Tokens at Rest

**Install:**
```bash
pnpm --filter backend add @noble/ciphers
```

**`backend/server/utils/encrypt.ts`:**
```typescript
import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils';

const KEY = hexToBytes(process.env.CRYPTO_SECRET!.slice(0, 64)); // 32 bytes

export function encryptToken(plaintext: string): string {
  const nonce = randomBytes(12);
  const cipher = gcm(KEY, nonce);
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = cipher.encrypt(encoded);
  // Store as: hex(nonce):hex(ciphertext)
  return `${bytesToHex(nonce)}:${bytesToHex(ciphertext)}`;
}

export function decryptToken(stored: string): string {
  const [nonceHex, ciphertextHex] = stored.split(':');
  const nonce = hexToBytes(nonceHex!);
  const ciphertext = hexToBytes(ciphertextHex!);
  const cipher = gcm(KEY, nonce);
  const decoded = cipher.decrypt(ciphertext);
  return new TextDecoder().decode(decoded);
}
```

**Apply to:** `debrid_token`, `tidb_key`, `febbox_key`, `trakt_key` columns in the User model. Encrypt on write, decrypt on read in the API layer.

**Migration:** Write a one-time migration script to re-encrypt existing plaintext values.

---

### TASK-023: Watch Party — WebSocket Migration

**Current state:** 1 POST + 1 GET per second per user.  
**Target state:** WebSocket connection per user, room state in Redis.

**Install:**
```bash
pnpm --filter backend add ioredis
```

**Server-side WebSocket handler** (`backend/server/routes/watch-party/[roomCode].ts`):
```typescript
import { defineWebSocketHandler } from 'h3'; // Nitro WS support
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);
const ROOM_TTL = 30 * 60; // 30 min inactivity

export default defineWebSocketHandler({
  async open(peer) {
    const roomCode = peer.url?.searchParams.get('roomCode');
    const token = peer.url?.searchParams.get('token');

    if (!roomCode || !token) {
      peer.close(4001, 'Missing roomCode or token');
      return;
    }

    const payload = await verifyJwt(token);
    if (!payload) {
      peer.close(4003, 'Unauthorized');
      return;
    }

    peer.subscribe(`room:${roomCode}`);
    await redis.setex(`room:${roomCode}:user:${payload.userId}`, ROOM_TTL, JSON.stringify({ joined: Date.now() }));
  },

  async message(peer, msg) {
    const data = msg.json() as { type: string; payload: unknown };
    const roomCode = peer.url?.searchParams.get('roomCode');

    if (data.type === 'player:update') {
      // Broadcast to all peers in room
      peer.publish(`room:${roomCode}`, JSON.stringify(data));
      await redis.setex(`room:${roomCode}:status`, ROOM_TTL, JSON.stringify(data.payload));
    }
  },

  async close(peer) {
    const roomCode = peer.url?.searchParams.get('roomCode');
    const payload = await verifyJwt(peer.url?.searchParams.get('token') ?? '');
    if (payload) {
      await redis.del(`room:${roomCode}:user:${payload.userId}`);
      peer.publish(`room:${roomCode}`, JSON.stringify({ type: 'user:left', userId: payload.userId }));
    }
  },
});
```

**Room code generation** (6 alphanumeric, ~2.2 billion combinations):
```typescript
import { customAlphabet } from 'nanoid';
const generateRoomCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);
```

**Frontend changes:**

Update `useWatchPartySync` hook to use WebSocket instead of polling:
```typescript
// apps/web/src/hooks/useWatchPartySync.ts
export function useWatchPartySync(roomCode: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    const url = `${BACKEND_WS_URL}/watch-party/${roomCode}?token=${token}&roomCode=${roomCode}`;
    const ws = new WebSocket(url);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'player:update') {
        // Sync player state
      }
    };

    wsRef.current = ws;
    return () => ws.close();
  }, [roomCode, token]);

  const sendUpdate = useCallback((playerState: PlayerState) => {
    wsRef.current?.send(JSON.stringify({ type: 'player:update', payload: playerState }));
  }, []);

  return { sendUpdate };
}
```

---

### TASK-024: Backend Tests

**Install (in `apps/backend`):**
```bash
pnpm add -D vitest @vitest/coverage-v8 testcontainers
```

**`apps/backend/test/auth.test.ts`:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer } from 'testcontainers';
import { signJwt, verifyJwt } from '../server/utils/jwt';

describe('JWT utils', () => {
  it('signs and verifies a valid payload', async () => {
    process.env.CRYPTO_SECRET = 'a'.repeat(64);
    const payload = { sessionId: 'sess-123', userId: 'user-456' };
    const token = await signJwt(payload);
    const verified = await verifyJwt(token);
    expect(verified?.userId).toBe('user-456');
  });

  it('returns null for invalid token', async () => {
    const result = await verifyJwt('notavalidtoken');
    expect(result).toBeNull();
  });
});
```

**`apps/backend/vitest.config.ts`:**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['server/**/*.ts'],
      exclude: ['server/middleware/**'],
    },
  },
});
```

---

## 5. Phase 3 — Frontend Cleanup

### TASK-025: Remove `src/stores/__old/`

**Steps:**
1. Open `apps/web/src/index.tsx`
2. Find `initializeOldStores()` — verify it exits early without doing any work (check the function body)
3. If it is safe (no side effects), remove the `import` and the `initializeOldStores()` call
4. Delete the directory: `rm -rf apps/web/src/stores/__old/`
5. Run `pnpm build` — fix any TS errors (there should be none if the function was already a no-op)

---

### TASK-026: Remove Dead Code

```bash
# Each removal: delete file, then run type-check to catch import errors
rm apps/web/src/backend/metadata/letterboxd.ts
rm apps/web/src/pages/Jip.tsx
rm apps/web/src/pages/Pas.tsx
```

For `Jip.tsx` and `Pas.tsx`: find their import sites and replace with the actual `Button` component from the design system (likely `src/components/ui/Button.tsx` or similar).

---

### TASK-027: Remove core-js Polyfill

**File:** `apps/web/src/index.tsx`

**Remove this line:**
```typescript
import 'core-js/stable';
```

**Also remove** from `package.json`:
```bash
pnpm --filter web remove core-js
```

**Verify:** Build and test in Chrome 90+. The browser target already handles everything this polyfill provided.

---

### TASK-028: Lazy-Load Locales

**File:** `apps/web/vite.config.mts`

Remove the manual chunk for `en.json` if present. Instead, configure i18next to lazy-load:

**`apps/web/src/setup/i18n.ts`:**
```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    lng: localStorage.getItem('__MW::language') ?? 'en',
    fallbackLng: 'en',
    backend: {
      loadPath: '/locales/{{lng}}.json',
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
```

Move `src/assets/locales/*.json` to `public/locales/*.json` so they are served as static files. Remove all locale files from the JS bundle.

**Install:**
```bash
pnpm --filter web add i18next-http-backend
```

---

### TASK-029: Centralize localStorage Access

**Create `apps/web/src/hooks/useLocalStorage.ts`:**
```typescript
import { useState, useCallback } from 'react';
import { z, ZodTypeAny } from 'zod';

export function useLocalStorage<T>(
  key: string,
  schema: ZodTypeAny,
  defaultValue: T
): [T, (value: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return schema.parse(JSON.parse(raw)) as T;
    } catch {
      return defaultValue;
    }
  });

  const setValue = useCallback((value: T) => {
    localStorage.setItem(key, JSON.stringify(value));
    setState(value);
  }, [key]);

  return [state, setValue];
}
```

**Migrate** all ~20 direct `localStorage.getItem`/`setItem` calls outside Zustand to use this hook or a non-hook equivalent.

---

### TASK-030: Add Error Boundaries

**Create `apps/web/src/components/ErrorBoundary.tsx`:**
```typescript
import { Component, ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary: ${this.props.name}]`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="p-4 text-red-500">
          Something went wrong in {this.props.name}. Please refresh.
        </div>
      );
    }
    return this.props.children;
  }
}
```

**Wrap these areas in `App.tsx` or their parent components:**
```tsx
<ErrorBoundary name="Player">
  <PlayerView />
</ErrorBoundary>

<ErrorBoundary name="Discover">
  <DiscoverPage />
</ErrorBoundary>

<ErrorBoundary name="Settings">
  <SettingsPage />
</ErrorBoundary>
```

---

### TASK-031: Add Zustand Store Versioning

**Pattern to apply to all 14 stores:**
```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface BookmarksStore {
  __version: number;
  bookmarks: Bookmark[];
  // ... other fields
}

const CURRENT_VERSION = 1;

const migrations: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {
  // Example: v0 → v1 migration
  1: (state) => ({
    ...state,
    bookmarks: (state.bookmarks as unknown[]) ?? [],
  }),
};

function migrate(state: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
  let current = state;
  for (let v = fromVersion + 1; v <= CURRENT_VERSION; v++) {
    const migrationFn = migrations[v];
    if (migrationFn) current = migrationFn(current);
  }
  return current;
}

export const useBookmarkStore = create<BookmarksStore>()(
  persist(
    (set) => ({
      __version: CURRENT_VERSION,
      bookmarks: [],
      // ... actions
    }),
    {
      name: '__MW::bookmarks',
      storage: createJSONStorage(() => localStorage),
      version: CURRENT_VERSION,
      migrate: (persistedState, version) => {
        const state = persistedState as Record<string, unknown>;
        return migrate(state, version) as BookmarksStore;
      },
    }
  )
);
```

Apply this pattern to all stores under `apps/web/src/stores/`.

---

### TASK-032: Investigate WASM File

**File:** `apps/web/public/streamhelper_bg.wasm` (102KB)

**Steps:**
1. `git log --all --follow -- public/streamhelper_bg.wasm` — find the commit that added it
2. Check the commit message and any associated PR
3. Search codebase: `grep -r "streamhelper" --include="*.ts" --include="*.tsx" --include="*.js"`
4. If no imports found and no documentation → open a PR to remove it with a note that it can be restored if a use case is found
5. If imports found → document in `public/WASM_README.md`: what it does, how to rebuild from source

---

### TASK-033: Fix RuntimeConfig

**File:** `apps/web/src/setup/config.ts`

**Break the monolithic `RuntimeConfig` into Zod-validated sub-schemas:**
```typescript
import { z } from 'zod';

const ProxyConfigSchema = z.object({
  proxyUrl: z.string().url(),
  m3u8ProxyUrl: z.string().url(),
});

const AuthConfigSchema = z.object({
  backendUrl: z.string().url(),
  turnstileSiteKey: z.string().optional(),
});

const TraktConfigSchema = z.object({
  clientId: z.string().optional(),
}).optional();

const FeatureFlagsSchema = z.object({
  enableWatchParty: z.boolean().default(true),
  enableTrakt: z.boolean().default(false),
});

const UIConfigSchema = z.object({
  gaId: z.string().optional(),
});

export const RuntimeConfigSchema = z.object({
  proxy: ProxyConfigSchema,
  auth: AuthConfigSchema,
  trakt: TraktConfigSchema,
  features: FeatureFlagsSchema,
  ui: UIConfigSchema,
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export function parseConfig(env: ImportMetaEnv): RuntimeConfig {
  return RuntimeConfigSchema.parse({
    proxy: {
      proxyUrl: env.VITE_PROXY_URL,
      m3u8ProxyUrl: env.VITE_M3U8_PROXY_URL,
    },
    auth: {
      backendUrl: env.VITE_BACKEND_URL,
      turnstileSiteKey: env.VITE_TURNSTILE_SITE_KEY,
    },
    trakt: env.VITE_TRAKT_CLIENT_ID ? { clientId: env.VITE_TRAKT_CLIENT_ID } : undefined,
    features: {
      enableWatchParty: env.VITE_ENABLE_WATCH_PARTY !== 'false',
      enableTrakt: env.VITE_ENABLE_TRAKT === 'true',
    },
    ui: {
      gaId: env.VITE_GA_ID,
    },
  });
}
```

---

### TASK-034: Optimize Images

```bash
# Install cwebp
apt-get install -y webp  # or brew install webp

# Convert
cwebp -q 85 apps/web/public/embed-preview.png -o apps/web/public/embed-preview.webp
for f in apps/web/public/splash_screens/*.png; do
  cwebp -q 80 "$f" -o "${f%.png}.webp"
done
```

Update all references in TSX/HTML from `.png` to `.webp`. Add `<picture>` fallback if needed for broad browser support.

---

## 6. Phase 4 — Provider Improvements

### TASK-035: Health Check System

**`packages/providers/src/health/index.ts`:**
```typescript
export interface ProviderHealthResult {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs?: number;
  checkedAt: string;
  error?: string;
}

// Known test media for each provider type
const TEST_MEDIA = {
  movie: { tmdbId: 299054, type: 'movie' as const, title: 'Expend4bles' },
  show: { tmdbId: 1396, type: 'show' as const, title: 'Breaking Bad', episode: { season: 1, episode: 1 } },
};

export async function checkProviderHealth(provider: Provider): Promise<ProviderHealthResult> {
  const start = Date.now();
  try {
    const result = await Promise.race([
      provider.scrapeMovie?.(TEST_MEDIA.movie),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10_000)),
    ]);
    return {
      id: provider.id,
      name: provider.name,
      status: result ? 'healthy' : 'degraded',
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      id: provider.id,
      name: provider.name,
      status: 'down',
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
```

**CLI script `packages/providers/src/cli/health.ts`:**
```typescript
import { getProviders } from '../';
import { checkProviderHealth } from '../health';

async function main() {
  const providers = getProviders();
  console.log(`Checking ${providers.length} providers...\n`);

  const results = await Promise.allSettled(
    providers.map((p) => checkProviderHealth(p))
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { name, status, latencyMs } = result.value;
      const icon = status === 'healthy' ? '✅' : status === 'degraded' ? '⚠️' : '❌';
      console.log(`${icon} ${name.padEnd(30)} ${status.padEnd(10)} ${latencyMs}ms`);
    }
  }
}

main();
```

Add to `packages/providers/package.json`:
```json
{
  "scripts": {
    "health": "tsx src/cli/health.ts"
  }
}
```

---

### TASK-036: Circuit Breaker

**`packages/providers/src/utils/circuitBreaker.ts`:**
```typescript
interface CircuitState {
  failures: number;
  lastFailure: number;
  openUntil: number;
}

const state = new Map<string, CircuitState>();

const FAILURE_THRESHOLD = 3;
const BASE_BACKOFF_MS = 5 * 60 * 1000; // 5 min

export function isCircuitOpen(providerId: string): boolean {
  const s = state.get(providerId);
  if (!s) return false;
  if (s.openUntil > Date.now()) return true;
  // Reset if backoff expired
  state.delete(providerId);
  return false;
}

export function recordSuccess(providerId: string): void {
  state.delete(providerId);
}

export function recordFailure(providerId: string): void {
  const s = state.get(providerId) ?? { failures: 0, lastFailure: 0, openUntil: 0 };
  s.failures++;
  s.lastFailure = Date.now();

  if (s.failures >= FAILURE_THRESHOLD) {
    // Exponential backoff: 5min, 15min, 1h
    const multiplier = Math.min(Math.pow(3, s.failures - FAILURE_THRESHOLD), 12);
    s.openUntil = Date.now() + BASE_BACKOFF_MS * multiplier;
  }

  state.set(providerId, s);
}

export function getCircuitStatus(): Record<string, CircuitState> {
  return Object.fromEntries(state);
}
```

**Integrate into the provider runner:**
```typescript
// In the function that iterates providers:
for (const provider of providers) {
  if (isCircuitOpen(provider.id)) {
    continue; // Skip broken provider
  }
  try {
    const result = await provider.scrape(media);
    recordSuccess(provider.id);
    return result;
  } catch (err) {
    recordFailure(provider.id);
    continue;
  }
}
```

---

### TASK-037: Fix Debrid localStorage Access

**File:** `packages/providers/src/providers/debrid/index.ts`

**Problem:** Direct `window.localStorage` access.

**Solution:** Add `debridToken` to the `ScrapeContext` type.

**`packages/providers/src/types/context.ts`:** Add field:
```typescript
export interface ScrapeContext {
  fetcher: Fetcher;
  proxiedFetcher: Fetcher;
  // NEW:
  debridToken?: string;
  debridProvider?: 'real-debrid' | 'torbox';
}
```

**Update provider code:**
```typescript
// Before:
const token = window.localStorage.getItem('__MW::preferences');

// After:
const token = ctx.debridToken;
if (!token) return null; // not configured
```

**Update frontend** to pass the token from Zustand into the scrape context:
```typescript
const { debridToken, debridProvider } = usePreferencesStore();
const ctx = makeProviders({
  target: targets.BROWSER,
  fetcher,
  proxiedFetcher,
  debridToken,
  debridProvider,
});
```

---

## 7. Phase 5 — Proxy Hardening

### TASK-038: LRU Cache with Memory Limit

**Install:**
```bash
pnpm --filter proxy add lru-cache
```

**Replace the current Map-based cache:**
```typescript
import { LRUCache } from 'lru-cache';

const MAX_MEMORY_BYTES = parseInt(process.env.CACHE_MAX_MEMORY_MB ?? '512') * 1024 * 1024;

const cache = new LRUCache<string, Buffer>({
  maxSize: MAX_MEMORY_BYTES,
  sizeCalculation: (value) => value.length,
  ttl: 60 * 60 * 1000, // 1 hour
  allowStale: false,
});
```

---

### TASK-039: Proxy Health Endpoint

**`apps/proxy/src/routes/health.get.ts`:**
```typescript
export default defineEventHandler(() => {
  return {
    status: 'ok',
    uptime: process.uptime(),
    cache: {
      size: cache.size,
      maxSize: cache.maxSize,
      calculatedSize: cache.calculatedSize,
    },
    version: process.env.npm_package_version ?? 'unknown',
    timestamp: new Date().toISOString(),
  };
});
```

---

### TASK-040: Rotate User-Agent

**`apps/proxy/src/utils/userAgents.ts`:**
```typescript
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:125.0) Gecko/20100101 Firefox/125.0',
];

let index = 0;

export function getNextUserAgent(): string {
  const ua = USER_AGENTS[index % USER_AGENTS.length]!;
  index++;
  return ua;
}
```

---

## 8. Phase 6 — Userscript + A11y + Docs

### TASK-041: Migrate Userscript to TypeScript

**`packages/userscript/package.json`:**
```json
{
  "name": "@p-stream/userscript",
  "scripts": {
    "build": "esbuild src/index.ts --bundle --outfile=dist/userscript.user.js --banner:js=\"$(node scripts/banner.js)\"",
    "dev": "esbuild src/index.ts --bundle --watch --outfile=dist/userscript.user.js"
  },
  "devDependencies": {
    "esbuild": "latest",
    "typescript": "5.x",
    "@types/greasemonkey": "latest"
  }
}
```

**`packages/userscript/scripts/banner.js`:**
```javascript
const pkg = require('../package.json');
console.log(`// ==UserScript==
// @name         P-Stream Helper
// @version      ${pkg.version}
// @updateURL    https://raw.githubusercontent.com/xp-technologies-dev/userscript/main/dist/userscript.user.js
// @downloadURL  https://raw.githubusercontent.com/xp-technologies-dev/userscript/main/dist/userscript.user.js
// @grant        GM_xmlhttpRequest
// ==/UserScript==`);
```

---

### TASK-042: A11y — Player Controls

**In `apps/web/src/components/player/controls/`:**

Add `aria-label` to all icon buttons:
```tsx
// Before:
<button onClick={togglePlay}><PlayIcon /></button>

// After:
<button
  onClick={togglePlay}
  aria-label={isPlaying ? 'Pause' : 'Play'}
  aria-pressed={isPlaying}
>
  <PlayIcon aria-hidden="true" />
</button>
```

Add keyboard shortcuts with visible focus ring:
```tsx
<div
  role="region"
  aria-label="Video player"
  onKeyDown={handleKeyDown}
  tabIndex={0}
>
```

---

## 9. Phase 7 — DevOps

### TASK-043: Docker Compose (Full Stack)

**`docker/docker-compose.yml`:**
```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: pstream
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  backend:
    build:
      context: ..
      dockerfile: docker/Dockerfile.backend
    env_file: ../.env
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/pstream
      REDIS_URL: redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "3000:3000"

  proxy:
    build:
      context: ..
      dockerfile: docker/Dockerfile.proxy
    env_file: ../.env
    ports:
      - "3001:3001"

  web:
    build:
      context: ..
      dockerfile: docker/Dockerfile.web
      args:
        VITE_BACKEND_URL: http://localhost:3000
        VITE_PROXY_URL: http://localhost:3001
        VITE_M3U8_PROXY_URL: http://localhost:3001
        VITE_TMDB_API_KEY: ${VITE_TMDB_API_KEY}
    depends_on:
      - backend
      - proxy
    ports:
      - "80:80"

volumes:
  postgres-data:
```

---

### TASK-044: Backend Dockerfile

**`docker/Dockerfile.backend`:**
```dockerfile
FROM node:20-alpine AS base
RUN npm install -g pnpm

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter backend...

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY apps/backend ./apps/backend
COPY packages/shared ./packages/shared
WORKDIR /app/apps/backend
RUN pnpm build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=build /app/apps/backend/.output ./.output
COPY --from=build /app/apps/backend/prisma ./prisma
RUN npm install prisma -g
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

---

## 10. Data Models

### PostgreSQL Schema (Prisma)

```prisma
model User {
  id          String    @id @default(cuid())
  publicKey   String    @unique
  namespace   String
  deviceName  String?
  createdAt   DateTime  @default(now())
  permissions String[]  @default([])

  // Encrypted at rest — use encryptToken()/decryptToken()
  debridToken String?
  traktKey    String?
  tidbKey     String?
  febboxKey   String?

  sessions    Session[]
  bookmarks   Bookmark[]
  progress    Progress[]
  settings    Settings?
  lists       List[]
  history     WatchHistory[]
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  expiresAt DateTime
  device    String?
}

model Bookmark {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tmdbId    Int
  mediaType String   // 'movie' | 'show'
  createdAt DateTime @default(now())

  @@unique([userId, tmdbId, mediaType])
}

model Progress {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tmdbId    Int
  mediaType String
  season    Int?
  episode   Int?
  progress  Float    // seconds
  duration  Float    // seconds
  updatedAt DateTime @updatedAt

  @@unique([userId, tmdbId, mediaType, season, episode])
}

model List {
  id          String      @id @default(cuid())
  userId      String
  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  title       String
  description String?
  isPublic    Boolean     @default(false)
  items       ListItem[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}

model ListItem {
  id        String   @id @default(cuid())
  listId    String
  list      List     @relation(fields: [listId], references: [id], onDelete: Cascade)
  tmdbId    Int
  mediaType String
  addedAt   DateTime @default(now())
}
```

---

## 11. API Reference

All routes require `Authorization: Bearer <jwt>` unless marked **Public**.

### Auth

| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| POST | `/auth/register/start` | Public | `{ captchaToken? }` | `{ challenge: string }` |
| POST | `/auth/register/complete` | Public | `{ publicKey, challenge: {code, signature}, namespace, device?, profile? }` | `{ user, session, token }` |
| POST | `/auth/login/start` | Public | `{ publicKey }` | `{ challenge: string }` |
| POST | `/auth/login/complete` | Public | `{ publicKey, challenge: {code, signature} }` | `{ user, session, token }` |
| DELETE | `/auth/logout` | ✅ | — | `204` |

### User

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/user/me` | ✅ | Returns current user |
| PUT | `/api/user/profile` | ✅ | Update display name, avatar |
| DELETE | `/api/user` | ✅ | Delete account + all data |

### Bookmarks

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/bookmarks` | ✅ | Returns all user bookmarks |
| PUT | `/api/bookmarks` | ✅ | Body: `BookmarkSchema` |
| DELETE | `/api/bookmarks/:tmdbId` | ✅ | — |

### Progress

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/progress` | ✅ | All progress entries |
| PUT | `/api/progress` | ✅ | Body: `ProgressSchema` |
| DELETE | `/api/progress/:id` | ✅ | — |

### Lists

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/lists` | ✅ | User's own lists |
| POST | `/api/lists` | ✅ | Create list |
| GET | `/api/lists/:id` | Public/✅ | Public lists: no auth. Private: must be owner. **Must `throw createError(403)`** if private and not owner |
| PUT | `/api/lists/:id` | ✅ | Update list |
| DELETE | `/api/lists/:id` | ✅ | Delete list |
| POST | `/api/lists/:id/items` | ✅ | Add item |
| DELETE | `/api/lists/:id/items/:itemId` | ✅ | Remove item |

### Discover

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/discover` | Public | Query: `?type=movie|show&page=1` · Cache: 1h · Partial failure OK |

### Watch Party (after WebSocket migration)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/watch-party/rooms` | ✅ | Create room → `{ roomCode: string }` |
| WS | `/watch-party/:roomCode?token=<jwt>` | ✅ (via token param) | WebSocket connection |

### Metrics / Health

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/health` | Public | Backend health |
| GET | `/metrics` | `METRICS_TOKEN` | Prometheus format |

---

## 12. Testing Patterns

### Unit Test — Utility Function

```typescript
// backend/server/utils/encrypt.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { encryptToken, decryptToken } from './encrypt';

beforeAll(() => {
  process.env.CRYPTO_SECRET = 'a'.repeat(64);
});

describe('encryptToken / decryptToken', () => {
  it('round-trips a token', () => {
    const original = 'my-secret-api-key';
    const encrypted = encryptToken(original);
    expect(encrypted).not.toBe(original);
    expect(decryptToken(encrypted)).toBe(original);
  });

  it('produces different ciphertext for same input (random nonce)', () => {
    const a = encryptToken('same-input');
    const b = encryptToken('same-input');
    expect(a).not.toBe(b);
  });
});
```

### Integration Test — API Route

```typescript
// backend/server/routes/lists/[id].get.test.ts
import { describe, it, expect } from 'vitest';
import { createApp } from '../../testUtils/app';
import { createTestUser, createTestList } from '../../testUtils/factories';

describe('GET /api/lists/:id', () => {
  it('returns 403 for private list accessed by non-owner', async () => {
    const { app } = await createApp();
    const owner = await createTestUser();
    const otherUser = await createTestUser();
    const list = await createTestList(owner.id, { isPublic: false });

    const res = await app.request(`/api/lists/${list.id}`, {
      headers: { Authorization: `Bearer ${otherUser.token}` },
    });

    expect(res.status).toBe(403);
    // Must not contain list data
    const body = await res.json();
    expect(body).not.toHaveProperty('items');
    expect(body).not.toHaveProperty('title');
  });

  it('returns list for public list without auth', async () => {
    const { app } = await createApp();
    const owner = await createTestUser();
    const list = await createTestList(owner.id, { isPublic: true });

    const res = await app.request(`/api/lists/${list.id}`);
    expect(res.status).toBe(200);
  });
});
```

### Frontend Component Test

```typescript
// apps/web/src/components/player/PlayButton.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { PlayButton } from './PlayButton';

describe('PlayButton', () => {
  it('has accessible label when paused', () => {
    render(<PlayButton isPlaying={false} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('has accessible label when playing', () => {
    render(<PlayButton isPlaying={true} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<PlayButton isPlaying={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
```

### Provider Health Test (CI Weekly)

```typescript
// packages/providers/src/health/health.test.ts
import { describe, it, expect } from 'vitest';
import { checkProviderHealth } from './index';
import { getProviders } from '../';

describe('Provider Health', () => {
  const providers = getProviders();

  // This test only runs in CI weekly workflow (VITEST_HEALTH=true)
  it.skipIf(!process.env.VITEST_HEALTH)('at least 60% of providers are healthy', async () => {
    const results = await Promise.allSettled(providers.map(checkProviderHealth));
    const healthy = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 'healthy'
    ).length;
    expect(healthy / providers.length).toBeGreaterThanOrEqual(0.6);
  }, 120_000);
});
```