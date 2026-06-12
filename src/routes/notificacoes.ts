import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'

export async function notificacoesRoutes(app: FastifyInstance) {
  // Leitura filtrada por role do usuário logado
  app.get('/notificacoes', { preHandler: requireAuth }, async (request) => {
    const { role } = request.user as { sub: number; role: string }
    return prisma.notificacao.findMany({
      where: {
        OR: [
          { destinatarioRole: null },
          { destinatarioRole: role },
        ],
      },
      orderBy: { criadoEm: 'desc' },
      take: 50,
    })
  })

  app.post('/notificacoes', { preHandler: requireAdmin }, async (request, reply) => {
    const schema = z.object({
      titulo:           z.string().min(1),
      corpo:            z.string().min(1),
      tipo:             z.enum(['AVISO', 'EVENTO', 'COMUNICADO']).default('AVISO'),
      destinatarioRole: z.enum(['ATLETA', 'TREINADOR', 'ADMIN', 'SOCIO_TORCEDOR']).nullable().optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const n = await prisma.notificacao.create({ data: result.data })
    return reply.status(201).send(n)
  })

  app.delete('/notificacoes/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.notificacao.delete({ where: { id: Number(id) } })
      return reply.status(204).send()
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      throw e
    }
  })
}
