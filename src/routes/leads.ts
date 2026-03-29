import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAdmin } from '../middleware/auth.js'

const leadSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email(),
  whatsapp: z.string().optional(),
  origem: z.string().optional().default('eventos'),
})

export async function leadsRoutes(app: FastifyInstance) {
  // Público — captura do modal de notificações
  app.post('/', async (request, reply) => {
    const result = leadSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const lead = await prisma.lead.create({ data: result.data })
    return reply.status(201).send({ id: lead.id })
  })

  // Admin — listagem de leads
  app.get('/', { preHandler: requireAdmin }, async (request) => {
    const { origem } = request.query as { origem?: string }
    return prisma.lead.findMany({
      where: origem ? { origem } : undefined,
      orderBy: { criadoEm: 'desc' },
    })
  })
}
