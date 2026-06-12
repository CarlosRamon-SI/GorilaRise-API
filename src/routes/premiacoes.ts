import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAdmin } from '../middleware/auth.js'

const schema = z.object({
  titulo:     z.string().min(1),
  descricao:  z.string().optional(),
  atletaNome: z.string().optional().default(''),
  atletaId:   z.number().int().positive().nullable().optional(),
  data:       z.string().optional(),
  imagemUrl:  z.string().optional(),
  ativo:      z.boolean().optional(),
})

function toResponse(p: any) {
  return {
    id:         p.id,
    titulo:     p.titulo,
    descricao:  p.descricao ?? '',
    atletaNome: p.atletaNome,
    atletaId:   p.atletaId ?? null,
    data:       p.data ? p.data.toISOString().slice(0, 10) : '',
    imagemUrl:  p.imagemUrl ?? null,
    ativo:      p.ativo,
    criadoEm:   p.criadoEm,
  }
}

export async function premiacoesRoutes(app: FastifyInstance) {
  app.get('/premiacoes', async (request) => {
    const { ativo } = request.query as { ativo?: string }
    const items = await prisma.premiacao.findMany({
      where: ativo !== undefined ? { ativo: ativo === 'true' } : undefined,
      orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
    })
    return items.map(toResponse)
  })

  app.post('/premiacoes', { preHandler: requireAdmin }, async (request, reply) => {
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { data, ...rest } = result.data
    const p = await prisma.premiacao.create({
      data: { ...rest, data: data ? new Date(data) : null },
    })
    return reply.status(201).send(toResponse(p))
  })

  app.patch('/premiacoes/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = schema.partial().safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { data, ...rest } = result.data
    try {
      const p = await prisma.premiacao.update({
        where: { id: Number(id) },
        data: { ...rest, ...(data !== undefined ? { data: new Date(data) } : {}) },
      })
      return toResponse(p)
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      throw e
    }
  })

  app.delete('/premiacoes/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.premiacao.delete({ where: { id: Number(id) } })
      return reply.status(204).send()
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      throw e
    }
  })
}
