import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireTreinador } from '../middleware/auth.js'

const prescricaoSchema = z.object({
  atletaId:            z.number().int().positive(),
  peso:                z.number().positive(),
  altura:              z.number().positive(),
  idade:               z.number().int().positive(),
  sexo:                z.string().min(1),
  nivelAtividade:      z.string().min(1),
  biotipo:             z.string().min(1),
  modalidadeEsportiva: z.string().optional(),
  objetivo:            z.string().min(1),
  restricoes:          z.string().optional(),
  calorias:            z.number().int(),
  proteinas:           z.number().int(),
  carboidratos:        z.number().int(),
  gorduras:            z.number().int(),
  agua:                z.number().int(),
  recomendacao:        z.string().optional(),
})

export async function dietaRoutes(app: FastifyInstance) {
  // Professor/Admin: salva a prescrição calculada para um atleta
  app.post('/dieta', { preHandler: requireTreinador }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const result = prescricaoSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const prescricao = await prisma.prescricaoDieta.create({
      data: { ...result.data, autorId: sub },
    })
    return reply.status(201).send(prescricao)
  })

  // Professor/Admin: histórico de prescrições de um atleta específico
  app.get('/dieta/atleta/:atletaId', { preHandler: requireTreinador }, async (request) => {
    const { atletaId } = request.params as { atletaId: string }
    return prisma.prescricaoDieta.findMany({
      where: { atletaId: Number(atletaId) },
      orderBy: { criadoEm: 'desc' },
    })
  })

  // Atleta: sua própria prescrição mais recente
  app.get('/dieta/minha', { preHandler: requireAuth }, async (request) => {
    const { sub } = request.user as { sub: number }
    return prisma.prescricaoDieta.findFirst({
      where: { atletaId: sub },
      orderBy: { criadoEm: 'desc' },
    })
  })
}
