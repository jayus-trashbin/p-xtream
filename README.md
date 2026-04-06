# P-Stream Monorepo

Welcome to the P-Stream ecosystem. This monorepo contains the following services:
- **apps/web**: React application for the streaming frontend.
- **apps/backend**: Nitro-based API for user data, auth, discover, and watch parties.
- **apps/proxy**: Simple-proxy for CORS and M3U8 relaying.
- **packages/providers**: The scraping engine used to find video sources.
- **packages/shared**: Shared TypeScript types and Zod validation schemas.

---

## 🛠 Prerequisites

Before starting, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v20 or higher recommended)
- [pnpm](https://pnpm.io/) (v9 or higher)
- [PostgreSQL](https://www.postgresql.org/) (running locally or via Docker)
- [Redis](https://redis.io/) (Optional, recommended for Watch Party WebSocket sync)

---

## 🚀 Manual Installation Guide

Follow these steps to get the environment running from scratch:

### 1. Install Dependencies
Run this command at the root of the project to install all workspace dependencies:
```bash
pnpm install
```

### 2. Environment Configuration
Copy the provided environment template to a new `.env` file at the root:
```bash
cp .env.example .env
```
Open the `.env` file and fill in the required fields:
- `DATABASE_URL`: Your PostgreSQL connection string.
- `CRYPTO_SECRET` & `JWT_SECRET`: Random 32-64 character strings. **`CRYPTO_SECRET` is used for both JWT signing and AES-256-GCM encryption of sensitive tokens in the database.**
- `ALLOWED_ORIGINS`: Comma-separated list of origins (e.g., `http://localhost:5173`).
- `TMDB_API_KEY` & `VITE_TMDB_API_KEY`: Get these from [TMDB Settings](https://www.themoviedb.org/settings/api).

### 3. Database Migration
Initialize the database schema using Prisma:
```bash
# This will apply migrations to your PostgreSQL instance
pnpm --filter @p-stream/backend exec prisma migrate dev
```

### 4. Running the Development Environment
Start all services in parallel using Turborepo:
```bash
pnpm dev
```
This will launch:
- **Web**: http://localhost:5173
- **Backend**: http://localhost:3000
- **Proxy**: http://localhost:3001

---

## 🏗 Common Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start all services in watch mode |
| `pnpm build` | Build all apps and packages for production |
| `pnpm lint` | Run ESLint across all projects |
| `pnpm type-check` | Validate TypeScript types in all workspaces |
| `pnpm test` | Run unit tests across the monorepo |

---

## 💡 Troubleshooting

- **Node/pnpm not found**: Ensure Node and pnpm are added to your system's PATH. If on Windows, try restarting your terminal after installation.
- **Database Connection Error**: Double check your `DATABASE_URL` in `.env` and ensure the database exists.
- **Missing TMDB Content**: Ensure `VITE_TMDB_API_KEY` is correctly set and is a v3 API key.
- **Nitro Type Errors**: If your IDE shows errors for `h3` or `defineEventHandler`, run `pnpm dev` or `pnpm build` in the backend folder to generate the `.nitro` types.

---

## ⚡ Performance & Cleanup (Optional)

- **Image Optimization**: To reduce bundle size, convert PNG assets in `apps/web/public` to WebP using `cwebp`.
- **WASM Cleanup**: `apps/web/public/streamhelper_bg.wasm` is currently unused and can be safely removed.
- **Bundle Analysis**: Run `pnpm --filter @p-stream/web build` and check `apps/web/dist/stats.html` to see the impact of lazy-loaded locales.
