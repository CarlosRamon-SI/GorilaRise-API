import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAdmin } from '../middleware/auth.js'

const documentoSchema = z.object({
  titulo:    z.string().min(3),
  descricao: z.string().optional(),
  fileUrl:   z.string().min(1),
  ativo:     z.boolean().optional().default(true),
})

export async function documentosRoutes(app: FastifyInstance) {
  // Público
  app.get('/', async () => {
    return prisma.documentoOficial.findMany({ where: { ativo: true }, orderBy: { criadoEm: 'asc' } })
  })

  // Admin — criar
  app.post('/', { preHandler: requireAdmin }, async (request, reply) => {
    const result = documentoSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    return reply.status(201).send(await prisma.documentoOficial.create({ data: result.data }))
  })

  // Admin — editar
  app.patch('/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = documentoSchema.partial().safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    return prisma.documentoOficial.update({ where: { id: Number(id) }, data: result.data })
  })

  // Admin — inativar
  app.delete('/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.documentoOficial.update({ where: { id: Number(id) }, data: { ativo: false } })
    return reply.status(204).send()
  })
}
