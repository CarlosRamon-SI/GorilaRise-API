import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAdmin } from '../middleware/auth.js'

const projetoSchema = z.object({
  titulo: z.string().min(3),
  descricao: z.string().min(10),
  icone: z.string().optional().default('heart'),
  ativo: z.boolean().optional().default(true),
})

export async function projetosRoutes(app: FastifyInstance) {
  // Público
  app.get('/', async () => {
    return prisma.projetoSocial.findMany({ where: { ativo: true }, orderBy: { criadoEm: 'asc' } })
  })

  // Admin
  app.post('/', { preHandler: requireAdmin }, async (request, reply) => {
    const result = projetoSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    return reply.status(201).send(await prisma.projetoSocial.create({ data: result.data }))
  })

  app.patch('/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = projetoSchema.partial().safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    return prisma.projetoSocial.update({ where: { id: Number(id) }, data: result.data })
  })

  app.delete('/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.projetoSocial.update({ where: { id: Number(id) }, data: { ativo: false } })
    return reply.status(204).send()
  })
}
