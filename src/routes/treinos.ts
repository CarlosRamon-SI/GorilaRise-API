import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireTreinador } from '../middleware/auth.js'

export async function treinosRoutes(app: FastifyInstance) {
  // ── WOD ──────────────────────────────────────────────────────────────────────

  app.get('/wod', { preHandler: requireTreinador }, async () => {
    return prisma.wOD.findMany({ orderBy: { data: 'desc' } })
  })

  app.post('/wod', { preHandler: requireTreinador }, async (request, reply) => {
    const schema = z.object({
      titulo:     z.string().min(1),
      descricao:  z.string().optional(),
      exercicios: z.string().optional(),
      data:       z.string(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { data, ...rest } = result.data
    const wod = await prisma.wOD.create({ data: { ...rest, data: new Date(data) } })
    return reply.status(201).send({
      ...wod,
      data: wod.data.toISOString().slice(0, 10),
    })
  })

  app.delete('/wod/:id', { preHandler: requireTreinador }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.wOD.delete({ where: { id: Number(id) } })
      return reply.status(204).send()
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      throw e
    }
  })

  // ── Fichas individuais ────────────────────────────────────────────────────────

  app.get('/', { preHandler: requireTreinador }, async () => {
    return prisma.treinoPrescrito.findMany({ orderBy: { criadoEm: 'desc' } })
  })

  app.post('/', { preHandler: requireTreinador }, async (request, reply) => {
    const schema = z.object({
      atletaNome: z.string().min(1),
      titulo:     z.string().min(1),
      exercicios: z.string().optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const t = await prisma.treinoPrescrito.create({ data: result.data })
    return reply.status(201).send(t)
  })

  app.delete('/:id', { preHandler: requireTreinador }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.treinoPrescrito.delete({ where: { id: Number(id) } })
      return reply.status(204).send()
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      throw e
    }
  })
}
