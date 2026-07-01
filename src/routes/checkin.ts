import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireTreinador, assertMatriculaAtiva } from '../middleware/auth.js'

const DIA_ABBR = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']

function localDayBounds(): { gte: Date; lte: Date } {
  const n = new Date()
  return {
    gte: new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0),
    lte: new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999),
  }
}

// G-C5: always use local-time constructor to avoid timezone ambiguity
function parseLocalDate(dateStr: string, endOfDay = false): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999)
    : new Date(y, m - 1, d, 0, 0, 0, 0)
}

// G-C4: parse "HH:MM" or "HH:MM:SS" into today's Date at that time
function horarioToday(horario: string): Date | null {
  const parts = horario.split(':').map(Number)
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null
  const d = new Date()
  d.setHours(parts[0], parts[1], 0, 0)
  return d
}

export async function checkinRoutes(app: FastifyInstance) {
  // Atleta: listar turmas do dia com vagas reais e status de check-in
  app.get('/turmas', { preHandler: requireAuth }, async (request) => {
    const { sub } = request.user as { sub: number }
    const bounds = localDayBounds()
    // G-C3: filtrar por dia da semana
    const todayAbbr = DIA_ABBR[new Date().getDay()]

    const turmas = await prisma.turma.findMany({
      where: { status: 'ATIVA' },
      orderBy: { horario: 'asc' },
      include: {
        // G-C2: incluir check-ins do dia para calcular vagas reais
        checkIns: {
          where: { data: bounds },
          select: { usuarioId: true },
        },
      },
    })

    return turmas
      .filter(t => {
        // G-C3: só turmas que ocorrem hoje (comparação case-insensitive)
        const dias = Array.isArray(t.dias) ? (t.dias as string[]) : []
        return dias.some(d => d.toLowerCase() === todayAbbr)
      })
      .map(t => ({
        id:         t.id,
        codigo:     t.codigo,
        horario:    t.horario,
        dias:       t.dias,
        modalidade: t.descricao ?? t.codigo,
        // G-C2: vagas restantes reais
        vagas:      Math.max(0, t.capacidade - t.checkIns.length),
        capacidade: t.capacidade,
        checkedIn:  t.checkIns.some(c => c.usuarioId === sub),
      }))
  })

  // Atleta: fazer check-in
  app.post('/checkin', { preHandler: requireAuth }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    if (!await assertMatriculaAtiva(sub, reply)) return
    const schema = z.object({ turmaId: z.number().int().positive() })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const { turmaId } = result.data

    const turma = await prisma.turma.findUnique({ where: { id: turmaId } })
    if (!turma || turma.status !== 'ATIVA')
      return reply.status(404).send({ error: 'Turma não encontrada.' })

    // G-C4: janela de 2h — check-in abre 2h antes, fecha 1h após o início
    const classTime = horarioToday(turma.horario)
    if (classTime) {
      const diffMs = classTime.getTime() - Date.now()
      if (diffMs > 2 * 60 * 60 * 1000)
        return reply.status(422).send({ error: 'Check-in disponível apenas a partir de 2h antes da aula.' })
      if (diffMs < -60 * 60 * 1000)
        return reply.status(422).send({ error: 'Esta aula já encerrou.' })
    }

    const bounds = localDayBounds()

    // G-C1: verificar capacidade antes de criar
    const ocupados = await prisma.checkIn.count({ where: { turmaId, data: bounds } })
    if (ocupados >= turma.capacidade)
      return reply.status(409).send({ error: 'Turma lotada. Todas as vagas foram preenchidas.' })

    try {
      const checkin = await prisma.checkIn.create({
        data: { usuarioId: sub, turmaId, data: bounds.gte },
      })
      return reply.status(201).send(checkin)
    } catch (e: any) {
      if (e.code === 'P2002')
        return reply.status(409).send({ error: 'Check-in já realizado nesta turma hoje.' })
      throw e
    }
  })

  // Atleta: histórico de check-ins
  app.get('/checkin/historico', { preHandler: requireAuth }, async (request) => {
    const { sub } = request.user as { sub: number }
    const { inicio, fim } = request.query as { inicio?: string; fim?: string }

    // G-C5: usar parseLocalDate para evitar ambiguidade de timezone
    const dataInicio = inicio
      ? parseLocalDate(inicio)
      : (() => {
          const d = new Date()
          d.setDate(d.getDate() - 30)
          return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
        })()
    const dataFim = fim
      ? parseLocalDate(fim, true)
      : new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 23, 59, 59, 999)

    const checkins = await prisma.checkIn.findMany({
      where: { usuarioId: sub, data: { gte: dataInicio, lte: dataFim } },
      include: { turma: { select: { codigo: true, horario: true, descricao: true } } },
      orderBy: { data: 'desc' },
    })
    return checkins.map(c => ({
      id:        c.id,
      data:      c.data.toISOString().slice(0, 10),
      turma:     c.turma.codigo,
      horario:   c.turma.horario,
      descricao: c.turma.descricao ?? c.turma.codigo,
    }))
  })

  // Atleta: cancelar check-in
  app.delete('/checkin/:turmaId', { preHandler: requireAuth }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const { turmaId } = request.params as { turmaId: string }

    // G-C4: só cancela com ≥2h de antecedência
    const turma = await prisma.turma.findUnique({ where: { id: Number(turmaId) } })
    if (turma) {
      const classTime = horarioToday(turma.horario)
      if (classTime && classTime.getTime() - Date.now() < 2 * 60 * 60 * 1000)
        return reply.status(422).send({ error: 'Cancelamento só é permitido com no mínimo 2h de antecedência.' })
    }

    const bounds = localDayBounds()
    await prisma.checkIn.deleteMany({
      where: { usuarioId: sub, turmaId: Number(turmaId), data: bounds },
    })
    return reply.status(204).send()
  })
}

