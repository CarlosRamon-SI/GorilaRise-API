import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

export async function recordesRoutes(app: FastifyInstance) {
  app.get('/recordes', { preHandler: requireAuth }, async (request) => {
    const { sub } = request.user as { sub: number }
    const items = await prisma.recorde.findMany({
      where: { usuarioId: sub },
      orderBy: { data: 'desc' },
    })
    return items.map(r => ({
      id: r.id,
      exercicio: r.exercicio,
      carga: r.carga,
      data: r.data.toISOString().slice(0, 10),
    }))
  })

  app.post('/recordes', { preHandler: requireAuth }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const schema = z.object({
      exercicio: z.string().min(1),
      carga:     z.string().min(1),
      data:      z.string().optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const { exercicio, carga, data } = result.data
    const recorde = await prisma.recorde.create({
      data: {
        usuarioId: sub,
        exercicio,
        carga,
        data: data ? new Date(data) : new Date(),
      },
    })
    return reply.status(201).send({
      id: recorde.id,
      exercicio: recorde.exercicio,
      carga: recorde.carga,
      data: recorde.data.toISOString().slice(0, 10),
    })
  })

  app.delete('/recordes/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const { id } = request.params as { id: string }
    const recorde = await prisma.recorde.findUnique({ where: { id: Number(id) } })
    if (!recorde || recorde.usuarioId !== sub) {
      return reply.status(404).send({ error: 'Não encontrado' })
    }
    await prisma.recorde.delete({ where: { id: Number(id) } })
    return reply.status(204).send()
  })
}
