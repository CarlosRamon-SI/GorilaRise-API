import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAdmin } from '../middleware/auth.js'

const horarioDiaSchema = z.object({
  aberto:     z.boolean(),
  abertura:   z.string(),
  fechamento: z.string(),
})

const configSchema = z.object({
  logradouro:  z.string().optional(),
  numero:      z.string().optional(),
  complemento: z.string().optional(),
  bairro:      z.string().optional(),
  cidade:      z.string().optional(),
  estado:      z.string().optional(),
  cep:         z.string().optional(),
  telefone:    z.string().optional(),
  whatsapp:    z.string().optional(),
  email:       z.string().optional(),
  horarios:    z.record(horarioDiaSchema).optional(),
  instagram:   z.string().optional(),
  facebook:    z.string().optional(),
  youtube:     z.string().optional(),
  tiktok:      z.string().optional(),
})

async function getOrCreate() {
  const existing = await prisma.configuracao.findFirst()
  if (existing) return existing
  return prisma.configuracao.create({ data: {} })
}

export async function configuracoesRoutes(app: FastifyInstance) {
  // GET público — usado pelo footer e pela tela admin ao carregar
  app.get('/configuracoes', async () => {
    return getOrCreate()
  })

  // PATCH admin — salva as configurações
  app.patch('/admin/configuracoes', { preHandler: requireAdmin }, async (request, reply) => {
    const result = configSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const current = await getOrCreate()
    return prisma.configuracao.update({
      where: { id: current.id },
      data: result.data as any,
    })
  })
}
