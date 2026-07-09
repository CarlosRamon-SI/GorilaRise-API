import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma.js'
import { sendEmail, sendEmailDirect } from '../lib/mailer.js'
import { tplBoasVindas, tplRecuperacaoSenha } from '../lib/emailTemplates.js'
import { randomBytes } from 'crypto'

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
  planoId: z.number().int().positive().optional(),
  captchaToken: z.string().min(1),
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

    // Verificar CAPTCHA
    const captchaSecret = process.env.HCAPTCHA_SECRET ?? ''
    const captchaRes = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(captchaSecret)}&response=${encodeURIComponent(data.captchaToken)}`,
    })
    const captchaJson = await captchaRes.json() as { success: boolean }
    if (!captchaJson.success) {
      return reply.status(400).send({ error: 'CAPTCHA inválido. Tente novamente.' })
    }

    const existe = await prisma.usuario.findFirst({
      where: { OR: [{ email: data.email }, { cpf: data.cpf }] },
    })
    if (existe) {
      return reply.status(409).send({ error: 'E-mail ou CPF já cadastrado' })
    }

    const hash = await bcrypt.hash(data.senha, 10)

    await prisma.usuario.create({
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
        ativo: false,
      },
      select: { id: true },
    })

    const tpl = tplBoasVindas(data.nome)
    await sendEmail({ to: data.email, toggle: 'emailBoasVindas', ...tpl })

    return reply.status(201).send({ mensagem: 'Cadastro realizado. Aguarde a ativação pela equipe.' })
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

    const token = app.jwt.sign({ sub: usuario.id, role: usuario.role, funcao: usuario.funcao ?? undefined }, { expiresIn: '7d' })

    return { usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role, funcao: usuario.funcao ?? undefined }, token }
  })

  app.get('/me', { preHandler: async (req, rep) => { try { await req.jwtVerify() } catch { rep.status(401).send({ error: 'Não autorizado' }) } } }, async (request) => {
    const payload = request.user as { sub: number }
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, nome: true, email: true, role: true, funcao: true, criadoEm: true, fotoPerfil: true,
        matriculas: {
          where: { status: 'ATIVA' },
          include: { modalidade: true, plano: true },
        },
      },
    })
    return usuario
  })

  const jwtPreHandler = async (req: any, rep: any) => {
    try { await req.jwtVerify() } catch { rep.status(401).send({ error: 'Não autorizado' }) }
  }

  app.post('/recuperar-senha', async (request, reply) => {
    const { email } = request.body as { email?: string }
    if (!email) return reply.status(400).send({ error: 'Informe o e-mail.' })

    const usuario = await prisma.usuario.findUnique({ where: { email } })
    // Resposta sempre 200 para não revelar se o email existe
    if (!usuario || !usuario.ativo) return { mensagem: 'Se o e-mail estiver cadastrado, você receberá as instruções em breve.' }

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

    await prisma.tokenRecuperacaoSenha.create({ data: { usuarioId: usuario.id, token, expiresAt } })

    const BASE_URL = process.env.BASE_URL ?? 'https://evo.adtecnologia.com.br'
    const link = `${BASE_URL}/redefinir-senha?token=${token}`
    const tpl = tplRecuperacaoSenha({ nome: usuario.nome.split(' ')[0], link })
    await sendEmailDirect({ to: usuario.email, ...tpl })

    return { mensagem: 'Se o e-mail estiver cadastrado, você receberá as instruções em breve.' }
  })

  app.post('/redefinir-senha', async (request, reply) => {
    const schema = z.object({
      token: z.string().min(1),
      novaSenha: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.'),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.errors[0].message })

    const { token, novaSenha } = result.data

    const registro = await prisma.tokenRecuperacaoSenha.findUnique({ where: { token } })
    if (!registro || registro.usadoEm || registro.expiresAt < new Date()) {
      return reply.status(400).send({ error: 'Link inválido ou expirado. Solicite um novo.' })
    }

    const hash = await bcrypt.hash(novaSenha, 10)
    await prisma.$transaction([
      prisma.usuario.update({ where: { id: registro.usuarioId }, data: { senha: hash } }),
      prisma.tokenRecuperacaoSenha.update({ where: { token }, data: { usadoEm: new Date() } }),
    ])

    return { mensagem: 'Senha redefinida com sucesso.' }
  })

  app.patch('/me', { preHandler: jwtPreHandler }, async (request, reply) => {
    const payload = request.user as { sub: number }
    const schema = z.object({ fotoPerfil: z.string().url().optional() })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const updated = await prisma.usuario.update({
      where: { id: payload.sub },
      data: result.data,
      select: { id: true, nome: true, email: true, role: true, fotoPerfil: true },
    })
    return updated
  })
}
