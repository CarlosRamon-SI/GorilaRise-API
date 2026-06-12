import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma.js'
import { requireAdmin, requireTreinador } from '../middleware/auth.js'

export async function adminRoutes(app: FastifyInstance) {
  // Stats
  app.get('/stats', { preHandler: requireTreinador }, async () => {
    const [usuarios, matriculas, modalidades, planos, leads, projetos, documentos, funcionarios, patrocinadores] = await Promise.all([
      prisma.usuario.count({ where: { ativo: true } }),
      prisma.matricula.count({ where: { status: 'ATIVA' } }),
      prisma.modalidade.count({ where: { ativa: true } }),
      prisma.plano.count({ where: { ativo: true } }),
      prisma.lead.count(),
      prisma.projetoSocial.count({ where: { ativo: true } }),
      prisma.documentoOficial.count({ where: { ativo: true } }),
      prisma.funcionario.count({ where: { ativo: true } }),
      prisma.patrocinador.count({ where: { ativo: true } }),
    ])
    return { usuarios, matriculas, modalidades, planos, leads, projetos, documentos, funcionarios, patrocinadores }
  })

  // Listar usuários
  app.get('/usuarios', { preHandler: requireTreinador }, async (request) => {
    const { role, ativo } = request.query as { role?: string; ativo?: string }
    return prisma.usuario.findMany({
      where: {
        ...(role ? { role: role as any } : {}),
        ...(ativo !== undefined ? { ativo: ativo === 'true' } : {}),
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
      return prisma.usuario.update({
        where: { id: Number(id) },
        data: result.data,
        select: { id: true, nome: true, email: true, cpf: true, telefone: true, cidade: true, role: true, funcao: true, ativo: true, criadoEm: true },
      })
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
        usuario: { select: { id: true, nome: true, email: true } },
        modalidade: true,
        plano: true,
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
      responsavelId: z.number().int().positive().nullable().optional(),
      status:        z.enum(['ATIVA', 'INATIVA', 'PENDENTE']).default('ATIVA'),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const matricula = await prisma.matricula.create({
      data: result.data,
      include: {
        usuario: { select: { id: true, nome: true, email: true } },
        modalidade: true,
        plano: true,
      },
    })
    return reply.status(201).send(matricula)
  })

  // Atualizar status de matrícula — só ADMIN
  app.patch('/matriculas/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      status:        z.enum(['ATIVA', 'INATIVA', 'PENDENTE']).optional(),
      responsavelId: z.number().int().positive().nullable().optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    try {
      return prisma.matricula.update({
        where: { id: Number(id) },
        data: result.data,
        include: {
          usuario: { select: { id: true, nome: true, email: true } },
          modalidade: true,
          plano: true,
        },
      })
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
    return prisma.turma.findMany({ orderBy: { codigo: 'asc' } })
  })

  app.post('/turmas', { preHandler: requireAdmin }, async (request, reply) => {
    const schema = z.object({
      codigo:     z.string().min(1),
      horario:    z.string().min(1),
      dias:       z.array(z.string()),
      tipo:       z.string().default('regular'),
      descricao:  z.string().optional(),
      faixaIdade: z.string().optional(),
      capacidade: z.number().int().positive().default(6),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    try {
      const turma = await prisma.turma.create({ data: result.data })
      return reply.status(201).send(turma)
    } catch (e: any) {
      if (e.code === 'P2002') return reply.status(409).send({ error: 'Código de turma já em uso.' })
      throw e
    }
  })

  app.patch('/turmas/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      horario:    z.string().optional(),
      dias:       z.array(z.string()).optional(),
      tipo:       z.string().optional(),
      descricao:  z.string().optional(),
      faixaIdade: z.string().optional(),
      capacidade: z.number().int().positive().optional(),
      ativa:      z.boolean().optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    try {
      return prisma.turma.update({ where: { id: Number(id) }, data: result.data })
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
}
