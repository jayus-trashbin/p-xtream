# 🔍 P-Stream — Projeto Audit: O que falta pra funcionar

Auditoria completa do estado atual do projeto. Itens organizados por **prioridade** (do blocker ao nice-to-have).

---

## 🔴 Blockers (Não roda sem resolver)

### 1. Node.js e pnpm não estão no PATH
Nem `node` nem `pnpm` foram encontrados no terminal atual. **Nada funciona sem eles.**

**Ação:**
```powershell
# Instalar Node.js 20 LTS (inclui npm)
winget install OpenJS.NodeJS.LTS

# Instalar pnpm
npm install -g pnpm@9

# Reiniciar o terminal após instalação
```

---

### 2. `pnpm install` nunca foi executado
Não existe `pnpm-lock.yaml` na raiz. Sem ele:
- ❌ Nenhum `node_modules` existe
- ❌ Todos os "Cannot find module" na IDE são por causa disso
- ❌ Nenhum build compila

**Ação:**
```powershell
pnpm install
```

---

### 3. Arquivo `.env` não existe
Apenas o `.env.example` existe. O backend precisa de variáveis reais para ligar.

**Ação:**
```powershell
copy .env.example .env
# Depois editar o .env com valores reais:
```

| Variável | Onde pegar |
|---|---|
| `CRYPTO_SECRET` | `openssl rand -hex 32` (ou gerar local) |
| `TMDB_API_KEY` | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) |
| `VITE_TMDB_API_KEY` | Mesmo valor do TMDB_API_KEY (ou TMDB Read Access Token) |
| `JWT_SECRET` | Mesmo valor do `CRYPTO_SECRET` |

> [!IMPORTANT]
> Sem `TMDB_API_KEY` o discover/search retorna erro 401.
> Sem `CRYPTO_SECRET` o backend não inicia (crash em jwt.ts).

---

### 4. PostgreSQL não está rodando
O backend depende de um PostgreSQL acessível via `DATABASE_URL`.

**Opção A — Docker (recomendado):**
```powershell
docker run -d --name pstream-postgres -p 5432:5432 -e POSTGRES_DB=pstream -e POSTGRES_PASSWORD=postgres postgres:16-alpine
```

**Opção B — Full stack via Compose:**
```powershell
docker compose -f docker/docker-compose.yml up postgres redis -d
```

---

### 5. Prisma migrations precisam rodar
Após o PostgreSQL estar up e o `.env` configurado:

```powershell
cd apps/backend
npx prisma migrate deploy
npx prisma generate
```

---

## 🟡 Importantes (Funciona parcialmente sem eles)

### 6. Web `name` inconsistente com monorepo
O `apps/web/package.json` não segue a convenção `@p-stream/` do monorepo:
- Backend: `@p-stream/backend` ✅
- Proxy: `@p-stream/proxy` ✅  
- Web: `p-stream` ❌ (deveria ser `@p-stream/web`)

**Fix:** Renomear `name` no `apps/web/package.json` de `"p-stream"` para `"@p-stream/web"`.

---

### 7. Backend usa `package-lock.json` + `npm` (conflito com pnpm monorepo)
O `apps/backend` contém `package-lock.json` (320KB) — artefato do npm pré-monorepo. Com `pnpm workspaces`, o lockfile deve ser **apenas na raiz** (`pnpm-lock.yaml`).

**Fix:** Deletar `apps/backend/package-lock.json` depois que `pnpm install` rodar na raiz.

---

### 8. Redis (opcional agora, obrigatório com docker-compose)
O `docker-compose.yml` sobe um Redis que o backend espera em `REDIS_URL`. Sem Redis:
- Watch Party não funciona
- Backend não crasha (graceful fallback no `ioredis`)

---

## 🟢 Nice-to-have (Projeto funciona sem eles)

### 9. Trakt OAuth Keys
Sem `TRAKT_CLIENT_ID` / `TRAKT_CLIENT_SECRET`, o discover usa apenas TMDB (OK, fallback funciona).

### 10. Cloudflare Turnstile
Sem `TURNSTILE_SECRET`, o registro de usuário não tem captcha (funciona, mas sem bot protection).

### 11. Renovate Bot
O `renovate.json` precisa do [Renovate GitHub App](https://github.com/apps/renovate) instalado no repositório para funcionar. Sem ele, o arquivo é ignorado.

---

## ✅ Checklist de Setup (Ordem exata)

```
1. [ ] Instalar Node.js 20 LTS + pnpm 9
2. [ ] Reiniciar terminal
3. [ ] pnpm install                       ← resolve todos os erros de IDE
4. [ ] copy .env.example .env             ← preencher variáveis
5. [ ] Subir PostgreSQL (docker ou local)
6. [ ] cd apps/backend && npx prisma migrate deploy && npx prisma generate
7. [ ] Voltar pra raiz e rodar: pnpm dev  ← sobe backend + proxy + web
```

> [!TIP]
> Ou para setup completo via Docker (após item 4):
> ```powershell
> docker compose -f docker/docker-compose.yml up -d
> ```
