import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

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
