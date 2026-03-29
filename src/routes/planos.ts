import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAdmin } from '../middleware/auth.js'

const planoSchema = z.object({
  nome: z.string().min(2),
  valor: z.number().positive(),
  descricao: z.string().optional(),
  ativo: z.boolean().optional().default(true),
})

export async function planosRoutes(app: FastifyInstance) {
  // Público
  app.get('/', async () => {
    return prisma.plano.findMany({ where: { ativo: true }, orderBy: { valor: 'asc' } })
  })

  // Admin
  app.post('/', { preHandler: requireAdmin }, async (request, reply) => {
    const result = planoSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    return reply.status(201).send(await prisma.plano.create({ data: result.data }))
  })

  app.put('/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = planoSchema.partial().safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    return prisma.plano.update({ where: { id: Number(id) }, data: result.data })
  })

  app.delete('/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.plano.update({ where: { id: Number(id) }, data: { ativo: false } })
    return reply.status(204).send()
  })
}
