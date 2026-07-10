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

  // Professor/Admin: dados já cadastrados do atleta (anamnese, biometria, matrícula) pra prefill da prescrição
  app.get('/dieta/dados-atleta/:atletaId', { preHandler: requireTreinador }, async (request, reply) => {
    const { atletaId } = request.params as { atletaId: string }
    const id = Number(atletaId)

    const [usuario, anamnese, biometria, matricula] = await Promise.all([
      prisma.usuario.findUnique({ where: { id }, select: { nascimento: true } }),
      prisma.anamnese.findUnique({ where: { usuarioId: id }, select: { sexo: true, atualizadoEm: true } }),
      prisma.biometria.findUnique({ where: { usuarioId: id }, select: { peso: true, altura: true, atualizadoEm: true } }),
      prisma.matricula.findFirst({
        where: { usuarioId: id, status: 'ATIVA' },
        orderBy: { criadoEm: 'desc' },
        select: { criadoEm: true, modalidade: { select: { nome: true } } },
      }),
    ])

    if (!usuario) return reply.status(404).send({ error: 'Atleta não encontrado' })

    let idade: number | null = null
    const nasc = usuario.nascimento
    if (nasc) {
      const hoje = new Date()
      idade = hoje.getFullYear() - nasc.getFullYear()
      const aindaNaoFezAniversario =
        hoje.getMonth() < nasc.getMonth() ||
        (hoje.getMonth() === nasc.getMonth() && hoje.getDate() < nasc.getDate())
      if (aindaNaoFezAniversario) idade--
    }

    return {
      idade,
      sexo: anamnese?.sexo ?? null,
      sexoAtualizadoEm: anamnese?.atualizadoEm ?? null,
      peso: biometria?.peso ?? null,
      altura: biometria?.altura ?? null,
      biometriaAtualizadoEm: biometria?.atualizadoEm ?? null,
      modalidadeEsportiva: matricula?.modalidade?.nome ?? null,
      matriculaDesde: matricula?.criadoEm ?? null,
    }
  })
}
