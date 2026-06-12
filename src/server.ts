import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import staticFiles from '@fastify/static'
import path from 'path'
import { authRoutes } from './routes/auth.js'
import { modalidadesRoutes } from './routes/modalidades.js'
import { planosRoutes } from './routes/planos.js'
import { leadsRoutes } from './routes/leads.js'
import { adminRoutes } from './routes/admin.js'
import { projetosRoutes } from './routes/projetos.js'
import { uploadRoutes } from './routes/upload.js'
import { documentosRoutes } from './routes/documentos.js'
import { configuracoesRoutes } from './routes/configuracoes.js'
import { anamneseRoutes } from './routes/anamnese.js'
import { recordesRoutes } from './routes/recordes.js'
import { checkinRoutes, checkinAdminRoutes } from './routes/checkin.js'
import { funcionariosRoutes } from './routes/funcionarios.js'
import { professorRoutes } from './routes/professor.js'
import { premiacoesRoutes } from './routes/premiacoes.js'
import { patrocinadoresRoutes } from './routes/patrocinadores.js'
import { notificacoesRoutes } from './routes/notificacoes.js'
import { fotosRoutes } from './routes/fotos.js'
import { prontuarioRoutes } from './routes/prontuario.js'
import { treinosRoutes, fichaAtletaRoutes } from './routes/treinos.js'
import { financeiroRoutes } from './routes/financeiro.js'

const app = Fastify({ logger: true })

// Plugins
await app.register(helmet, {
  crossOriginResourcePolicy: { policy: 'cross-origin' },
})
await app.register(multipart, { limits: { fileSize: 6 * 1024 * 1024 } })
await app.register(staticFiles, {
  root: path.resolve('uploads'),
  prefix: '/uploads/',
})
await app.register(cors, {
  origin: [
    'https://evo.adtecnologia.com.br',
    'http://localhost:8080',
  ],
  credentials: true,
})
await app.register(jwt, {
  secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
})

// Routes
await app.register(authRoutes, { prefix: '/auth' })
await app.register(modalidadesRoutes, { prefix: '/modalidades' })
await app.register(planosRoutes, { prefix: '/planos' })
await app.register(leadsRoutes, { prefix: '/leads' })
await app.register(adminRoutes, { prefix: '/admin' })
await app.register(projetosRoutes, { prefix: '/projetos' })
await app.register(uploadRoutes, { prefix: '/upload' })
await app.register(documentosRoutes, { prefix: '/documentos' })
await app.register(configuracoesRoutes)
await app.register(anamneseRoutes)
await app.register(recordesRoutes)
await app.register(checkinRoutes)
await app.register(checkinAdminRoutes, { prefix: '/admin' })
await app.register(funcionariosRoutes)
await app.register(professorRoutes, { prefix: '/professor' })
await app.register(premiacoesRoutes)
await app.register(patrocinadoresRoutes)
await app.register(notificacoesRoutes)
await app.register(fotosRoutes)
await app.register(prontuarioRoutes)
await app.register(treinosRoutes, { prefix: '/treinos' })
await app.register(fichaAtletaRoutes)
await app.register(financeiroRoutes)

// Health check
app.get('/health', async () => ({ status: 'ok' }))

const PORT = Number(process.env.PORT ?? 3333)

try {
  await app.listen({ port: PORT, host: '127.0.0.1' })
  console.log(`API rodando em http://127.0.0.1:${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
