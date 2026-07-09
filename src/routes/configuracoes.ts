import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAdmin } from '../middleware/auth.js'
import { sendEmailDirect } from '../lib/mailer.js'
import {
  tplBoasVindas,
  tplUsuarioAtivado,
  tplMatriculaAtivada,
  tplMatriculaCancelada,
  tplPagamentoConfirmado,
  tplPlanoVencendo,
  tplPlanoVencido,
} from '../lib/emailTemplates.js'

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
  permitirAlteracaoFotos: z.boolean().optional(),
  nomeSite:      z.string().optional(),
  descricaoSite: z.string().optional(),

  // Gmail OAuth2 — campos sensíveis: só atualiza se enviado não-vazio
  gmailUser:         z.string().optional(),
  gmailClientId:     z.string().optional(),
  gmailClientSecret: z.string().optional(),
  gmailRefreshToken: z.string().optional(),
})

async function getOrCreate() {
  const existing = await prisma.configuracao.findFirst()
  if (existing) return existing
  return prisma.configuracao.create({ data: {} })
}

export async function configuracoesRoutes(app: FastifyInstance) {
  // GET público — usado pelo footer e por outras telas públicas ao carregar.
  // Retorna só campos não-sensíveis; credenciais de SMTP/Gmail nunca saem daqui.
  app.get('/configuracoes', async () => {
    const c = await getOrCreate()
    return {
      logradouro: c.logradouro,
      numero: c.numero,
      complemento: c.complemento,
      bairro: c.bairro,
      cidade: c.cidade,
      estado: c.estado,
      cep: c.cep,
      telefone: c.telefone,
      whatsapp: c.whatsapp,
      email: c.email,
      horarios: c.horarios,
      instagram: c.instagram,
      facebook: c.facebook,
      youtube: c.youtube,
      tiktok: c.tiktok,
      exibirCategoriasPatrocinadores: c.exibirCategoriasPatrocinadores,
      permitirAlteracaoFotos: c.permitirAlteracaoFotos,
      nomeSite: c.nomeSite,
      descricaoSite: c.descricaoSite,
    }
  })

  // GET admin — mesmos dados do GET público + todos os campos sensíveis (SMTP/Gmail), só para Administrador
  app.get('/admin/configuracoes', { preHandler: requireAdmin }, async () => {
    return getOrCreate()
  })

  // PATCH admin — salva as configurações
  app.patch('/admin/configuracoes', { preHandler: requireAdmin }, async (request, reply) => {
    const result = configSchema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const data = { ...result.data } as Record<string, unknown>
    // Campos sensíveis: só atualiza se enviado com valor não-vazio
    for (const field of ['smtpSenha', 'gmailClientSecret', 'gmailRefreshToken'] as const) {
      if (!data[field]) delete data[field]
    }

    const current = await getOrCreate()
    return prisma.configuracao.update({
      where: { id: current.id },
      data,
    })
  })

  // GET admin — retorna o HTML de um modelo de email com dados fictícios, para pré-visualização
  app.get('/admin/configuracoes/email-preview/:tipo', { preHandler: requireAdmin }, async (request, reply) => {
    const { tipo } = request.params as { tipo: string }

    const NOME = 'João da Silva'
    const geradores: Record<string, () => { subject: string; html: string }> = {
      emailBoasVindas:          () => tplBoasVindas(NOME),
      emailUsuarioAtivado:      () => tplUsuarioAtivado(NOME),
      emailMatriculaAtivada:    () => tplMatriculaAtivada({ nome: NOME, modalidade: 'Jiu-Jitsu', plano: 'Plano Mensal', valor: '150,00' }),
      emailMatriculaCancelada: () => tplMatriculaCancelada({ nome: NOME, modalidade: 'Jiu-Jitsu' }),
      emailPagamentoConfirmado: () => tplPagamentoConfirmado({ nome: NOME, plano: 'Plano Mensal', valor: '150,00', data: '08/07/2026' }),
      emailPlanoVencendo:       () => tplPlanoVencendo({ nome: NOME, plano: 'Plano Mensal', diasRestantes: 5, dataVencimento: '13/07/2026' }),
      emailPlanoVencido:        () => tplPlanoVencido({ nome: NOME, plano: 'Plano Mensal', dataVencimento: '01/07/2026' }),
    }

    const gerar = geradores[tipo]
    if (!gerar) return reply.status(404).send({ error: 'Modelo de email não encontrado.' })

    return gerar()
  })

  // POST admin — envia email de teste usando o transporte ativo (Gmail OAuth2 ou SMTP)
  app.post('/admin/configuracoes/email-teste', { preHandler: requireAdmin }, async (request, reply) => {
    const schema = z.object({ destinatario: z.string().email() })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: 'E-mail de destino inválido.' })

    try {
      await sendEmailDirect({
        to: result.data.destinatario,
        subject: 'Teste de E-mail — Gorila Rise',
        html: `
          <div style="font-family:sans-serif;background:#111;color:#fff;padding:32px;border-radius:12px;">
            <h2 style="color:#f0c419;margin:0 0 16px;">GORILA RISE</h2>
            <p style="color:#ccc;">Configuração de e-mail funcionando corretamente.</p>
          </div>
        `,
      })
      return { ok: true, mensagem: `Email de teste enviado para ${result.data.destinatario}` }
    } catch (err: any) {
      return reply.status(500).send({ error: `Falha ao enviar: ${err.message ?? 'Erro desconhecido'}` })
    }
  })
}
