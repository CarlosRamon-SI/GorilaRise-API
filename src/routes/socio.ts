import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'

const PONTOS_POR_INGRESSO = 10

export async function socioRoutes(app: FastifyInstance) {
  // ── Eventos ──────────────────────────────────────────────────────────────

  app.get('/eventos', async (request) => {
    const { ativo } = request.query as { ativo?: string }
    const eventos = await prisma.evento.findMany({
      where: ativo !== undefined ? { ativo: ativo === 'true' } : undefined,
      orderBy: { data: 'asc' },
      include: { _count: { select: { ingressos: true } } },
    })
    return eventos.map(e => ({
      id:          e.id,
      titulo:      e.titulo,
      descricao:   e.descricao ?? '',
      data:        e.data.toISOString(),
      local:       e.local ?? '',
      imagemUrl:   e.imagemUrl ?? null,
      ativo:       e.ativo,
      criadoEm:    e.criadoEm.toISOString(),
      totalIngressos: e._count.ingressos,
    }))
  })

  app.post('/eventos', { preHandler: requireAdmin }, async (request, reply) => {
    const schema = z.object({
      titulo:    z.string().min(1),
      descricao: z.string().optional(),
      data:      z.string(),
      local:     z.string().optional(),
      imagemUrl: z.string().optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { data, ...rest } = result.data
    const evento = await prisma.evento.create({
      data: { ...rest, data: new Date(data) },
    })
    return reply.status(201).send({ ...evento, data: evento.data.toISOString() })
  })

  app.patch('/eventos/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      titulo:    z.string().min(1).optional(),
      descricao: z.string().optional(),
      data:      z.string().optional(),
      local:     z.string().optional(),
      imagemUrl: z.string().optional(),
      ativo:     z.boolean().optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { data, ...rest } = result.data
    try {
      const evento = await prisma.evento.update({
        where: { id: Number(id) },
        data: { ...rest, ...(data ? { data: new Date(data) } : {}) },
      })
      return { ...evento, data: evento.data.toISOString() }
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Evento não encontrado.' })
      throw e
    }
  })

  app.delete('/eventos/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.evento.delete({ where: { id: Number(id) } })
      return reply.status(204).send()
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Evento não encontrado.' })
      throw e
    }
  })

  // ── Ingressos ─────────────────────────────────────────────────────────────

  // Meus ingressos
  app.get('/ingressos', { preHandler: requireAuth }, async (request) => {
    const { sub } = request.user as { sub: number }
    const ingressos = await prisma.ingresso.findMany({
      where: { usuarioId: sub },
      include: { evento: true },
      orderBy: { criadoEm: 'desc' },
    })
    return ingressos.map(i => ({
      id:       i.id,
      codigo:   i.codigo,
      criadoEm: i.criadoEm.toISOString(),
      evento: {
        id:       i.evento.id,
        titulo:   i.evento.titulo,
        data:     i.evento.data.toISOString(),
        local:    i.evento.local ?? '',
        imagemUrl: i.evento.imagemUrl ?? null,
      },
    }))
  })

  // Reservar ingresso + conceder pontos
  app.post('/ingressos/:eventoId', { preHandler: requireAuth }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const { eventoId } = request.params as { eventoId: string }

    const evento = await prisma.evento.findFirst({
      where: { id: Number(eventoId), ativo: true },
    })
    if (!evento) return reply.status(404).send({ error: 'Evento não encontrado ou inativo.' })
    if (new Date(evento.data) < new Date()) return reply.status(400).send({ error: 'Este evento já ocorreu.' })

    try {
      const ingresso = await prisma.ingresso.create({
        data: { eventoId: Number(eventoId), usuarioId: sub },
        include: { evento: true },
      })
      // Concede pontos automaticamente
      await prisma.pontoSocio.create({
        data: { usuarioId: sub, pontos: PONTOS_POR_INGRESSO, motivo: `Ingresso: ${evento.titulo}` },
      })
      return reply.status(201).send({
        id:       ingresso.id,
        codigo:   ingresso.codigo,
        criadoEm: ingresso.criadoEm.toISOString(),
        pontosGanhos: PONTOS_POR_INGRESSO,
        evento: {
          id:    ingresso.evento.id,
          titulo: ingresso.evento.titulo,
          data:  ingresso.evento.data.toISOString(),
          local: ingresso.evento.local ?? '',
        },
      })
    } catch (e: any) {
      if (e.code === 'P2002') return reply.status(409).send({ error: 'Você já tem ingresso para este evento.' })
      throw e
    }
  })

  // Cancelar ingresso
  app.delete('/ingressos/:eventoId', { preHandler: requireAuth }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const { eventoId } = request.params as { eventoId: string }
    await prisma.ingresso.deleteMany({
      where: { usuarioId: sub, eventoId: Number(eventoId) },
    })
    return reply.status(204).send()
  })

  // ── Pontos & Ranking ──────────────────────────────────────────────────────

  // Meus pontos
  app.get('/pontos', { preHandler: requireAuth }, async (request) => {
    const { sub } = request.user as { sub: number }
    const pontos = await prisma.pontoSocio.findMany({
      where: { usuarioId: sub },
      orderBy: { criadoEm: 'desc' },
    })
    const total = pontos.reduce((s, p) => s + p.pontos, 0)
    return {
      total,
      historico: pontos.map(p => ({
        id:       p.id,
        pontos:   p.pontos,
        motivo:   p.motivo,
        criadoEm: p.criadoEm.toISOString(),
      })),
    }
  })

  // Ranking dos sócios (top 20)
  app.get('/ranking/socios', { preHandler: requireAuth }, async () => {
    const socios = await prisma.usuario.findMany({
      where: { role: 'SOCIO_TORCEDOR', ativo: true },
      select: {
        id: true, nome: true,
        pontosSocio: { select: { pontos: true } },
        ingressos:   { select: { id: true } },
      },
    })

    const ranking = socios
      .map(s => ({
        id:       s.id,
        nome:     s.nome,
        pontos:   s.pontosSocio.reduce((acc, p) => acc + p.pontos, 0),
        jogos:    s.ingressos.length,
      }))
      .sort((a, b) => b.pontos - a.pontos)
      .slice(0, 20)
      .map((s, i) => ({ ...s, posicao: i + 1 }))

    return ranking
  })
}
