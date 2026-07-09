import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'

export async function notificacoesRoutes(app: FastifyInstance) {
  // Leitura filtrada por role do usuário logado + notificações direcionadas ao userId
  app.get('/notificacoes', { preHandler: requireAuth }, async (request) => {
    const { sub, role } = request.user as { sub: number; role: string }
    const notifs = await prisma.notificacao.findMany({
      where: {
        OR: [
          { destinatarioRole: null, destinatarioId: null },
          { destinatarioRole: role, destinatarioId: null },
          { destinatarioId: sub },
        ],
      },
      orderBy: { criadoEm: 'desc' },
      take: 50,
    })
    const lidas = await prisma.notificacaoLida.findMany({
      where: { usuarioId: sub, notificacaoId: { in: notifs.map(n => n.id) } },
      select: { notificacaoId: true },
    })
    const lidasIds = new Set(lidas.map(l => l.notificacaoId))
    return notifs.map(n => ({ ...n, lida: lidasIds.has(n.id) }))
  })

  // Marca todas as notificações visíveis ao usuário como lidas
  app.post('/notificacoes/lidas', { preHandler: requireAuth }, async (request) => {
    const { sub, role } = request.user as { sub: number; role: string }
    const notifs = await prisma.notificacao.findMany({
      where: {
        OR: [
          { destinatarioRole: null, destinatarioId: null },
          { destinatarioRole: role, destinatarioId: null },
          { destinatarioId: sub },
        ],
      },
      select: { id: true },
    })
    await prisma.notificacaoLida.createMany({
      data: notifs.map(n => ({ notificacaoId: n.id, usuarioId: sub })),
      skipDuplicates: true,
    })
    return { ok: true }
  })

  app.post('/notificacoes', { preHandler: requireAdmin }, async (request, reply) => {
    const schema = z.object({
      titulo:           z.string().min(1),
      corpo:            z.string().min(1),
      tipo:             z.enum(['AVISO', 'EVENTO', 'COMUNICADO']).default('AVISO'),
      destinatarioRole: z.enum(['ATLETA', 'TREINADOR', 'ADMIN', 'SOCIO_TORCEDOR']).nullable().optional(),
      destinatarioId:   z.number().int().positive().nullable().optional(),
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
