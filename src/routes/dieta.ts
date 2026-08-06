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
  biotipo:             z.string().optional(),
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

const itemRefeicaoSchema = z.object({
  alimentoId:       z.number().int().positive(),
  quantidadeGramas: z.number().positive(),
  ordem:            z.number().int().optional().default(0),
})

const refeicaoSchema = z.object({
  nome:    z.string().min(1),
  horario: z.string().optional(),
  ordem:   z.number().int().optional().default(0),
  itens:   z.array(itemRefeicaoSchema).default([]),
})

const prescricaoCompletaSchema = prescricaoSchema.extend({
  refeicoes: z.array(refeicaoSchema).default([]),
})

const modeloDietaSchema = z.object({
  titulo:    z.string().min(1),
  descricao: z.string().optional(),
  categoria: z.string().optional(),
  calorias:  z.number().int().optional(),
  estrutura: z.array(z.object({
    nome:    z.string().min(1),
    horario: z.string().optional(),
    itens:   z.array(z.object({
      alimentoId:       z.number().int().positive(),
      quantidadeGramas: z.number().positive(),
    })).default([]),
  })),
})

const refeicaoInclude = {
  refeicoes: {
    orderBy: { ordem: 'asc' as const },
    include: { itens: { orderBy: { ordem: 'asc' as const }, include: { alimento: true } } },
  },
}

function arredonda(n: number): number {
  return Math.round(n * 10) / 10
}

function calcularItem(item: any) {
  const qtd = Number(item.quantidadeGramas)
  const fator = qtd / 100
  return {
    id: item.id,
    alimentoId: item.alimentoId,
    nome: item.alimento?.nome ?? null,
    quantidadeGramas: qtd,
    calorias: arredonda(Number(item.alimento.caloriasKcal) * fator),
    carboidratos: arredonda(Number(item.alimento.carboidratosG) * fator),
    proteinas: arredonda(Number(item.alimento.proteinasG) * fator),
    gorduras: arredonda(Number(item.alimento.gordurasG) * fator),
  }
}

function somaMacros(lista: { calorias: number; carboidratos: number; proteinas: number; gorduras: number }[]) {
  const total = lista.reduce((acc, m) => ({
    calorias: acc.calorias + m.calorias,
    carboidratos: acc.carboidratos + m.carboidratos,
    proteinas: acc.proteinas + m.proteinas,
    gorduras: acc.gorduras + m.gorduras,
  }), { calorias: 0, carboidratos: 0, proteinas: 0, gorduras: 0 })
  return {
    calorias: arredonda(total.calorias),
    carboidratos: arredonda(total.carboidratos),
    proteinas: arredonda(total.proteinas),
    gorduras: arredonda(total.gorduras),
  }
}

function toRefeicaoResponse(refeicao: any) {
  const itens = (refeicao.itens ?? []).map(calcularItem)
  return {
    id: refeicao.id,
    nome: refeicao.nome,
    horario: refeicao.horario,
    ordem: refeicao.ordem,
    itens,
    totais: somaMacros(itens),
  }
}

function toPrescricaoResponse(p: any) {
  const refeicoes = (p.refeicoes ?? []).map(toRefeicaoResponse)
  return {
    ...p,
    refeicoes,
    totaisRefeicoes: somaMacros(refeicoes.map((r: any) => r.totais)),
  }
}

