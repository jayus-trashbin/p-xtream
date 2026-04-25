# P-Stream Monorepo

Bem-vindo ao P-Stream — uma plataforma de streaming auto-hospedada com suporte a Watch Party, legendas avançadas (Language Reactor), vocabulário com repetição espaçada, e muito mais.

## 📦 Estrutura do Monorepo

| Serviço | Descrição | Porta padrão |
|---|---|---|
| `apps/web` | Frontend React (Vite + Tailwind) | `:5173` |
| `apps/backend` | API Nitro — auth, dados, watch party | `:3001` |
| `apps/proxy` | Proxy CORS/M3U8 para fontes de vídeo | `:3005` |
| `packages/providers` | Engine de scraping de fontes de vídeo | — |
| `packages/shared` | Tipos TypeScript e schemas Zod compartilhados | — |

---

## 🛠 Pré-requisitos

Antes de começar, certifique-se de ter instalado:

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v9+
- [PostgreSQL](https://www.postgresql.org/) (local ou via Docker)
- [Redis](https://redis.io/) *(opcional — necessário para Watch Party via WebSocket)*

---

## 🚀 Instalação

### 1. Instalar dependências

```bash
pnpm install
```

### 2. Configurar variáveis de ambiente

O projeto usa um arquivo `.env` por serviço. Copie os templates:

```bash
# Backend (API)
cp apps/backend/.env.example apps/backend/.env

# Web (frontend)
cp apps/web/.env.example apps/web/.env

# Proxy
cp apps/proxy/.env.example apps/proxy/.env
```

Em seguida, edite cada `.env` e preencha os valores obrigatórios:

#### `apps/backend/.env` — campos obrigatórios:
- `DATABASE_URL` — string de conexão PostgreSQL
- `CRYPTO_SECRET` — chave secreta aleatória (min 32 chars): `openssl rand -hex 32`
- `ALLOWED_ORIGINS` — origens CORS permitidas, ex: `http://localhost:5173`
- `TMDB_API_KEY` — chave v3 ou v4 da API do [TMDB](https://www.themoviedb.org/settings/api)

#### `apps/web/.env` — campos obrigatórios:
- `VITE_TMDB_READ_API_KEY` — mesma chave TMDB (pode ser a v4 Read Access Token)
- `VITE_CORS_PROXY_URL` — URL do proxy rodando localmente (`http://localhost:3005`)
- `VITE_M3U8_PROXY_URL` — igual ao CORS proxy
- `VITE_BACKEND_URL` — URL do backend (`http://localhost:3001`)

#### `apps/proxy/.env` — campos obrigatórios:
- `JWT_SECRET` — **deve ser idêntico ao `CRYPTO_SECRET` do backend**

### 3. Configurar banco de dados

Crie o banco de dados e aplique as migrations do Prisma:

```bash
# Aplicar todas as migrations
pnpm --filter @p-stream/backend exec prisma migrate deploy

# OU em modo dev (cria migrations automaticamente se houver mudanças no schema)
pnpm --filter @p-stream/backend exec prisma migrate dev
```

### 4. Rodar em desenvolvimento

```bash
pnpm dev
```

Isso inicia todos os serviços em paralelo via Turborepo:

| Serviço | URL |
|---|---|
| Web | http://localhost:5173 |
| Backend | http://localhost:3001 |
| Proxy | http://localhost:3005 |

---

## 🏗 Comandos disponíveis

| Comando | Descrição |
|---|---|
| `pnpm dev` | Inicia todos os serviços em modo watch |
| `pnpm build` | Build de produção de todos os apps e pacotes |
| `pnpm lint` | Executa ESLint em todo o monorepo |
| `pnpm type-check` | Valida tipos TypeScript em todos os workspaces |
| `pnpm test` | Roda os testes unitários |

---

## 🔑 Obtendo chaves de API

### TMDB (obrigatório)
1. Crie uma conta em [themoviedb.org](https://www.themoviedb.org)
2. Acesse **Configurações → API**
3. Copie a **v4 Auth (Read Access Token)** e use em `VITE_TMDB_READ_API_KEY`
4. Copie a **API Key (v3)** e use em `TMDB_API_KEY` (backend)

### Trakt (opcional)
1. Crie uma conta em [trakt.tv](https://trakt.tv)
2. Acesse **Configurações → Seu perfil → Aplicativos OAuth → Novo Aplicativo**
3. Como URL de redirecionamento use `http://localhost:5173`
4. Copie o Client ID e Secret

---

## 🐳 Docker (alternativa)

```bash
# Inicia PostgreSQL e Redis via Docker Compose
docker compose -f apps/backend/docker-compose.yml up -d
```

---

## 💡 Troubleshooting

| Problema | Solução |
|---|---|
| Erro de conexão com banco | Verifique `DATABASE_URL` e se o PostgreSQL está rodando |
| Conteúdo TMDB não aparece | Verifique se `VITE_TMDB_READ_API_KEY` está correto |
| Proxy não carrega vídeos | Certifique-se que `JWT_SECRET` no proxy == `CRYPTO_SECRET` no backend |
| Erros de tipo no IDE (h3, nitro) | Rode `pnpm dev` no backend para gerar os tipos Nitro |
| Watch Party não sincroniza | Certifique-se de ter Redis rodando e `REDIS_URL` configurado no backend |

---

## ✨ Features

- 🎬 Player customizado com controles avançados
- 🌐 Watch Party com WebSocket em tempo real (chat, reações, lobby)
- 📝 Modo Language Reactor: legendas duplas + palavras clicáveis com dicionário
- 📚 Sistema de vocabulário com repetição espaçada (SRS/SM-2)
- 🔍 Descoberta de conteúdo via TMDB
- 🔒 Autenticação segura com criptografia AES-256-GCM
