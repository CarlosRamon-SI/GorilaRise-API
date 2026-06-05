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
- MySQL rodando localmente
- Variáveis de ambiente configuradas (ver `.env.example`)

## Instalação

```bash
npm install
cp .env.example .env   # preencher as variáveis
npx prisma migrate deploy
npm run db:seed        # cria o usuário admin inicial
```

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

## Deploy

O processo deve rodar via PM2 apontando para o build compilado:

```bash
npm run build
pm2 start dist/server.js --name gorila-rise-api
```

> A API escuta apenas em `127.0.0.1` — não exposta diretamente; o frontend consome via `VITE_API_URL`.
