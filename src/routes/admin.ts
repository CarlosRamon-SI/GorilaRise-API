import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma.js'
import { requireAdmin, requireTreinador, assertMatriculaAtiva } from '../middleware/auth.js'
import { sendEmail } from '../lib/mailer.js'
import { tplUsuarioAtivado, tplMatriculaAtivada, tplMatriculaCancelada } from '../lib/emailTemplates.js'

export async function adminRoutes(app: FastifyInstance) {
  // Stats
  app.get('/stats', { preHandler: requireTreinador }, async () => {
    const [usuarios, matriculas, modalidades, planos, leads, projetos, documentos, funcionarios, patrocinadores, usuariosPendentes] = await Promise.all([
      prisma.usuario.count({ where: { ativo: true } }),
      prisma.matricula.count({ where: { status: 'ATIVA' } }),
      prisma.modalidade.count({ where: { ativa: true } }),
      prisma.plano.count({ where: { ativo: true } }),
      prisma.lead.count(),
      prisma.projetoSocial.count({ where: { ativo: true } }),
      prisma.documentoOficial.count({ where: { ativo: true } }),
      prisma.funcionario.count({ where: { ativo: true } }),
      prisma.patrocinador.count({ where: { ativo: true } }),
      prisma.usuario.count({ where: { ativo: false } }),
    ])
    return { usuarios, matriculas, modalidades, planos, leads, projetos, documentos, funcionarios, patrocinadores, usuariosPendentes }
  })

  // Listar usuários
  app.get('/usuarios', { preHandler: requireTreinador }, async (request) => {
    const { role, ativo, comMatriculaAtiva } = request.query as { role?: string; ativo?: string; comMatriculaAtiva?: string }
    return prisma.usuario.findMany({
      where: {
        ...(role ? { role: role as any } : {}),
        ...(ativo !== undefined ? { ativo: ativo === 'true' } : {}),
        ...(comMatriculaAtiva === 'true' ? { matriculas: { some: { status: 'ATIVA' } } } : {}),
      },
      select: {
        id: true, nome: true, email: true, cpf: true,
        telefone: true, cidade: true, role: true, funcao: true, ativo: true, criadoEm: true,
        matriculas: {
          include: { modalidade: true, plano: true },
          where: { status: 'ATIVA' },
        },
      },
      orderBy: { criadoEm: 'desc' },
    })
  })

  // Atualizar role/ativo/dados de usuário — só ADMIN
  app.patch('/usuarios/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      role:     z.enum(['ATLETA', 'TREINADOR', 'ADMIN']).optional(),
      funcao:   z.enum(['PROFESSOR', 'NUTRICIONISTA', 'FISIOTERAPEUTA']).nullable().optional(),
      ativo:    z.boolean().optional(),
      nome:     z.string().min(3).optional(),
      email:    z.string().email().optional(),
      telefone: z.string().optional(),
      cpf:      z.string().optional(),
      cidade:   z.string().optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    try {
      const updated = await prisma.usuario.update({
        where: { id: Number(id) },
        data: result.data,
        select: { id: true, nome: true, email: true, cpf: true, telefone: true, cidade: true, role: true, funcao: true, ativo: true, criadoEm: true },
      })
      if (result.data.ativo === true) {
        const tpl = tplUsuarioAtivado(updated.nome)
        await sendEmail({ to: updated.email, toggle: 'emailUsuarioAtivado', ...tpl })
      }
      return updated
    } catch (e: any) {
      if (e.code === 'P2002') {
        const field = e.meta?.target?.includes('email') ? 'e-mail' : 'CPF'
        return reply.status(409).send({ error: `Este ${field} já está em uso.` })
      }
      throw e
    }
  })

  // Alterar senha de usuário — só ADMIN
  app.patch('/usuarios/:id/senha', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({ senha: z.string().min(8) })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: 'Senha deve ter mínimo 8 caracteres.' })
    const hash = await bcrypt.hash(result.data.senha, 10)
    await prisma.usuario.update({ where: { id: Number(id) }, data: { senha: hash } })
    return reply.status(204).send()
  })

  // Criar novo usuário — só ADMIN
  app.post('/usuarios', { preHandler: requireAdmin }, async (request, reply) => {
    const schema = z.object({
      nome:     z.string().min(3),
      email:    z.string().email(),
      cpf:      z.string().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/),
      telefone: z.string().min(10),
      cidade:   z.string().optional().default(''),
      role:     z.enum(['ATLETA', 'TREINADOR', 'ADMIN']).default('ATLETA'),
      funcao:   z.enum(['PROFESSOR', 'NUTRICIONISTA', 'FISIOTERAPEUTA']).nullable().optional(),
      senha:    z.string().min(8),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const hash = await bcrypt.hash(result.data.senha, 10)
    try {
      const { senha, ...rest } = result.data
      const usuario = await prisma.usuario.create({
        data: { ...rest, senha: hash, nascimento: new Date(), endereco: '', cep: '' },
        select: { id: true, nome: true, email: true, cpf: true, telefone: true, cidade: true, role: true, funcao: true, ativo: true, criadoEm: true },
      })
      return reply.status(201).send(usuario)
    } catch (e: any) {
      if (e.code === 'P2002') {
        const field = e.meta?.target?.includes('email') ? 'e-mail' : 'CPF'
        return reply.status(409).send({ error: `Este ${field} já está em uso.` })
      }
      throw e
    }
  })

  // Listar matrículas
  app.get('/matriculas', { preHandler: requireTreinador }, async () => {
    return prisma.matricula.findMany({
      include: {
        usuario:    { select: { id: true, nome: true, email: true } },
        modalidade: true,
        plano:      true,
        responsavel: { select: { id: true, nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })
  })

  // Criar matrícula — só ADMIN
  app.post('/matriculas', { preHandler: requireAdmin }, async (request, reply) => {
    const schema = z.object({
      usuarioId:     z.number().int().positive(),
      modalidadeId:  z.number().int().positive(),
      planoId:       z.number().int().positive(),
      responsavelId: z.number().int().positive(),
      status:        z.enum(['ATIVA', 'INATIVA', 'PENDENTE']).default('ATIVA'),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const matricula = await prisma.matricula.create({
      data: result.data,
      include: {
        usuario:    { select: { id: true, nome: true, email: true } },
        modalidade: true,
        plano:      true,
        responsavel: { select: { id: true, nome: true } },
      },
    })

    // G6: auto-notify athlete
    if (result.data.status === 'ATIVA') {
      try {
        await prisma.notificacao.create({
          data: {
            titulo: 'Matrícula Ativada',
            corpo: `Sua matrícula foi ativada! Modalidade: ${matricula.modalidade.nome}, Plano: ${matricula.plano.nome}. Bem-vindo ao Gorila Rise!`,
            tipo: 'AVISO',
            destinatarioRole: 'ATLETA',
            destinatarioId: result.data.usuarioId,
          },
        })
      } catch { /* não bloqueia */ }

      const tpl = tplMatriculaAtivada({
        nome:       matricula.usuario.nome,
        modalidade: matricula.modalidade.nome,
        plano:      matricula.plano.nome,
        valor:      matricula.plano.valor.toString(),
      })
      await sendEmail({ to: matricula.usuario.email, toggle: 'emailMatriculaAtivada', ...tpl })
    }

    return reply.status(201).send(matricula)
  })

  // Editar matrícula completa — só ADMIN
  app.patch('/matriculas/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      modalidadeId:  z.number().int().positive().optional(),
      planoId:       z.number().int().positive().optional(),
      responsavelId: z.number().int().positive(),
      status:        z.enum(['ATIVA', 'INATIVA', 'PENDENTE']).optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    try {
      const updated = await prisma.matricula.update({
        where: { id: Number(id) },
        data: result.data,
        include: {
          usuario:    { select: { id: true, nome: true, email: true } },
          modalidade: true,
          plano:      true,
          responsavel: { select: { id: true, nome: true } },
        },
      })

      if (result.data.status === 'ATIVA') {
        const tpl = tplMatriculaAtivada({
          nome:       updated.usuario.nome,
          modalidade: updated.modalidade.nome,
          plano:      updated.plano.nome,
          valor:      updated.plano.valor.toString(),
        })
        await sendEmail({ to: updated.usuario.email, toggle: 'emailMatriculaAtivada', ...tpl })
      } else if (result.data.status === 'INATIVA') {
        const tpl = tplMatriculaCancelada({ nome: updated.usuario.nome, modalidade: updated.modalidade.nome })
        await sendEmail({ to: updated.usuario.email, toggle: 'emailMatriculaCancelada', ...tpl })
      }

      return updated
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Matrícula não encontrada.' })
      throw e
    }
  })

  // Listar leads
  app.get('/leads', { preHandler: requireTreinador }, async (request) => {
    const { origem } = request.query as { origem?: string }
    return prisma.lead.findMany({
      where: origem ? { origem } : undefined,
      orderBy: { criadoEm: 'desc' },
    })
  })

  // Listar anamneses de todos os atletas
  app.get('/anamneses', { preHandler: requireTreinador }, async () => {
    const atletas = await prisma.usuario.findMany({
      where: { role: 'ATLETA', ativo: true },
      select: { id: true, nome: true, email: true, nascimento: true, telefone: true, anamnese: true },
      orderBy: { nome: 'asc' },
    })
    return atletas.map(a => ({
      id:         a.id,
      nome:       a.nome,
      email:      a.email,
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

  // Editar anamnese de um atleta — só ADMIN/TREINADOR
  app.patch('/anamneses/:userId', { preHandler: requireTreinador }, async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const schema = z.object({
      profissao:             z.string().optional(),
      contatoEmergenciaNome: z.string().optional(),
      contatoEmergenciaTel:  z.string().optional(),
      objetivos:             z.array(z.string()).optional(),
      doencas:               z.string().optional(),
      medicamentos:          z.string().optional(),
      cirurgias:             z.string().optional(),
      problemasArticulares:  z.string().optional(),
      historicoCardio:       z.boolean().optional(),
      fumante:               z.boolean().optional(),
      frequenciaSemanal:     z.string().optional(),
      qualidadeSono:         z.string().optional(),
      consumoAlcool:         z.string().optional(),
      termoAssinado:         z.boolean().optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    try {
      const anamnese = await prisma.anamnese.update({
        where: { usuarioId: Number(userId) },
        data: result.data,
      })
      return anamnese
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Anamnese não encontrada.' })
      throw e
    }
  })

  // Records de um atleta — para admin visualizar
  app.get('/usuarios/:id/recordes', { preHandler: requireTreinador }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const usuario = await prisma.usuario.findFirst({
      where: { id: Number(id), ativo: true },
      select: { id: true, nome: true },
    })
    if (!usuario) return reply.status(404).send({ error: 'Usuário não encontrado.' })
    const recordes = await prisma.recorde.findMany({
      where: { usuarioId: Number(id) },
      orderBy: { data: 'desc' },
    })
    return {
      nome: usuario.nome,
      recordes: recordes.map(r => ({
        id: r.id, exercicio: r.exercicio, carga: r.carga,
        data: r.data.toISOString().slice(0, 10),
      })),
    }
  })

  // ── Turmas CRUD ───────────────────────────────────────────────────────────────

  app.get('/turmas', { preHandler: requireTreinador }, async () => {
    return prisma.turma.findMany({
      orderBy: { codigo: 'asc' },
      include: {
        ambiente: true,
        treinador: { select: { id: true, nome: true } },
      },
    })
  })

  app.post('/turmas', { preHandler: requireAdmin }, async (request, reply) => {
    const schema = z.object({
      codigo:      z.string().min(1),
      horario:     z.string().min(1),
      dias:        z.array(z.string()),
      tipo:        z.string().default('regular'),
      descricao:   z.string().optional(),
      faixaIdade:  z.string().optional(),
      capacidade:  z.number().int().positive().default(6),
      ambienteId:  z.number().int().positive().nullable().optional(),
      treinadorId: z.number().int().positive().nullable().optional(),
      status:      z.enum(['PROPOSTA', 'PENDENTE_APROVACAO', 'ATIVA', 'INATIVA']).default('ATIVA'),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    if (result.data.ambienteId) {
      const amb = await prisma.ambiente.findUnique({ where: { id: result.data.ambienteId } })
      if (amb && result.data.capacidade > amb.capacidade) {
        return reply.status(400).send({ error: `Capacidade da turma (${result.data.capacidade}) excede a do ambiente (${amb.capacidade}).` })
      }
    }

    try {
      const turma = await prisma.turma.create({
        data: result.data,
        include: {
          ambiente: true,
          treinador: { select: { id: true, nome: true } },
        },
      })
      return reply.status(201).send(turma)
    } catch (e: any) {
      if (e.code === 'P2002') return reply.status(409).send({ error: 'Código de turma já em uso.' })
      throw e
    }
  })

  app.patch('/turmas/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      horario:     z.string().optional(),
      dias:        z.array(z.string()).optional(),
      tipo:        z.string().optional(),
      descricao:   z.string().optional(),
      faixaIdade:  z.string().optional(),
      capacidade:  z.number().int().positive().optional(),
      ambienteId:  z.number().int().positive().nullable().optional(),
      treinadorId: z.number().int().positive().nullable().optional(),
      status:      z.enum(['PROPOSTA', 'PENDENTE_APROVACAO', 'ATIVA', 'INATIVA']).optional(),
      ativa:       z.boolean().optional(), // aceito mas ignorado (backward-compat)
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const { ativa: _ignored, ...data } = result.data

    if (data.ambienteId && data.capacidade) {
      const amb = await prisma.ambiente.findUnique({ where: { id: data.ambienteId } })
      if (amb && data.capacidade > amb.capacidade) {
        return reply.status(400).send({ error: `Capacidade da turma (${data.capacidade}) excede a do ambiente (${amb.capacidade}).` })
      }
    }

    try {
      return prisma.turma.update({
        where: { id: Number(id) },
        data,
        include: {
          ambiente: true,
          treinador: { select: { id: true, nome: true } },
        },
      })
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Turma não encontrada.' })
      throw e
    }
  })

  // Aprovar / rejeitar turma criada por treinador
  app.patch('/turmas/:id/status', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      status: z.enum(['PROPOSTA', 'PENDENTE_APROVACAO', 'ATIVA', 'INATIVA']),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    try {
      return prisma.turma.update({
        where: { id: Number(id) },
        data: { status: result.data.status },
        include: {
          ambiente: true,
          treinador: { select: { id: true, nome: true } },
        },
      })
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Turma não encontrada.' })
      throw e
    }
  })

  app.delete('/turmas/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.turma.delete({ where: { id: Number(id) } })
      return reply.status(204).send()
    } catch (e: any) {
      if (e.code === 'P2025') return reply.status(404).send({ error: 'Turma não encontrada.' })
      if (e.code === 'P2003') return reply.status(409).send({ error: 'Turma possui check-ins registrados.' })
      throw e
    }
  })

  // ── Atletas de uma turma ──────────────────────────────────────────────────────

  app.get('/turmas/:id/atletas', { preHandler: requireTreinador }, async (request) => {
    const { id } = request.params as { id: string }
    const registros = await prisma.turmaAtleta.findMany({
      where: { turmaId: Number(id) },
      include: { atleta: { select: { id: true, nome: true, email: true } } },
      orderBy: { criadoEm: 'asc' },
    })
    return registros.map(r => ({ ...r.atleta, vinculadoEm: r.criadoEm }))
  })

  app.post('/turmas/:id/atletas', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({ atletaId: z.number().int().positive() })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    if (!await assertMatriculaAtiva(result.data.atletaId, reply)) return
    try {
      await prisma.turmaAtleta.create({
        data: { turmaId: Number(id), atletaId: result.data.atletaId },
      })
      return reply.status(201).send({ ok: true })
    } catch (e: any) {
      if (e.code === 'P2002') return reply.status(409).send({ error: 'Atleta já vinculado a esta turma.' })
      throw e
    }
  })

  app.delete('/turmas/:id/atletas/:atletaId', { preHandler: requireAdmin }, async (request, reply) => {
    const { id, atletaId } = request.params as { id: string; atletaId: string }
    await prisma.turmaAtleta.deleteMany({
      where: { turmaId: Number(id), atletaId: Number(atletaId) },
    })
    return reply.status(204).send()
  })

  // ── Modalidades de um treinador ───────────────────────────────────────────────

  app.get('/treinadores/:id/modalidades', { preHandler: requireTreinador }, async (request) => {
    const { id } = request.params as { id: string }
    const registros = await prisma.treinadorModalidade.findMany({
      where: { treinadorId: Number(id) },
      include: { modalidade: true },
    })
    return registros.map(r => r.modalidade)
  })

  app.post('/treinadores/:id/modalidades', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({ modalidadeId: z.number().int().positive() })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    try {
      await prisma.treinadorModalidade.create({
        data: { treinadorId: Number(id), modalidadeId: result.data.modalidadeId },
      })
      return reply.status(201).send({ ok: true })
    } catch (e: any) {
      if (e.code === 'P2002') return reply.status(409).send({ error: 'Modalidade já associada a este treinador.' })
      throw e
    }
  })

  app.delete('/treinadores/:id/modalidades/:modalidadeId', { preHandler: requireAdmin }, async (request, reply) => {
    const { id, modalidadeId } = request.params as { id: string; modalidadeId: string }
    await prisma.treinadorModalidade.deleteMany({
      where: { treinadorId: Number(id), modalidadeId: Number(modalidadeId) },
    })
    return reply.status(204).send()
  })
}
