import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAdmin } from '../middleware/auth.js'

const modalidadeSchema = z.object({
  nome: z.string().min(2),
  descricao: z.string().min(10),
  categoria: z.enum(['combate', 'coletivo', 'individual', 'artistico']),
  ativa: z.boolean().optional().default(true),
})

export async function modalidadesRoutes(app: FastifyInstance) {
  // Público — frontend consome para popular selects
  app.get('/', async () => {
    return prisma.modalidade.findMany({ where: { ativa: true }, orderBy: { nome: 'asc' } })
  })

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const modalidade = await prisma.modalidade.findUnique({ where: { id: Number(id) } })
    if (!modalidade) return reply.status(404).send({ error: 'Não encontrado' })
    return modalidade
  })

  // Admin
  app.post('/', { preHandler: requireAdmin }, async (request, reply) => {
    const result = modalidadeSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    return reply.status(201).send(await prisma.modalidade.create({ data: result.data }))
  })

  app.put('/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = modalidadeSchema.partial().safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    return prisma.modalidade.update({ where: { id: Number(id) }, data: result.data })
  })

  app.delete('/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.modalidade.update({ where: { id: Number(id) }, data: { ativa: false } })
    return reply.status(204).send()
  })
}
