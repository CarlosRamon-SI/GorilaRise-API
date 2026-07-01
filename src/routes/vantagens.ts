import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'

const schema = z.object({
  empresa:    z.string().min(1),
  beneficio:  z.string().min(1),
  codigoDesc: z.string().optional().nullable(),
  logoUrl:    z.string().optional().nullable(),
  link:       z.string().optional().nullable(),
  categoria:  z.string().optional().default('Saúde'),
  ativo:      z.boolean().optional(),
})

export async function vantagensRoutes(app: FastifyInstance) {
  // Atleta: lista apenas as vantagens ativas
  app.get('/vantagens', { preHandler: requireAuth }, async () => {
    return prisma.vantagemClube.findMany({
      where: { ativo: true },
      orderBy: [{ categoria: 'asc' }, { empresa: 'asc' }],
    })
  })

  // Admin: lista todas (ativas e inativas)
  app.get('/admin/vantagens', { preHandler: requireAdmin }, async () => {
    return prisma.vantagemClube.findMany({
      orderBy: [{ categoria: 'asc' }, { empresa: 'asc' }],
    })
  })

  app.post('/admin/vantagens', { preHandler: requireAdmin }, async (request, reply) => {
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const v = await prisma.vantagemClube.create({ data: result.data })
    return reply.status(201).send(v)
  })

  app.patch('/admin/vantagens/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = schema.partial().safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    try {
      return await prisma.vantagemClube.update({ where: { id: Number(id) }, data: result.data })
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      throw e
    }
  })

  app.delete('/admin/vantagens/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.vantagemClube.delete({ where: { id: Number(id) } })
      return reply.status(204).send()
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      throw e
    }
  })
}
