# Gorila Rise — API

API REST do sistema de gestão Gorila Rise.

**Produção:** `http://127.0.0.1:3333` (consumida pelo frontend em https://evo.adtecnologia.com.br)

## Stack

- Node.js 18+ + TypeScript
- Fastify 5
- Prisma 6 + MySQL
- JWT (`@fastify/jwt`) + bcrypt
- Zod (validação de schemas)

## Requisitos

- Node.js 18+
- MySQL rodando localmente, com o banco já criado (`CREATE DATABASE gorila_rise;` ou o nome escolhido) — `prisma migrate deploy` aplica o schema, mas não cria o database
- Variáveis de ambiente configuradas (ver `.env.example`)

## Instalação

```bash
npm install
cp .env.example .env   # preencher as variáveis (ver seção abaixo)
mkdir -p uploads        # diretório de uploads, não versionado — precisa existir antes do 1º upload
npx prisma migrate deploy
npm run db:seed         # cria o usuário admin inicial (ADMIN_NOME/ADMIN_EMAIL/ADMIN_SENHA do .env)
```

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Connection string MySQL, ex.: `mysql://usuario:senha@localhost:3306/gorila_rise` |
| `JWT_SECRET` | Chave usada para assinar os tokens JWT |
| `PORT` | Porta em que a API escuta (padrão usado em produção: `3333`) |
| `BASE_URL` | URL pública/base usada para montar links absolutos (ex.: recuperação de senha, uploads) |
| `ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_SENHA` | Dados do usuário admin criado por `npm run db:seed` |
| `HCAPTCHA_SECRET` | Secret key do hCaptcha (par da `VITE_HCAPTCHA_SITE_KEY` do frontend), usada para validar o captcha no backend |

> As credenciais de envio de e-mail (Gmail OAuth2) **não ficam em `.env`** — ver seção dedicada abaixo.

## Comandos

```bash
npm run dev            # servidor em modo watch (tsx)
npm run build          # compila TypeScript para dist/
npm start              # executa o build compilado
npm run db:migrate     # aplica migrations pendentes
npm run db:generate    # regenera o Prisma Client
npm run db:studio      # abre o Prisma Studio
npm run db:seed        # seed do banco (admin inicial)
```

## Rotas

| Prefixo          | Descrição                                   | Auth         |
|------------------|---------------------------------------------|--------------|
| `GET /health`    | Health check                                | —            |
| `/auth`          | Login, cadastro, perfil, senha              | parcial      |
| `/planos`        | Planos disponíveis (público) e gestão       | parcial      |
| `/modalidades`   | Modalidades esportivas                      | parcial      |
| `/leads`         | Captação de leads                           | —            |
| `/admin`         | Usuários, matrículas, turmas, check-ins, anamnese, recordes | ADMIN |
| `/projetos`      | Projetos sociais                            | parcial      |
| `/upload`        | Upload de imagens/documentos                | JWT          |
| `/documentos`    | Documentos oficiais                         | parcial      |
| `/configuracoes` | Dados do clube (endereço, redes, horários)  | parcial      |

Arquivos de upload servidos estaticamente em `/uploads/*`.

## Modelos principais

`Usuario` · `Matricula` · `Plano` · `Modalidade` · `Turma` · `CheckIn` · `Anamnese` · `Recorde` · `ProjetoSocial` · `DocumentoOficial` · `Lead` · `Configuracao`

## Estrutura

```
src/
├── server.ts          # entry point, registro de plugins e rotas
├── middleware/
│   └── auth.ts        # verificação de JWT e role
├── routes/            # um arquivo por domínio
└── lib/
    └── prisma.ts      # singleton do PrismaClient
prisma/
├── schema.prisma      # modelos e migrations
└── seed.ts            # seed inicial (admin)
uploads/               # arquivos enviados (não versionado)
```

## Configurando envio de e-mail via Gmail OAuth2

O envio de e-mails transacionais (boas-vindas, recuperação de senha, etc.) pode usar o Gmail via OAuth2, com prioridade sobre o SMTP convencional (ver `src/lib/mailer.ts`). As credenciais (`gmailUser`, `gmailClientId`, `gmailClientSecret`, `gmailRefreshToken`) **não ficam em `.env`** — são configuradas pelo Admin em `/admin/configuracoes` → seção "Gmail OAuth2" e salvas na tabela `Configuracao`.

Para obter o `refresh_token`, é necessário criar credenciais OAuth2 no Google Cloud e autorizar a conta Gmail que vai enviar os e-mails uma única vez.

### 1. Criar projeto e ativar a Gmail API

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2. Crie um projeto novo (ou reutilize um existente).
3. Menu **APIs e Serviços → Biblioteca**, busque **Gmail API** e clique em **Ativar**.

### 2. Configurar a tela de consentimento OAuth

1. **APIs e Serviços → Tela de consentimento OAuth**.
2. Tipo de usuário: **Externo** (ou **Interno**, se a conta Gmail for Workspace do mesmo domínio).
3. Preencha nome do app, e-mail de suporte e e-mail de contato do desenvolvedor.
4. Em **Escopos**, não é necessário adicionar nada aqui (o escopo é pedido na hora da autorização).
5. Em **Usuários de teste** (se o app ficar em modo "Testando"), adicione a conta Gmail que vai enviar os e-mails (ex.: `noreply@gmail.com`). Enquanto o app não for publicado/verificado, só usuários de teste conseguem autorizar.

### 3. Criar as credenciais OAuth2 (Client ID / Client Secret)

1. **APIs e Serviços → Credenciais → Criar credenciais → ID do cliente OAuth**.
2. Tipo de aplicativo: **Aplicativo da Web**.
3. Em **URIs de redirecionamento autorizados**, adicione `https://developers.google.com/oauthplayground` (usado no passo seguinte para gerar o refresh token).
4. Salve e copie o **Client ID** e o **Client Secret** gerados — vão para os campos `gmailClientId` e `gmailClientSecret` no painel Admin.

### 4. Gerar o refresh token via OAuth Playground

1. Acesse [OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
2. Clique no ícone de engrenagem (⚙️, canto superior direito) e marque **"Use your own OAuth credentials"**. Preencha com o Client ID e Client Secret do passo anterior.
3. Em **Step 1**, no campo de escopo, informe: `https://mail.google.com/`. Clique em **Authorize APIs**.
4. Faça login com a conta Gmail que vai enviar os e-mails (a mesma adicionada como usuário de teste) e autorize o acesso.
5. Em **Step 2**, clique em **Exchange authorization code for tokens**.
6. Copie o valor de **Refresh token** exibido — vai para o campo `gmailRefreshToken` no painel Admin.

> O refresh token do OAuth Playground não expira por tempo, mas é revogado se a conta remover o acesso do app, trocar a senha, ou se o app ficar em modo "Testando" por mais de 7 dias sem uso — nesse caso repita o passo 4 para gerar um novo.

### 5. Configurar no painel Admin

Em `/admin/configuracoes` → "Gmail OAuth2", preencha:

| Campo | Valor |
|---|---|
| Conta Gmail | o e-mail que autorizou no passo 4 (ex.: `noreply@gmail.com`) |
| Client ID | gerado no passo 3 |
| Client Secret | gerado no passo 3 |
| Refresh Token | gerado no passo 4 |

Salve e use o botão de e-mail de teste (rota `POST /configuracoes` de teste, ver `src/routes/configuracoes.ts`) para validar o envio antes de contar com o fluxo em produção.

## Backend + frontend

Esta API não serve nenhuma UI — ela é consumida pelo repositório do frontend (`GorilaRise`, Vite/React), que aponta para ela via `VITE_API_URL`. Para rodar a aplicação completa localmente, suba esta API primeiro (`npm run dev`, porta padrão `3333`) e depois o frontend com `VITE_API_URL=http://localhost:3333` no `.env` dele.

## Deploy

O processo deve rodar via PM2 apontando para o build compilado:

```bash
npm run build
pm2 start dist/server.js --name gorilaRise-api
```

> Use exatamente o nome `gorilaRise-api` — é o nome do processo já referenciado nas rotinas de redeploy/restart em produção.

> A API escuta apenas em `127.0.0.1` — não exposta diretamente; em produção o nginx faz proxy reverso de `/api/*` e `/uploads/*` para `127.0.0.1:3333` (ver seção de deploy do README do frontend para o config completo). O frontend consome via `VITE_API_URL`.
