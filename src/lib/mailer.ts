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

async function buildTransport() {
  const config = await prisma.configuracao.findFirst()
  if (!config) return null

  const fromNome = config.smtpFromNome || 'Gorila Rise'

  // Gmail OAuth2 tem prioridade sobre SMTP
  if (config.gmailUser && config.gmailClientId && config.gmailClientSecret && config.gmailRefreshToken) {
    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: config.gmailUser,
        clientId: config.gmailClientId,
        clientSecret: config.gmailClientSecret,
        refreshToken: config.gmailRefreshToken,
      },
    } as any)
    return {
      transport,
      from: `"${fromNome}" <${config.gmailUser}>`,
      config,
    }
  }

  // Fallback: SMTP convencional
  if (!config.smtpHost || !config.smtpUser || !config.smtpSenha) return null
  const transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.smtpUser, pass: config.smtpSenha },
    tls: config.smtpTLS ? undefined : { rejectUnauthorized: false },
  })
  return {
    transport,
    from: `"${fromNome}" <${config.smtpFromEmail || config.smtpUser}>`,
    config,
  }
}

export async function sendEmail(opts: SendEmailOpts): Promise<void> {
  try {
    const t = await buildTransport()
    if (!t) return
    if (!t.config[opts.toggle]) return
    await t.transport.sendMail({ from: t.from, to: opts.to, subject: opts.subject, html: opts.html })
  } catch (err) {
    console.error('[Mailer] Erro ao enviar email:', err)
  }
}

export async function sendEmailDirect(opts: { to: string; subject: string; html: string }): Promise<void> {
  try {
    const t = await buildTransport()
    if (!t) return
    await t.transport.sendMail({ from: t.from, to: opts.to, subject: opts.subject, html: opts.html })
  } catch (err) {
    console.error('[Mailer] Erro ao enviar email direto:', err)
  }
}
