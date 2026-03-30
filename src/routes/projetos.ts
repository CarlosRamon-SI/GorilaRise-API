import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAdmin } from '../middleware/auth.js'

function toSlug(str: string) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

const projetoSchema = z.object({
  titulo:    z.string().min(3),
  descricao: z.string().min(10),
  subtitulo: z.string().optional(),
  conteudo:  z.string().optional(),
  imagemUrl: z.string().url().optional().or(z.literal('')),
  icone:     z.string().optional().default('heart'),
  ativo:     z.boolean().optional().default(true),
})

export async function projetosRoutes(app: FastifyInstance) {
  // Público — lista
  app.get('/', async () => {
    return prisma.projetoSocial.findMany({ where: { ativo: true }, orderBy: { criadoEm: 'asc' } })
  })

  // Público — página individual por slug
  app.get('/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const projeto = await prisma.projetoSocial.findUnique({ where: { slug } })
    if (!projeto) return reply.status(404).send({ error: 'Projeto não encontrado' })
    return projeto
  })

  // Admin — criar
  app.post('/', { preHandler: requireAdmin }, async (request, reply) => {
    const result = projetoSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const data = result.data
    const slug = toSlug(data.titulo)

    // garante slug único
    const exists = await prisma.projetoSocial.findUnique({ where: { slug } })
    const finalSlug = exists ? `${slug}-${Date.now()}` : slug

    return reply.status(201).send(
      await prisma.projetoSocial.create({ data: { ...data, slug: finalSlug } })
    )
  })

  // Admin — editar
  app.patch('/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = projetoSchema.partial().safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    return prisma.projetoSocial.update({ where: { id: Number(id) }, data: result.data })
  })

  // Admin — inativar
  app.delete('/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.projetoSocial.update({ where: { id: Number(id) }, data: { ativo: false } })
    return reply.status(204).send()
  })
}
