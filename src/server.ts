import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import helmet from '@fastify/helmet'
import { authRoutes } from './routes/auth.js'
import { modalidadesRoutes } from './routes/modalidades.js'
import { planosRoutes } from './routes/planos.js'
import { leadsRoutes } from './routes/leads.js'

const app = Fastify({ logger: true })

// Plugins
await app.register(helmet)
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
