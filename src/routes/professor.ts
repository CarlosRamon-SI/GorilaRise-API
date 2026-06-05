import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { requireTreinador } from '../middleware/auth.js'

export async function professorRoutes(app: FastifyInstance) {
  // Retorna todos os atletas (USUARIO) com matrícula ativa
  app.get('/atletas', { preHandler: requireTreinador }, async () => {
    return prisma.usuario.findMany({
      where: { role: 'USUARIO', ativo: true },
      select: {
        id:    true,
        nome:  true,
        email: true,
        matriculas: {
          where: { status: 'ATIVA' },
          include: { modalidade: true, plano: true },
        },
      },
      orderBy: { nome: 'asc' },
    })
  })
}
