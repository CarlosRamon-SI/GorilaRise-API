import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireTreinador } from '../middleware/auth.js'

const alimentoSchema = z.object({
  nome:          z.string().min(1),
  categoria:     z.string().optional(),
  caloriasKcal:  z.number().nonnegative(),
  carboidratosG: z.number().nonnegative(),
  proteinasG:    z.number().nonnegative(),
  gordurasG:     z.number().nonnegative(),
})

const alimentoUpdateSchema = alimentoSchema.partial()

export async function alimentosRoutes(app: FastifyInstance) {
  // Busca/lista alimentos do banco (100g de referência)
  app.get('/alimentos', { preHandler: requireTreinador }, async (request) => {
    const { busca } = request.query as { busca?: string }
    return prisma.alimento.findMany({
      where: busca ? { nome: { contains: busca } } : undefined,
      orderBy: { nome: 'asc' },
    })
  })

  app.post('/alimentos', { preHandler: requireTreinador }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const result = alimentoSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const alimento = await prisma.alimento.create({
      data: { ...result.data, autorId: sub },
    })
    return reply.status(201).send(alimento)
  })

  app.patch('/alimentos/:id', { preHandler: requireTreinador }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = alimentoUpdateSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    try {
      const alimento = await prisma.alimento.update({
        where: { id: Number(id) },
        data: result.data,
      })
      return alimento
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      throw e
    }
  })

  app.delete('/alimentos/:id', { preHandler: requireTreinador }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.alimento.delete({ where: { id: Number(id) } })
      return reply.status(204).send()
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      if (e.code === 'P2003') return reply.status(409).send({ error: 'Este alimento está em uso em uma ou mais prescrições e não pode ser excluído.' })
      throw e
    }
  })
}
