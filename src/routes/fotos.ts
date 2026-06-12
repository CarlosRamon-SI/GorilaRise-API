import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireTreinador } from '../middleware/auth.js'

export async function fotosRoutes(app: FastifyInstance) {
  app.get('/fotos-progresso', { preHandler: requireAuth }, async (request) => {
    const { sub } = request.user as { sub: number }
    const { tipo } = request.query as { tipo?: string }
    return prisma.fotoProgresso.findMany({
      where: {
        usuarioId: sub,
        ...(tipo ? { tipo: tipo as 'INICIAL' | 'PROGRESSO' } : {}),
      },
      orderBy: { criadoEm: 'asc' },
    })
  })

  // Admin/treinador: ver fotos de um atleta específico
  app.get('/fotos-progresso/:userId', { preHandler: requireTreinador }, async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const { tipo } = request.query as { tipo?: string }
    const fotos = await prisma.fotoProgresso.findMany({
      where: {
        usuarioId: Number(userId),
        ...(tipo ? { tipo: tipo as 'INICIAL' | 'PROGRESSO' } : {}),
      },
      orderBy: { criadoEm: 'asc' },
    })
    return fotos
  })

  app.post('/fotos-progresso', { preHandler: requireAuth }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const schema = z.object({
      url:  z.string().min(1),
      tipo: z.enum(['INICIAL', 'PROGRESSO']),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const foto = await prisma.fotoProgresso.create({
      data: { usuarioId: sub, ...result.data },
    })
    return reply.status(201).send(foto)
  })
}
