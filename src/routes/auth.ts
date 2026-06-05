import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma.js'

const cadastroSchema = z.object({
  nome: z.string().min(3),
  email: z.string().email(),
  cpf: z.string().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/),
  telefone: z.string().min(10),
  nascimento: z.string(),
  endereco: z.string().min(5),
  cidade: z.string().min(2),
  cep: z.string().regex(/^\d{5}-\d{3}$/),
  senha: z.string().min(8),
  modalidadeId: z.number().int().positive(),
  planoId: z.number().int().positive(),
})

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string(),
})

export async function authRoutes(app: FastifyInstance) {
  // Verificação de disponibilidade — público
  app.get('/check', async (request, reply) => {
    const { cpf, email } = request.query as { cpf?: string; email?: string }
    if (!cpf && !email) return reply.status(400).send({ error: 'Informe cpf ou email' })
    const exists = await prisma.usuario.findFirst({
      where: { OR: [...(cpf ? [{ cpf }] : []), ...(email ? [{ email }] : [])] },
      select: { id: true },
    })
    return { disponivel: !exists }
  })
  app.post('/cadastro', async (request, reply) => {
    const result = cadastroSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Dados inválidos', details: result.error.flatten() })
    }

    const data = result.data

    const existe = await prisma.usuario.findFirst({
      where: { OR: [{ email: data.email }, { cpf: data.cpf }] },
    })
    if (existe) {
      return reply.status(409).send({ error: 'E-mail ou CPF já cadastrado' })
    }

    const hash = await bcrypt.hash(data.senha, 10)

    const usuario = await prisma.usuario.create({
      data: {
        nome: data.nome,
        email: data.email,
        cpf: data.cpf,
        telefone: data.telefone,
        nascimento: new Date(data.nascimento),
        endereco: data.endereco,
        cidade: data.cidade,
        cep: data.cep,
        senha: hash,
        matriculas: {
          create: {
            modalidadeId: data.modalidadeId,
            planoId: data.planoId,
          },
        },
      },
      select: { id: true, nome: true, email: true, role: true },
    })

    const token = app.jwt.sign({ sub: usuario.id, role: usuario.role }, { expiresIn: '7d' })

    return reply.status(201).send({ usuario, token })
  })

  app.post('/login', async (request, reply) => {
    const result = loginSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Dados inválidos' })
    }

    const { email, senha } = result.data

    const usuario = await prisma.usuario.findUnique({ where: { email } })
    if (!usuario || !await bcrypt.compare(senha, usuario.senha)) {
      return reply.status(401).send({ error: 'Credenciais inválidas' })
    }

    if (!usuario.ativo) {
      return reply.status(403).send({ error: 'Conta inativa' })
    }

    const token = app.jwt.sign({ sub: usuario.id, role: usuario.role }, { expiresIn: '7d' })

    return { usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role }, token }
  })

  app.get('/me', { preHandler: async (req, rep) => { try { await req.jwtVerify() } catch { rep.status(401).send({ error: 'Não autorizado' }) } } }, async (request) => {
    const payload = request.user as { sub: number }
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, nome: true, email: true, role: true, criadoEm: true,
        matriculas: {
          where: { status: 'ATIVA' },
          include: { modalidade: true, plano: true },
        },
      },
    })
    return usuario
  })
}
