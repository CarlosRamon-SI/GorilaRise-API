import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAdmin } from '../middleware/auth.js'

const schema = z.object({
  nome:      z.string().min(1),
  descricao: z.string().optional(),
  logoUrl:   z.string().optional(),
  link:      z.string().optional(),
  categoria: z.enum(['PLATINA', 'OURO', 'PRATA', 'BRONZE']).optional().default('OURO'),
  ativo:     z.boolean().optional(),
})

export async function patrocinadoresRoutes(app: FastifyInstance) {
  app.get('/patrocinadores', async (request) => {
    const { ativo } = request.query as { ativo?: string }
    return prisma.patrocinador.findMany({
      where: ativo !== undefined ? { ativo: ativo === 'true' } : undefined,
      orderBy: [{ categoria: 'asc' }, { nome: 'asc' }],
    })
  })

  app.post('/patrocinadores', { preHandler: requireAdmin }, async (request, reply) => {
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const p = await prisma.patrocinador.create({ data: result.data })
    return reply.status(201).send(p)
  })

  app.patch('/patrocinadores/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = schema.partial().safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    try {
      return await prisma.patrocinador.update({ where: { id: Number(id) }, data: result.data })
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      throw e
    }
  })

  app.delete('/patrocinadores/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.patrocinador.delete({ where: { id: Number(id) } })
      return reply.status(204).send()
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      throw e
    }
  })
}
