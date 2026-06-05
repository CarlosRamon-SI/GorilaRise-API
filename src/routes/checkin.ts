import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { requireTreinador } from '../middleware/auth.js'

export async function checkinRoutes(app: FastifyInstance) {
  // Atleta: listar turmas com status de check-in do dia atual
  app.get('/turmas', { preHandler: requireAuth }, async (request) => {
    const { sub } = request.user as { sub: number }
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [turmas, meuCheckIns] = await Promise.all([
      prisma.turma.findMany({ where: { ativa: true }, orderBy: { horario: 'asc' } }),
      prisma.checkIn.findMany({
        where: { usuarioId: sub, data: today },
        select: { turmaId: true },
      }),
    ])

    const checkedIds = new Set(meuCheckIns.map(c => c.turmaId))

    return turmas.map(t => ({
      id:         t.id,
      codigo:     t.codigo,
      horario:    t.horario,
      dias:       t.dias,
      modalidade: t.descricao ?? t.codigo,
      vagas:      t.capacidade,
      checkedIn:  checkedIds.has(t.id),
    }))
  })

  // Atleta: fazer check-in
  app.post('/checkin', { preHandler: requireAuth }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const schema = z.object({ turmaId: z.number().int().positive() })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    try {
      const checkin = await prisma.checkIn.create({
        data: { usuarioId: sub, turmaId: result.data.turmaId, data: today },
      })
      return reply.status(201).send(checkin)
    } catch (e: any) {
      if (e.code === 'P2002') return reply.status(409).send({ error: 'Check-in já realizado.' })
      throw e
    }
  })

  // Atleta: cancelar check-in
  app.delete('/checkin/:turmaId', { preHandler: requireAuth }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const { turmaId } = request.params as { turmaId: string }
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    await prisma.checkIn.deleteMany({
      where: { usuarioId: sub, turmaId: Number(turmaId), data: today },
    })
    return reply.status(204).send()
  })
}

// Rota admin: listar check-ins por data agrupados por turma
export async function checkinAdminRoutes(app: FastifyInstance) {
  app.get('/checkin', { preHandler: requireTreinador }, async (request, reply) => {
    const { data } = request.query as { data?: string }
    const dia = data ? new Date(data) : new Date()
    dia.setHours(0, 0, 0, 0)

    const checkins = await prisma.checkIn.findMany({
      where: { data: dia },
      include: {
        usuario: { select: { nome: true, email: true } },
        turma:   { select: { codigo: true, horario: true } },
      },
      orderBy: { criadoEm: 'asc' },
    })

    return checkins.map(c => ({
      id:          c.id,
      atletaNome:  c.usuario.nome,
      atletaEmail: c.usuario.email,
      turma:       c.turma.codigo,
      horario:     c.turma.horario,
      data:        c.data.toISOString().slice(0, 10),
    }))
  })
}
