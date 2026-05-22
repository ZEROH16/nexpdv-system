# NexPDV - Deploy Producao Railway

Este guia prepara API Cloud, Painel Admin e Desktop para operar fora do ambiente local, mantendo o PDV offline-first apos a ativacao.

## 1. Railway API Cloud

1. Crie um projeto no Railway.
2. Adicione um servico PostgreSQL.
3. Adicione um servico para este repositorio.
4. Configure as variaveis no servico da API:

```env
NODE_ENV=production
PORT=3333
DATABASE_URL=${{ Postgres.DATABASE_URL }}
JWT_SECRET=gere-um-segredo-com-32-caracteres-ou-mais
REFRESH_SECRET=gere-outro-segredo-com-32-caracteres-ou-mais
ADMIN_APP_URL=https://seu-admin-nexpdv.app
CORS_ORIGIN=https://seu-admin-nexpdv.app
LICENSE_OFFLINE_GRACE_DAYS=7
RATE_LIMIT_MAX=120
RATE_LIMIT_WINDOW_MS=60000
UPDATE_CHANNEL=stable
UPDATE_VERSION=1.0.0
UPDATE_DOWNLOAD_URL=
UPDATE_MANDATORY=false
```

O Railway injeta `PORT`; a API usa `process.env.PORT` em producao e `API_PORT` apenas como fallback de desenvolvimento.

No servico da API, configure os comandos do Railway assim. O build nao roda `npm ci` dentro do `buildCommand`, porque o Nixpacks ja instala as dependencias antes do build:

```bash
# Build
npm run railway:api

# Start
npm run start -w @nexpdv/api
```

## 2. Banco PostgreSQL

As migrations PostgreSQL ficam em `apps/api/prisma/postgres`.

Rodar migrations em producao:

```bash
npm run db:migrate:prod -w @nexpdv/api
```

Gerar Prisma Client com schema PostgreSQL quando necessario:

```bash
npm run prisma:generate:prod -w @nexpdv/api
```

Seed de desenvolvimento nao deve rodar automaticamente em producao. Execute seeds apenas manualmente quando for realmente necessario.

## 3. Bootstrap do Super Admin

Crie o primeiro usuario SaaS depois das migrations:

```bash
npm run admin:bootstrap -w @nexpdv/api -- --email=seu@email.com --password="SUA_SENHA_FORTE" --name="Seu Nome"
```

Se o usuario ja existir, o comando nao sobrescreve dados por padrao. Para atualizar senha, token inicial e resetar 2FA, use:

```bash
npm run admin:bootstrap -w @nexpdv/api -- --email=seu@email.com --password="SUA_SENHA_FORTE" --name="Seu Nome" --force
```

Reset seguro de 2FA:

```bash
npm run admin:reset-2fa -w @nexpdv/api -- --email=seu@email.com
```

## 4. Healthcheck

Teste a API:

```bash
curl https://sua-api-nexpdv.up.railway.app/health
```

Resposta esperada:

```json
{
  "status": "ok",
  "product": "NexPDV Cloud",
  "version": "0.1.0",
  "environment": "production",
  "database": "connected"
}
```

## 5. Painel Admin

Configure o Admin com a API de producao:

```env
VITE_NEXPDV_API_URL=https://nexpdvapi-production.up.railway.app
```

No servico do Admin, configure os comandos do Railway assim:

```bash
# Build
npm run railway:admin

# Start
npm run start -w @nexpdv/admin
```

O script `railway:admin` compila o pacote compartilhado e faz o build Vite do Admin. Se `VITE_NEXPDV_API_URL` nao estiver definida no painel Railway, ele usa `https://nexpdvapi-production.up.railway.app` como padrao de producao.

O Admin e servido por `apps/admin/server.mjs`, usando `PORT` do Railway e `0.0.0.0`. Ele expoe `/health` estatico apenas para o servico Admin, sem consultar `/health` da API. Depois de publicar, atualize `ADMIN_APP_URL` e `CORS_ORIGIN` na API com a URL publica do Admin.

O `railway.json` do repositorio nao define `buildCommand`, `startCommand` ou `healthcheckPath` globais para evitar que todos os servicos executem o deploy da API. Configure os comandos acima diretamente em cada servico Railway.

## 6. Desktop com API Cloud

O Desktop resolve a URL da API nesta ordem:

1. `C:\ProgramData\NexPDV\config.json`
2. Variavel `NEXPDV_API_URL`
3. Configuracao local salva pelo app
4. `http://localhost:3333` somente em desenvolvimento

Exemplo de `C:\ProgramData\NexPDV\config.json`:

```json
{
  "apiUrl": "https://sua-api-nexpdv.up.railway.app"
}
```

No Desktop, em `Configuracoes > Suporte > API Cloud`, e possivel:

- visualizar a API atual;
- testar conexao;
- alterar URL com credencial de gerente/admin;
- restaurar a URL local salva.

Para gerar instalador apontando para producao sem recompilar, distribua tambem o arquivo `config.json` acima ou configure `NEXPDV_API_URL` no Windows.

## 7. Ativacao Online e Offline-First

Fluxo esperado:

1. Crie empresa e licenca no Painel Admin.
2. Instale o NexPDV Desktop.
3. Configure a API Cloud de producao.
4. Ative com email do dono, chave da licenca e nome do estabelecimento.
5. O Desktop salva empresa, plano, modulos, deviceId e cache local da licenca.
6. Se a internet cair apos ativacao, o PDV continua funcionando dentro da janela offline definida por `LICENSE_OFFLINE_GRACE_DAYS`.

## 8. Auto Update

Variaveis preparadas:

```env
AUTO_UPDATE_ENABLED=false
UPDATE_CHANNEL=stable
UPDATE_PROVIDER_URL=
```

Em desenvolvimento o update fica desabilitado por padrao. Em producao, se ainda nao houver servidor de update, o app apenas registra log e nao mostra erro ao cliente.

## 9. Checklist Go-Live

- `npm run typecheck -w @nexpdv/api`
- `npm run typecheck -w @nexpdv/admin`
- `npm run typecheck -w @nexpdv/desktop`
- `npm run lint -w @nexpdv/api`
- `npm run lint -w @nexpdv/admin`
- `npm run lint -w @nexpdv/desktop`
- `npm run build -w @nexpdv/api`
- `npm run build -w @nexpdv/admin`
- `npm run build -w @nexpdv/desktop`
- `/health` retornando banco conectado
- login Admin com 2FA
- CRUD de empresa/plano/licenca
- geracao de licenca
- ativacao online no Desktop
- reinicio do Desktop mantendo licenca
- teste offline apos ativacao
- reset local do Desktop funcionando em desenvolvimento
- nenhum localhost fixo em build de producao
