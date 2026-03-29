import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAdmin, requireTreinador } from '../middleware/auth.js'

export async function adminRoutes(app: FastifyInstance) {
  // Stats — TREINADOR e ADMIN
  app.get('/stats', { preHandler: requireTreinador }, async () => {
    const [usuarios, matriculas, modalidades, planos, leads] = await Promise.all([
      prisma.usuario.count({ where: { ativo: true } }),
      prisma.matricula.count({ where: { status: 'ATIVA' } }),
      prisma.modalidade.count({ where: { ativa: true } }),
      prisma.plano.count({ where: { ativo: true } }),
      prisma.lead.count(),
    ])
    return { usuarios, matriculas, modalidades, planos, leads }
  })

  // Listar usuários — TREINADOR e ADMIN
  app.get('/usuarios', { preHandler: requireTreinador }, async (request) => {
    const { role, ativo } = request.query as { role?: string; ativo?: string }
    return prisma.usuario.findMany({
      where: {
        ...(role ? { role: role as any } : {}),
        ...(ativo !== undefined ? { ativo: ativo === 'true' } : {}),
      },
      select: {
        id: true, nome: true, email: true, cpf: true,
        telefone: true, cidade: true, role: true, ativo: true, criadoEm: true,
        matriculas: {
          include: { modalidade: true, plano: true },
          where: { status: 'ATIVA' },
        },
      },
      orderBy: { criadoEm: 'desc' },
    })
  })

  // Atualizar role/ativo — só ADMIN
  app.patch('/usuarios/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      role: z.enum(['USUARIO', 'TREINADOR', 'ADMIN']).optional(),
      ativo: z.boolean().optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    return prisma.usuario.update({
      where: { id: Number(id) },
      data: result.data,
      select: { id: true, nome: true, email: true, role: true, ativo: true },
    })
  })

  // Listar matrículas — TREINADOR e ADMIN
  app.get('/matriculas', { preHandler: requireTreinador }, async () => {
    return prisma.matricula.findMany({
      include: {
        usuario: { select: { id: true, nome: true, email: true } },
        modalidade: true,
        plano: true,
      },
      orderBy: { criadoEm: 'desc' },
    })
  })

  // Listar leads — TREINADOR e ADMIN
  app.get('/leads', { preHandler: requireTreinador }, async (request) => {
    const { origem } = request.query as { origem?: string }
    return prisma.lead.findMany({
      where: origem ? { origem } : undefined,
      orderBy: { criadoEm: 'desc' },
    })
  })
}
