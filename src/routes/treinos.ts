import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireTreinador, requireAuth } from '../middleware/auth.js'

export async function treinosRoutes(app: FastifyInstance) {
  // ── WOD ──────────────────────────────────────────────────────────────────────

  app.get('/wod', { preHandler: requireAuth }, async () => {
    const wods = await prisma.wOD.findMany({
      orderBy: { data: 'desc' },
      include: { autor: { select: { id: true, nome: true } } },
    })
    return wods.map(w => ({
      ...w,
      data: w.data.toISOString().slice(0, 10),
      autorNome: w.autor?.nome ?? null,
    }))
  })

  app.post('/wod', { preHandler: requireTreinador }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const schema = z.object({
      titulo:     z.string().min(1),
      descricao:  z.string().optional(),
      exercicios: z.string().optional(),
      data:       z.string(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { data, ...rest } = result.data
    const wod = await prisma.wOD.create({
      data: { ...rest, data: new Date(data), autorId: sub },
      include: { autor: { select: { id: true, nome: true } } },
    })
    return reply.status(201).send({
      ...wod,
      data: wod.data.toISOString().slice(0, 10),
      autorNome: wod.autor?.nome ?? null,
    })
  })

  app.delete('/wod/:id', { preHandler: requireTreinador }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.wOD.delete({ where: { id: Number(id) } })
      return reply.status(204).send()
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      throw e
    }
  })

  // ── Fichas individuais ────────────────────────────────────────────────────────

  app.get('/', { preHandler: requireTreinador }, async () => {
    const treinos = await prisma.treinoPrescrito.findMany({
      orderBy: { criadoEm: 'desc' },
      include: { atleta: { select: { id: true, nome: true } } },
    })
    return treinos.map(t => ({
      ...t,
      atletaNome: t.atleta?.nome ?? t.atletaNome,
    }))
  })

  app.post('/', { preHandler: requireTreinador }, async (request, reply) => {
    const schema = z.object({
      atletaId:   z.number().int().positive(),
      titulo:     z.string().min(1),
      exercicios: z.string().optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const atleta = await prisma.usuario.findFirst({
      where: { id: result.data.atletaId, ativo: true },
      select: { nome: true },
    })
    if (!atleta) return reply.status(404).send({ error: 'Atleta não encontrado.' })

    const t = await prisma.treinoPrescrito.create({
      data: {
        atletaId:   result.data.atletaId,
        atletaNome: atleta.nome,
        titulo:     result.data.titulo,
        exercicios: result.data.exercicios,
      },
      include: { atleta: { select: { id: true, nome: true } } },
    })
    return reply.status(201).send({ ...t, atletaNome: t.atleta?.nome ?? t.atletaNome })
  })

  app.patch('/:id', { preHandler: requireTreinador }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      titulo:     z.string().min(1).optional(),
      exercicios: z.string().optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    try {
      const t = await prisma.treinoPrescrito.update({
        where: { id: Number(id) },
        data: result.data,
        include: { atleta: { select: { id: true, nome: true } } },
      })
      return { ...t, atletaNome: t.atleta?.nome ?? t.atletaNome }
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      throw e
    }
  })

  app.delete('/:id', { preHandler: requireTreinador }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.treinoPrescrito.delete({ where: { id: Number(id) } })
      return reply.status(204).send()
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      throw e
    }
  })
}

export async function fichaAtletaRoutes(app: FastifyInstance) {
  app.get('/ficha-treino', { preHandler: requireAuth }, async (request) => {
    const { sub } = request.user as { sub: number }
    const usuario = await prisma.usuario.findUnique({
      where: { id: sub },
      select: { nome: true },
    })
    if (!usuario) return []

    return prisma.treinoPrescrito.findMany({
      where: {
        OR: [
          { atletaId: sub },
          { atletaId: null, atletaNome: { contains: usuario.nome } },
        ],
      },
      orderBy: { criadoEm: 'desc' },
    })
  })
}
