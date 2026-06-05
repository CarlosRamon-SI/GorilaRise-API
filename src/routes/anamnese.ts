import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const anamneseSchema = z.object({
  nomeCompleto:              z.string().optional(),
  dataNascimento:            z.string().optional(),
  sexo:                      z.string().optional(),
  telefone:                  z.string().optional(),
  profissao:                 z.string().optional().default(''),
  contatoEmergenciaNome:     z.string().optional().default(''),
  contatoEmergenciaTelefone: z.string().optional().default(''),
  objetivos:                 z.array(z.string()).optional().default([]),
  doencas:                   z.string().optional().default(''),
  medicamentos:              z.string().optional().default(''),
  cirurgias:                 z.string().optional().default(''),
  problemasArticulares:      z.string().optional().default(''),
  historicoCv:               z.boolean().optional().default(false),
  tabagismo:                 z.boolean().optional().default(false),
  frequenciaBanheiro:        z.string().optional().default(''),
  historicoAtividades:       z.string().optional().default(''),
  frequenciaSemanal:         z.string().optional().default(''),
  qualidadeSono:             z.string().optional().default(''),
  consumoAlcool:             z.string().optional().default(''),
  termoacceito:              z.boolean().optional().default(false),
})

function toResponse(a: any, usuario: any) {
  return {
    id: a.id,
    nomeCompleto:              usuario.nome,
    dataNascimento:            usuario.nascimento
      ? usuario.nascimento.toISOString().slice(0, 10)
      : '',
    sexo:                      '',
    telefone:                  usuario.telefone,
    profissao:                 a.profissao ?? '',
    contatoEmergenciaNome:     a.contatoEmergenciaNome ?? '',
    contatoEmergenciaTelefone: a.contatoEmergenciaTel ?? '',
    objetivos:                 Array.isArray(a.objetivos) ? a.objetivos : [],
    doencas:                   a.doencas ?? '',
    medicamentos:              a.medicamentos ?? '',
    cirurgias:                 a.cirurgias ?? '',
    problemasArticulares:      a.problemasArticulares ?? '',
    historicoCv:               a.historicoCardio,
    tabagismo:                 a.fumante,
    frequenciaBanheiro:        a.frequenciaBanheiro ?? '',
    historicoAtividades:       a.atividadeAnterior ?? '',
    frequenciaSemanal:         a.frequenciaSemanal ?? '',
    qualidadeSono:             a.qualidadeSono ?? '',
    consumoAlcool:             a.consumoAlcool ?? '',
    termoacceito:              a.termoAssinado,
  }
}

export async function anamneseRoutes(app: FastifyInstance) {
  app.get('/anamnese', { preHandler: requireAuth }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const [anamnese, usuario] = await Promise.all([
      prisma.anamnese.findUnique({ where: { usuarioId: sub } }),
      prisma.usuario.findUnique({ where: { id: sub }, select: { nome: true, nascimento: true, telefone: true } }),
    ])
    if (!anamnese || !usuario) return reply.status(404).send({ error: 'Não encontrado' })
    return toResponse(anamnese, usuario)
  })

  app.post('/anamnese', { preHandler: requireAuth }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    const result = anamneseSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const d = result.data
    const data = {
      profissao:             d.profissao,
      contatoEmergenciaNome: d.contatoEmergenciaNome,
      contatoEmergenciaTel:  d.contatoEmergenciaTelefone,
      objetivos:             d.objetivos,
      doencas:               d.doencas,
      medicamentos:          d.medicamentos,
      cirurgias:             d.cirurgias,
      problemasArticulares:  d.problemasArticulares,
      historicoCardio:       d.historicoCv,
      fumante:               d.tabagismo,
      frequenciaBanheiro:    d.frequenciaBanheiro,
      atividadeAnterior:     d.historicoAtividades,
      frequenciaSemanal:     d.frequenciaSemanal,
      qualidadeSono:         d.qualidadeSono,
      consumoAlcool:         d.consumoAlcool,
      termoAssinado:         d.termoacceito,
      termoData:             d.termoacceito ? new Date() : null,
    }

    const anamnese = await prisma.anamnese.upsert({
      where: { usuarioId: sub },
      create: { usuarioId: sub, ...data },
      update: data,
    })

    const usuario = await prisma.usuario.findUnique({
      where: { id: sub },
      select: { nome: true, nascimento: true, telefone: true },
    })

    return reply.status(201).send(toResponse(anamnese, usuario))
  })
}
