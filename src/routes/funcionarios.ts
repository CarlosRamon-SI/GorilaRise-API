import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAdmin, requireTreinador } from '../middleware/auth.js'

const schema = z.object({
  nome:   z.string().min(2),
  email:  z.string().email(),
  cref:   z.string().optional().default(''),
  funcao: z.enum(['PROFESSOR', 'NUTRICIONISTA', 'FISIOTERAPEUTA']).default('PROFESSOR'),
  ativo:  z.boolean().optional(),
})

export async function funcionariosRoutes(app: FastifyInstance) {
  app.get('/funcionarios', { preHandler: requireTreinador }, async () => {
    return prisma.funcionario.findMany({ orderBy: { nome: 'asc' } })
  })

  app.post('/funcionarios', { preHandler: requireAdmin }, async (request, reply) => {
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    try {
      const f = await prisma.funcionario.create({ data: result.data })
      return reply.status(201).send(f)
    } catch (e: any) {
      if (e.code === 'P2002') return reply.status(409).send({ error: 'E-mail já em uso.' })
      throw e
    }
  })

  app.patch('/funcionarios/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = schema.partial().safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    try {
      const f = await prisma.funcionario.update({ where: { id: Number(id) }, data: result.data })
      return f
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      if (e.code === 'P2002') return reply.status(409).send({ error: 'E-mail já em uso.' })
      throw e
    }
  })

  app.delete('/funcionarios/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.funcionario.delete({ where: { id: Number(id) } })
      return reply.status(204).send()
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      throw e
    }
  })
}
