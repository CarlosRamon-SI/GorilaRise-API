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

const importarSchema = z.object({
  itens: z.array(z.record(z.string(), z.any())).min(1).max(2000),
})

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
    try {
      const alimento = await prisma.alimento.create({
        data: { ...result.data, autorId: sub },
      })
      return reply.status(201).send(alimento)
    } catch (e: any) {
      if (e.code === 'P2002') return reply.status(409).send({ error: `Já existe um alimento chamado "${result.data.nome}".` })
      throw e
    }
  })

  // Importação em massa (ex: planilha .xlsx convertida em JSON pelo frontend)
  app.post('/alimentos/importar', { preHandler: requireTreinador }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const body = importarSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    let criados = 0
    const erros: { linha: number; erro: string }[] = []

    for (const [i, raw] of body.data.itens.entries()) {
      // O frontend manda a linha real da planilha (após pular o cabeçalho); sem isso, cai no índice do array.
      const { linha: linhaEnviada, ...campos } = raw as Record<string, any>
      const linha = typeof linhaEnviada === 'number' ? linhaEnviada : i + 2

      const parsed = alimentoSchema.safeParse(campos)
      if (!parsed.success) {
        const mensagens = Object.values(parsed.error.flatten().fieldErrors).flat()
        erros.push({ linha, erro: mensagens.join('; ') || 'Dados inválidos' })
        continue
      }
      try {
        await prisma.alimento.create({ data: { ...parsed.data, autorId: sub } })
        criados++
      } catch (e: any) {
        if (e.code === 'P2002') erros.push({ linha, erro: `Já existe um alimento chamado "${parsed.data.nome}".` })
        else erros.push({ linha, erro: 'Erro ao salvar no banco' })
      }
    }

    return reply.status(201).send({ criados, total: body.data.itens.length, erros })
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
      if (e.code === 'P2002') return reply.status(409).send({ error: 'Já existe um alimento com esse nome.' })
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
