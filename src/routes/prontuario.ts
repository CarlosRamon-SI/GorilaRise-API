import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

export async function prontuarioRoutes(app: FastifyInstance) {
  app.get('/prontuario', { preHandler: requireAuth }, async (request) => {
    const { sub } = request.user as { sub: number }
    const [biometria, documentos] = await Promise.all([
      prisma.biometria.findUnique({ where: { usuarioId: sub } }),
      prisma.prontuarioDoc.findMany({ where: { usuarioId: sub }, orderBy: { criadoEm: 'desc' } }),
    ])
    return {
      biometria: biometria
        ? { peso: biometria.peso ?? '', altura: biometria.altura ?? '', pressaoArterial: biometria.pressaoArterial ?? '', bioimpedancia: biometria.bioimpedancia ?? '' }
        : null,
      documentos,
    }
  })

  app.post('/prontuario', { preHandler: requireAuth }, async (request) => {
    const { sub } = request.user as { sub: number }
    const schema = z.object({
      peso:            z.string().optional().default(''),
      altura:          z.string().optional().default(''),
      pressaoArterial: z.string().optional().default(''),
      bioimpedancia:   z.string().optional().default(''),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return { error: result.error.flatten() }
    await prisma.biometria.upsert({
      where:  { usuarioId: sub },
      create: { usuarioId: sub, ...result.data },
      update: result.data,
    })
    return { ok: true }
  })

  app.post('/prontuario/documentos', { preHandler: requireAuth }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const schema = z.object({
      url:  z.string().min(1),
      nome: z.string().min(1),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const doc = await prisma.prontuarioDoc.create({
      data: { usuarioId: sub, ...result.data },
    })
    return reply.status(201).send(doc)
  })
}
