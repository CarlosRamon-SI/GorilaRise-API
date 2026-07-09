import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireTreinador, requireAuth } from '../middleware/auth.js'

const videoInclude = {
  videos: {
    include: { video: { select: { id: true, titulo: true, url: true, descricao: true } } },
  },
}

function toTreino(t: any) {
  return {
    ...t,
    atletaNome: t.atleta?.nome ?? t.atletaNome,
    videos: (t.videos ?? []).map((v: any) => v.video),
  }
}

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

    try {
      await prisma.notificacao.create({
        data: {
          titulo: 'WOD do Dia Publicado',
          corpo: `O WOD "${wod.titulo}" foi publicado para ${wod.data.toISOString().slice(0, 10)}. Prepare-se!`,
          tipo: 'AVISO',
          destinatarioRole: 'ATLETA',
        },
      })
    } catch { /* não bloqueia */ }

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

  // ── Biblioteca de Templates de Treino ───────────────────────────────────────

  app.get('/templates', { preHandler: requireTreinador }, async () => {
    return prisma.templateTreino.findMany({
      orderBy: { criadoEm: 'desc' },
      select: { id: true, titulo: true, descricao: true, exercicios: true, categoria: true, criadoEm: true },
    })
  })

  app.post('/templates', { preHandler: requireTreinador }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const schema = z.object({
      titulo:     z.string().min(1),
      descricao:  z.string().optional(),
      exercicios: z.string().optional(),
      categoria:  z.string().optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const t = await prisma.templateTreino.create({
      data: { ...result.data, autorId: sub },
      select: { id: true, titulo: true, descricao: true, exercicios: true, categoria: true, criadoEm: true },
    })
    return reply.status(201).send(t)
  })

  app.delete('/templates/:id', { preHandler: requireTreinador }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.templateTreino.delete({ where: { id: Number(id) } })
      return reply.status(204).send()
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      throw e
    }
  })

  // ── Biblioteca de Vídeos ──────────────────────────────────────────────────────

  app.get('/videos', { preHandler: requireTreinador }, async () => {
    return prisma.videoTreino.findMany({
      orderBy: { criadoEm: 'desc' },
      select: { id: true, titulo: true, url: true, descricao: true, criadoEm: true },
    })
  })

  app.post('/videos', { preHandler: requireTreinador }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const schema = z.object({
      titulo:    z.string().min(1),
      url:       z.string().url('URL inválida'),
      descricao: z.string().optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const video = await prisma.videoTreino.create({
      data: { ...result.data, autorId: sub },
      select: { id: true, titulo: true, url: true, descricao: true, criadoEm: true },
    })
    return reply.status(201).send(video)
  })

  app.delete('/videos/:id', { preHandler: requireTreinador }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.videoTreino.delete({ where: { id: Number(id) } })
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
      include: {
        atleta: { select: { id: true, nome: true } },
        ...videoInclude,
      },
    })
    return treinos.map(toTreino)
  })

  app.post('/', { preHandler: requireTreinador }, async (request, reply) => {
    const schema = z.object({
      atletaId:   z.number().int().positive(),
      titulo:     z.string().min(1),
      descricao:  z.string().optional(),
      exercicios: z.string().optional(),
      videoIds:   z.array(z.number().int().positive()).optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const atleta = await prisma.usuario.findFirst({
      where: { id: result.data.atletaId, ativo: true },
      select: { nome: true },
    })
    if (!atleta) return reply.status(404).send({ error: 'Atleta não encontrado.' })

    const { videoIds, atletaId, ...rest } = result.data
    const t = await prisma.treinoPrescrito.create({
      data: {
        atletaId,
        atletaNome: atleta.nome,
        ...rest,
        videos: videoIds?.length
          ? { create: videoIds.map(videoId => ({ videoId })) }
          : undefined,
      },
      include: {
        atleta: { select: { id: true, nome: true } },
        ...videoInclude,
      },
    })

    try {
      await prisma.notificacao.create({
        data: {
          titulo: 'Nova Ficha de Treino',
          corpo: `Seu treinador prescreveu uma nova ficha: "${t.titulo}". Acesse o painel para ver os exercícios.`,
          tipo: 'AVISO',
          destinatarioRole: 'ATLETA',
          destinatarioId: atletaId,
        },
      })
    } catch { /* não bloqueia */ }

    return reply.status(201).send(toTreino(t))
  })

  app.patch('/:id', { preHandler: requireTreinador }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      titulo:     z.string().min(1).optional(),
      descricao:  z.string().optional(),
      exercicios: z.string().optional(),
      videoIds:   z.array(z.number().int().positive()).optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    try {
      const { videoIds, ...rest } = result.data
      const t = await prisma.treinoPrescrito.update({
        where: { id: Number(id) },
        data: {
          ...rest,
          ...(videoIds !== undefined ? {
            videos: {
              deleteMany: {},
              create: videoIds.map(videoId => ({ videoId })),
            },
          } : {}),
        },
        include: {
          atleta: { select: { id: true, nome: true } },
          ...videoInclude,
        },
      })
      return toTreino(t)
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

    const treinos = await prisma.treinoPrescrito.findMany({
      where: {
        OR: [
          { atletaId: sub },
          { atletaId: null, atletaNome: { contains: usuario.nome } },
        ],
      },
      orderBy: { criadoEm: 'desc' },
      include: {
        videos: {
          include: { video: { select: { id: true, titulo: true, url: true, descricao: true } } },
        },
      },
    })
    return treinos.map(t => ({
      ...t,
      videos: t.videos.map(v => v.video),
    }))
  })
}
