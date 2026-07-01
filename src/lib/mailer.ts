import nodemailer from 'nodemailer'
import { prisma } from './prisma.js'

export type EmailToggle =
  | 'emailBoasVindas'
  | 'emailUsuarioAtivado'
  | 'emailMatriculaAtivada'
  | 'emailMatriculaCancelada'
  | 'emailPagamentoConfirmado'
  | 'emailPlanoVencendo'
  | 'emailPlanoVencido'

export interface SendEmailOpts {
  to: string
  subject: string
  html: string
  toggle: EmailToggle
}

export async function sendEmail(opts: SendEmailOpts): Promise<void> {
  try {
    const config = await prisma.configuracao.findFirst()
    if (!config) return

    // Verifica se o tipo de email está habilitado
    if (!config[opts.toggle]) return

    // Requer SMTP configurado
    if (!config.smtpHost || !config.smtpUser || !config.smtpSenha) return

    const transport = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: {
        user: config.smtpUser,
        pass: config.smtpSenha,
      },
      tls: config.smtpTLS ? undefined : { rejectUnauthorized: false },
    })

    const from = config.smtpFromEmail || config.smtpUser
    const fromNome = config.smtpFromNome || 'Gorila Rise'

    await transport.sendMail({
      from: `"${fromNome}" <${from}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    })
  } catch (err) {
    // Nunca bloqueia o fluxo principal
    console.error('[Mailer] Erro ao enviar email:', err)
  }
}
