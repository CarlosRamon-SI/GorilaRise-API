import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireTreinador } from '../middleware/auth.js'

function mapEscalacao(e: any) {
  return {
    id:         e.id,
    titulo:     e.titulo,
    descricao:  e.descricao ?? null,
    data:       e.data.toISOString().slice(0, 10),
    treinadorId: e.treinadorId,
    criadoEm:   e.criadoEm.toISOString(),
    atletas: (e.atletas ?? []).map((a: any) => ({
      atletaId: a.atletaId,
      posicao:  a.posicao ?? null,
      nome:     a.atleta?.nome ?? '',
      email:    a.atleta?.email ?? '',
    })),
  }
}

export async function escalacaoRoutes(app: FastifyInstance) {
  // Listar escalações do treinador
  app.get('/escalacoes', { preHandler: requireTreinador }, async (request) => {
    const { sub } = request.user as { sub: number }
    const escalacoes = await prisma.escalacao.findMany({
      where: { treinadorId: sub },
      orderBy: { data: 'desc' },
      include: {
        atletas: { include: { atleta: { select: { id: true, nome: true, email: true } } } },
      },
    })
    return escalacoes.map(mapEscalacao)
  })

  // Criar nova escalação
  app.post('/escalacoes', { preHandler: requireTreinador }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const schema = z.object({
      titulo:     z.string().min(1),
      descricao:  z.string().optional(),
      data:       z.string(),
      atletasIds: z.array(z.object({
        atletaId: z.number().int().positive(),
        posicao:  z.string().optional(),
      })).optional().default([]),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const dataEscalacao = new Date(result.data.data + 'T12:00:00')
    const escalacao = await prisma.escalacao.create({
      data: {
        titulo:     result.data.titulo,
        descricao:  result.data.descricao,
        data:       dataEscalacao,
        treinadorId: sub,
        atletas: {
          create: result.data.atletasIds.map(a => ({
            atletaId: a.atletaId,
            posicao:  a.posicao ?? null,
          })),
        },
      },
      include: {
        atletas: { include: { atleta: { select: { id: true, nome: true, email: true } } } },
      },
    })

    // Notificar cada atleta escalado
    if (result.data.atletasIds.length > 0) {
      const dataFmt = dataEscalacao.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      await prisma.notificacao.createMany({
        data: result.data.atletasIds.map(a => ({
          titulo: 'Você foi escalado!',
          corpo: `Você está na escalação "${result.data.titulo}" em ${dataFmt}.`,
          tipo: 'CONVOCACAO' as const,
          destinatarioId: a.atletaId,
        })),
      })
    }

    return reply.status(201).send(mapEscalacao(escalacao))
  })

  // Excluir escalação
  app.delete('/escalacoes/:id', { preHandler: requireTreinador }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const { id } = request.params as { id: string }
    const deleted = await prisma.escalacao.deleteMany({
      where: { id: Number(id), treinadorId: sub },
    })
    if (deleted.count === 0) return reply.status(404).send({ error: 'Escalação não encontrada.' })
    return reply.status(204).send()
  })

  // Adicionar atleta a uma escalação
  app.post('/escalacoes/:id/atletas', { preHandler: requireTreinador }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const { id } = request.params as { id: string }
    const schema = z.object({
      atletaId: z.number().int().positive(),
      posicao:  z.string().optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const escalacao = await prisma.escalacao.findFirst({ where: { id: Number(id), treinadorId: sub } })
    if (!escalacao) return reply.status(404).send({ error: 'Escalação não encontrada.' })

    try {
      await prisma.escalacaoAtleta.create({
        data: { escalacaoId: Number(id), atletaId: result.data.atletaId, posicao: result.data.posicao ?? null },
      })
    } catch (e: any) {
      if (e.code === 'P2002') return reply.status(409).send({ error: 'Atleta já escalado.' })
      throw e
    }

    // Notificar o atleta recém-escalado
    const dataFmt = escalacao.data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    await prisma.notificacao.create({
      data: {
        titulo: 'Você foi escalado!',
        corpo: `Você está na escalação "${escalacao.titulo}" em ${dataFmt}.`,
        tipo: 'CONVOCACAO',
        destinatarioId: result.data.atletaId,
      },
    })

    return reply.status(201).send({ ok: true })
  })

  // Remover atleta de uma escalação
  app.delete('/escalacoes/:id/atletas/:atletaId', { preHandler: requireTreinador }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const { id, atletaId } = request.params as { id: string; atletaId: string }

    const escalacao = await prisma.escalacao.findFirst({ where: { id: Number(id), treinadorId: sub } })
    if (!escalacao) return reply.status(404).send({ error: 'Escalação não encontrada.' })

    await prisma.escalacaoAtleta.deleteMany({
      where: { escalacaoId: Number(id), atletaId: Number(atletaId) },
    })
    return reply.status(204).send()
  })
}