export async function dietaRoutes(app: FastifyInstance) {
  // Professor/Admin: salva a prescrição calculada para um atleta (fluxo antigo, sem refeições)
  app.post('/dieta', { preHandler: requireTreinador }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const result = prescricaoSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const prescricao = await prisma.prescricaoDieta.create({
      data: { ...result.data, autorId: sub },
    })
    return reply.status(201).send(prescricao)
  })

  // Professor/Admin: salva uma prescrição completa, com refeições e alimentos
  app.post('/dieta/completa', { preHandler: requireTreinador }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const result = prescricaoCompletaSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const { refeicoes, ...cabecalho } = result.data
    const prescricao = await prisma.prescricaoDieta.create({
      data: {
        ...cabecalho,
        autorId: sub,
        refeicoes: {
          create: refeicoes.map(r => ({
            nome: r.nome,
            horario: r.horario,
            ordem: r.ordem,
            itens: { create: r.itens.map(i => ({ alimentoId: i.alimentoId, quantidadeGramas: i.quantidadeGramas, ordem: i.ordem })) },
          })),
        },
      },
      include: refeicaoInclude,
    })
    return reply.status(201).send(toPrescricaoResponse(prescricao))
  })

  // Professor/Admin: busca uma prescrição completa (com refeições, alimentos e totais calculados)
  app.get('/dieta/completa/:id', { preHandler: requireTreinador }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const prescricao = await prisma.prescricaoDieta.findUnique({
      where: { id: Number(id) },
      include: refeicaoInclude,
    })
    if (!prescricao) return reply.status(404).send({ error: 'Prescrição não encontrada' })
    return toPrescricaoResponse(prescricao)
  })

  // Professor/Admin: histórico de prescrições de um atleta específico
  app.get('/dieta/atleta/:atletaId', { preHandler: requireTreinador }, async (request) => {
    const { atletaId } = request.params as { atletaId: string }
    const prescricoes = await prisma.prescricaoDieta.findMany({
      where: { atletaId: Number(atletaId) },
      orderBy: { criadoEm: 'desc' },
      include: refeicaoInclude,
    })
    return prescricoes.map(toPrescricaoResponse)
  })

  // Atleta: sua própria prescrição mais recente
  app.get('/dieta/minha', { preHandler: requireAuth }, async (request) => {
    const { sub } = request.user as { sub: number }
    const prescricao = await prisma.prescricaoDieta.findFirst({
      where: { atletaId: sub },
      orderBy: { criadoEm: 'desc' },
      include: refeicaoInclude,
    })
    return prescricao ? toPrescricaoResponse(prescricao) : null
  })

  // Professor/Admin: dados já cadastrados do atleta (anamnese, biometria, matrícula) pra prefill da prescrição
  app.get('/dieta/dados-atleta/:atletaId', { preHandler: requireTreinador }, async (request, reply) => {
    const { atletaId } = request.params as { atletaId: string }
    const id = Number(atletaId)

    const [usuario, anamnese, biometria, matricula] = await Promise.all([
      prisma.usuario.findUnique({ where: { id }, select: { nascimento: true } }),
      prisma.anamnese.findUnique({
        where: { usuarioId: id },
        select: {
          sexo: true,
          objetivos: true,
          objetivoDescricao: true,
          alergiasIntolerancias: true,
          restricoesAlimentares: true,
          preferenciasAlimentares: true,
          rotinaAlimentar: true,
          atualizadoEm: true,
        },
      }),
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
      objetivos: anamnese?.objetivos ?? [],
      objetivoDescricao: anamnese?.objetivoDescricao ?? null,
      alergiasIntolerancias: anamnese?.alergiasIntolerancias ?? null,
      restricoesAlimentares: anamnese?.restricoesAlimentares ?? null,
      preferenciasAlimentares: anamnese?.preferenciasAlimentares ?? null,
      rotinaAlimentar: anamnese?.rotinaAlimentar ?? null,
      anamneseAtualizadoEm: anamnese?.atualizadoEm ?? null,
    }
  })

  // ── Biblioteca de Modelos de Dieta ──────────────────────────────────────────

  app.get('/dieta/modelos', { preHandler: requireTreinador }, async () => {
    return prisma.modeloDieta.findMany({
      orderBy: { criadoEm: 'desc' },
      select: { id: true, titulo: true, descricao: true, categoria: true, calorias: true, criadoEm: true },
    })
  })

  app.get('/dieta/modelos/:id', { preHandler: requireTreinador }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const modelo = await prisma.modeloDieta.findUnique({ where: { id: Number(id) } })
    if (!modelo) return reply.status(404).send({ error: 'Modelo não encontrado' })
    return modelo
  })

  app.post('/dieta/modelos', { preHandler: requireTreinador }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const result = modeloDietaSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const modelo = await prisma.modeloDieta.create({
      data: { ...result.data, autorId: sub },
    })
    return reply.status(201).send(modelo)
  })

  app.delete('/dieta/modelos/:id', { preHandler: requireTreinador }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.modeloDieta.delete({ where: { id: Number(id) } })
      return reply.status(204).send()
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Não encontrado.' })
      throw e
    }
  })

  // Professor/Admin: cria uma prescrição completa para um atleta a partir das refeições de um modelo salvo
  app.post('/dieta/modelos/:id/prescrever', { preHandler: requireTreinador }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const { id } = request.params as { id: string }

    const modelo = await prisma.modeloDieta.findUnique({ where: { id: Number(id) } })
    if (!modelo) return reply.status(404).send({ error: 'Modelo não encontrado' })

    const result = prescricaoSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const estrutura = modelo.estrutura as unknown as z.infer<typeof modeloDietaSchema>['estrutura']

    const prescricao = await prisma.prescricaoDieta.create({
      data: {
        ...result.data,
        autorId: sub,
        refeicoes: {
          create: estrutura.map((r, i) => ({
            nome: r.nome,
            horario: r.horario,
            ordem: i,
            itens: {
              create: r.itens.map((it, j) => ({
                alimentoId: it.alimentoId,
                quantidadeGramas: it.quantidadeGramas,
                ordem: j,
              })),
            },
          })),
        },
      },
      include: refeicaoInclude,
    })
    return reply.status(201).send(toPrescricaoResponse(prescricao))
  })
}
