import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { requireAdmin, requireTreinador } from '../middleware/auth.js'

export async function financeiroRoutes(app: FastifyInstance) {
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
      const vencimento = new Date(m.criadoEm)
      vencimento.setDate(vencimento.getDate() + 30)

      let status: 'PAGO' | 'PENDENTE' | 'ATRASADO'
      if (m.dataPagamento) {
        status = 'PAGO'
      } else if (vencimento < hoje) {
        status = 'ATRASADO'
      } else {
        status = 'PENDENTE'
      }

      return {
        id:             m.id,
        atletaNome:     m.usuario.nome,
        planoNome:      m.plano.nome,
        valor:          m.plano.valor.toString(),
        status,
        dataVencimento: vencimento.toISOString().slice(0, 10),
        dataPagamento:  m.dataPagamento ? m.dataPagamento.toISOString().slice(0, 10) : null,
      }
    })
  })

  app.patch('/financeiro/:id/pagar', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const m = await prisma.matricula.update({
        where: { id: Number(id) },
        data: { dataPagamento: new Date() },
        include: {
          usuario: { select: { nome: true } },
          plano:   { select: { nome: true, valor: true } },
        },
      })
      const vencimento = new Date(m.criadoEm)
      vencimento.setDate(vencimento.getDate() + 30)
      return {
        id: m.id,
        atletaNome:     m.usuario.nome,
        planoNome:      m.plano.nome,
        valor:          m.plano.valor.toString(),
        status:         'PAGO',
        dataVencimento: vencimento.toISOString().slice(0, 10),
        dataPagamento:  m.dataPagamento!.toISOString().slice(0, 10),
      }
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Matrícula não encontrada.' })
      throw e
    }
  })
}
