import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAdmin, requireTreinador } from '../middleware/auth.js'

export async function ambientesRoutes(app: FastifyInstance) {
  app.get('/ambientes', { preHandler: requireTreinador }, async () => {
    return prisma.ambiente.findMany({ orderBy: { nome: 'asc' } })
  })

  app.post('/ambientes', { preHandler: requireAdmin }, async (request, reply) => {
    const schema = z.object({
      nome:       z.string().min(1),
      descricao:  z.string().optional(),
      capacidade: z.number().int().positive(),
      ativo:      z.boolean().default(true),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const ambiente = await prisma.ambiente.create({ data: result.data })
    return reply.status(201).send(ambiente)
  })

  app.patch('/ambientes/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      nome:       z.string().min(1).optional(),
      descricao:  z.string().optional(),
      capacidade: z.number().int().positive().optional(),
      ativo:      z.boolean().optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    try {
      return prisma.ambiente.update({ where: { id: Number(id) }, data: result.data })
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Ambiente não encontrado.' })
      throw e
    }
  })

  app.delete('/ambientes/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const vinculadas = await prisma.turma.count({ where: { ambienteId: Number(id) } })
    if (vinculadas > 0) {
      return reply.status(409).send({ error: 'Ambiente possui turmas vinculadas.' })
    }
    try {
      await prisma.ambiente.delete({ where: { id: Number(id) } })
      return reply.status(204).send()
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Ambiente não encontrado.' })
      throw e
    }
  })
}