// Rotas treinador/admin
export async function checkinAdminRoutes(app: FastifyInstance) {
  // GET /admin/checkin — turmas com check-ins do dia (admin vê todas; treinador vê só as suas)
  app.get('/checkin', { preHandler: requireTreinador }, async (request) => {
    const { sub, role } = request.user as { sub: number; role: string }
    const { data } = request.query as { data?: string }
    const base = data ? parseLocalDate(data) : new Date()
    const diaStart = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0)
    const diaEnd   = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59, 999)

    // G-C6: treinador vê só suas turmas; admin vê todas
    const where = role === 'ADMIN'
      ? { status: 'ATIVA' as const }
      : { status: 'ATIVA' as const, treinadorId: sub }

    const turmas = await prisma.turma.findMany({
      where,
      orderBy: { horario: 'asc' },
      include: {
        checkIns: {
          where: { data: { gte: diaStart, lte: diaEnd } },
          include: { usuario: { select: { nome: true, email: true } } },
          orderBy: { criadoEm: 'asc' },
        },
      },
    })

    return turmas.map(t => ({
      id:         t.id,
      codigo:     t.codigo,
      horario:    t.horario,
      descricao:  t.descricao ?? t.codigo,
      capacidade: t.capacidade,
      checkins:   t.checkIns.map((c: any) => ({
        id:          c.id,
        atletaNome:  c.usuario.nome,
        atletaEmail: c.usuario.email,
      })),
    }))
  })

  // G-C7: POST /admin/checkin — check-in manual pelo treinador
  app.post('/checkin', { preHandler: requireTreinador }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const schema = z.object({
      atletaId: z.number().int().positive(),
      turmaId:  z.number().int().positive(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const { atletaId, turmaId } = result.data

    const turma = await prisma.turma.findFirst({ where: { id: turmaId, treinadorId: sub } })
    if (!turma) return reply.status(403).send({ error: 'Turma não pertence a este treinador.' })

    const { gte: today } = localDayBounds()
    try {
      const checkin = await prisma.checkIn.create({
        data: { usuarioId: atletaId, turmaId, data: today },
        include: { usuario: { select: { nome: true, email: true } } },
      })
      return reply.status(201).send({
        id:          checkin.id,
        atletaNome:  checkin.usuario.nome,
        atletaEmail: checkin.usuario.email,
      })
    } catch (e: any) {
      if (e.code === 'P2002')
        return reply.status(409).send({ error: 'Atleta já tem check-in nesta turma hoje.' })
      throw e
    }
  })

  // G-C7: DELETE /admin/checkin/:id — remover check-in manualmente
  app.delete('/checkin/:id', { preHandler: requireTreinador }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const { id } = request.params as { id: string }

    const checkin = await prisma.checkIn.findFirst({
      where: { id: Number(id), turma: { treinadorId: sub } },
    })
    if (!checkin) return reply.status(404).send({ error: 'Check-in não encontrado.' })

    await prisma.checkIn.delete({ where: { id: Number(id) } })
    return reply.status(204).send()
  })
}
