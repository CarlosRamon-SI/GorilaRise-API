import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import nodemailer from 'nodemailer'
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

  // SMTP
  smtpHost:      z.string().optional(),
  smtpPort:      z.number().int().optional(),
  smtpUser:      z.string().optional(),
  smtpSenha:     z.string().optional(),
  smtpFromNome:  z.string().optional(),
  smtpFromEmail: z.string().optional(),
  smtpTLS:       z.boolean().optional(),

  // Toggles de email
  emailBoasVindas:          z.boolean().optional(),
  emailUsuarioAtivado:      z.boolean().optional(),
  emailMatriculaAtivada:    z.boolean().optional(),
  emailMatriculaCancelada:  z.boolean().optional(),
  emailPagamentoConfirmado: z.boolean().optional(),
  emailPlanoVencendo:       z.boolean().optional(),
  emailPlanoVencido:        z.boolean().optional(),
  exibirCategoriasPatrocinadores: z.boolean().optional(),
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

  // POST admin — envia email de teste com as configurações atuais do banco
  app.post('/admin/configuracoes/email-teste', { preHandler: requireAdmin }, async (request, reply) => {
    const schema = z.object({ destinatario: z.string().email() })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: 'E-mail de destino inválido.' })

    const config = await getOrCreate()
    if (!config.smtpHost || !config.smtpUser || !config.smtpSenha) {
      return reply.status(422).send({ error: 'SMTP não configurado. Preencha e salve as configurações antes de testar.' })
    }

    try {
      const transport = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        auth: { user: config.smtpUser, pass: config.smtpSenha },
        tls: config.smtpTLS ? undefined : { rejectUnauthorized: false },
      })

      await transport.verify()

      const from = config.smtpFromEmail || config.smtpUser
      const fromNome = config.smtpFromNome || 'Gorila Rise'

      await transport.sendMail({
        from: `"${fromNome}" <${from}>`,
        to: result.data.destinatario,
        subject: 'Teste de E-mail — Gorila Rise',
        html: `
          <div style="font-family:sans-serif;background:#111;color:#fff;padding:32px;border-radius:12px;">
            <h2 style="color:#f0c419;margin:0 0 16px;">GORILA RISE</h2>
            <p style="color:#ccc;">Configuração SMTP funcionando corretamente.</p>
            <p style="color:#555;font-size:13px;">Servidor: ${config.smtpHost}:${config.smtpPort}</p>
          </div>
        `,
      })

      return { ok: true, mensagem: `Email de teste enviado para ${result.data.destinatario}` }
    } catch (err: any) {
      return reply.status(500).send({ error: `Falha ao enviar: ${err.message ?? 'Erro desconhecido'}` })
    }
  })
}
