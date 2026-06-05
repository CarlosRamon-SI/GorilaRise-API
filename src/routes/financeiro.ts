import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { requireTreinador } from '../middleware/auth.js'

export async function financeiroRoutes(app: FastifyInstance) {
  // Gera view financeira a partir das matrículas ativas.
  // Retorna uma entrada por matrícula: PENDENTE para o mês corrente,
  // ATRASADO se a matrícula tem > 30 dias e não há registro de pagamento ainda.
  app.get('/financeiro', { preHandler: requireTreinador }, async () => {
    const matriculas = await prisma.matricula.findMany({
      where: { status: 'ATIVA' },
      include: {
        usuario: { select: { nome: true } },
        plano:   { select: { nome: true, valor: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })

    const hoje = new Date()

    return matriculas.map(m => {
      const diasDesde = Math.floor((hoje.getTime() - m.criadoEm.getTime()) / 86_400_000)
      const status: 'PENDENTE' | 'ATRASADO' = diasDesde > 30 ? 'ATRASADO' : 'PENDENTE'

      const vencimento = new Date(m.criadoEm)
      vencimento.setDate(vencimento.getDate() + 30)

      return {
        id:             m.id,
        atletaNome:     m.usuario.nome,
        planoNome:      m.plano.nome,
        valor:          m.plano.valor.toString(),
        status,
        dataVencimento: vencimento.toISOString().slice(0, 10),
        dataPagamento:  null,
      }
    })
  })
}
