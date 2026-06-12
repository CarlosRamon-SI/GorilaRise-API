import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { requireTreinador } from '../middleware/auth.js'

export async function professorRoutes(app: FastifyInstance) {
  app.get('/atletas', { preHandler: requireTreinador }, async (request) => {
    const { sub } = request.user as { sub: number }
    const { meus } = request.query as { meus?: string }
    return prisma.usuario.findMany({
      where: {
        role: 'ATLETA',
        ativo: true,
        ...(meus === 'true' ? { matriculas: { some: { status: 'ATIVA', responsavelId: sub } } } : {}),
      },
      select: {
        id:    true,
        nome:  true,
        email: true,
        matriculas: {
          where: { status: 'ATIVA' },
          include: { modalidade: true, plano: true },
        },
      },
      orderBy: { nome: 'asc' },
    })
  })

  // Lista todos os atletas com suas anamneses (para o professor visualizar)
  app.get('/anamneses', { preHandler: requireTreinador }, async () => {
    const atletas = await prisma.usuario.findMany({
      where: { role: 'ATLETA', ativo: true },
      select: {
        id:         true,
        nome:       true,
        email:      true,
        nascimento: true,
        telefone:   true,
        anamnese:   true,
      },
      orderBy: { nome: 'asc' },
    })
    return atletas.map(a => ({
      id:    a.id,
      nome:  a.nome,
      email: a.email,
      nascimento: a.nascimento ? a.nascimento.toISOString().slice(0, 10) : null,
      telefone:   a.telefone,
      anamnese: a.anamnese ? {
        id:                    a.anamnese.id,
        profissao:             a.anamnese.profissao ?? '',
        contatoEmergenciaNome: a.anamnese.contatoEmergenciaNome ?? '',
        contatoEmergenciaTel:  a.anamnese.contatoEmergenciaTel ?? '',
        objetivos:             Array.isArray(a.anamnese.objetivos) ? a.anamnese.objetivos : [],
        doencas:               a.anamnese.doencas ?? '',
        medicamentos:          a.anamnese.medicamentos ?? '',
        cirurgias:             a.anamnese.cirurgias ?? '',
        problemasArticulares:  a.anamnese.problemasArticulares ?? '',
        historicoCardio:       a.anamnese.historicoCardio,
        fumante:               a.anamnese.fumante,
        frequenciaSemanal:     a.anamnese.frequenciaSemanal ?? '',
        qualidadeSono:         a.anamnese.qualidadeSono ?? '',
        consumoAlcool:         a.anamnese.consumoAlcool ?? '',
        termoAssinado:         a.anamnese.termoAssinado,
        criadoEm:              a.anamnese.criadoEm.toISOString().slice(0, 10),
      } : null,
    }))
  })

  // Records de um atleta específico (para o professor ver o desempenho)
  app.get('/atletas/:id/recordes', { preHandler: requireTreinador }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const atletaId = Number(id)
    const atleta = await prisma.usuario.findFirst({
      where: { id: atletaId, role: 'ATLETA', ativo: true },
      select: { id: true },
    })
    if (!atleta) return reply.status(404).send({ error: 'Atleta não encontrado.' })

    const recordes = await prisma.recorde.findMany({
      where: { usuarioId: atletaId },
      orderBy: { data: 'desc' },
    })
    return recordes.map(r => ({
      id:        r.id,
      exercicio: r.exercicio,
      carga:     r.carga,
      data:      r.data.toISOString().slice(0, 10),
    }))
  })
}
