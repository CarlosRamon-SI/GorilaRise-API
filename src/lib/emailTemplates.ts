const BASE_URL = process.env.BASE_URL ?? 'https://evo.adtecnologia.com.br'

function layout(titulo: string, corpo: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background:#111;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1718;border-radius:12px;overflow:hidden;border:1px solid #2a2728;">

          <!-- Header -->
          <tr>
            <td style="background:#231f20;padding:28px 32px;text-align:center;border-bottom:3px solid #f0c419;">
              <span style="font-size:26px;font-weight:900;color:#f0c419;letter-spacing:1px;">GORILA RISE</span>
            </td>
          </tr>

          <!-- Conteúdo -->
          <tr>
            <td style="padding:32px;">
              ${corpo}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#111;padding:20px 32px;text-align:center;border-top:1px solid #2a2728;">
              <p style="margin:0;font-size:12px;color:#555;">
                Gorila Rise — Clube de Alto Desempenho<br>
                <a href="${BASE_URL}" style="color:#f0c419;text-decoration:none;">${BASE_URL}</a>
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#444;">
                Este email foi gerado automaticamente. Não responda a esta mensagem.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function h1(texto: string) {
  return `<h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#fff;">${texto}</h1>`
}

function p(texto: string) {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#ccc;">${texto}</p>`
}

function badge(texto: string) {
  return `<div style="display:inline-block;background:#f0c419;color:#231f20;font-weight:700;font-size:13px;padding:6px 16px;border-radius:20px;margin-bottom:20px;">${texto}</div>`
}

function infoBox(linhas: { label: string; valor: string }[]) {
  const rows = linhas.map(l =>
    `<tr>
      <td style="padding:8px 12px;font-size:13px;color:#999;border-bottom:1px solid #2a2728;">${l.label}</td>
      <td style="padding:8px 12px;font-size:13px;color:#fff;font-weight:600;border-bottom:1px solid #2a2728;">${l.valor}</td>
    </tr>`
  ).join('')
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:8px;overflow:hidden;margin-bottom:24px;">${rows}</table>`
}

function btn(texto: string, href: string) {
  return `<p style="text-align:center;margin:24px 0 0;">
    <a href="${href}" style="display:inline-block;background:#f0c419;color:#231f20;font-weight:700;font-size:14px;padding:12px 32px;border-radius:8px;text-decoration:none;">${texto}</a>
  </p>`
}

// ─── Templates ───────────────────────────────────────────────────────────────

export function tplBoasVindas(nome: string): { subject: string; html: string } {
  return {
    subject: 'Bem-vindo ao Gorila Rise! 🦍',
    html: layout('Bem-vindo!', `
      ${badge('CADASTRO REALIZADO')}
      ${h1(`Bem-vindo, ${nome}!`)}
      ${p('Seu cadastro foi recebido com sucesso. Nossa equipe irá analisar seus dados e ativar sua conta em breve.')}
      ${p('Assim que sua matrícula for ativada, você receberá um novo email de confirmação.')}
      ${btn('Acessar o Portal', BASE_URL + '/login')}
    `),
  }
}

export function tplUsuarioAtivado(nome: string): { subject: string; html: string } {
  return {
    subject: 'Sua conta foi ativada — Gorila Rise',
    html: layout('Conta ativada', `
      ${badge('CONTA ATIVA')}
      ${h1(`Tudo pronto, ${nome}!`)}
      ${p('Sua conta no Gorila Rise foi ativada pela nossa equipe. Agora você já pode fazer login e acessar o portal do atleta.')}
      ${btn('Fazer login', BASE_URL + '/login')}
    `),
  }
}

export function tplMatriculaAtivada(opts: {
  nome: string
  modalidade: string
  plano: string
  valor: string
}): { subject: string; html: string } {
  return {
    subject: 'Matrícula ativada — Gorila Rise',
    html: layout('Matrícula ativada', `
      ${badge('MATRÍCULA ATIVA')}
      ${h1(`Sua matrícula está ativa!`)}
      ${p(`Olá, ${opts.nome}. Sua matrícula no Gorila Rise foi ativada com sucesso. Veja os detalhes abaixo:`)}
      ${infoBox([
        { label: 'Modalidade', valor: opts.modalidade },
        { label: 'Plano',      valor: opts.plano },
        { label: 'Valor',      valor: `R$ ${opts.valor}` },
      ])}
      ${p('Bem-vindo à família Gorila Rise! Nos vemos na quadra.')}
      ${btn('Acessar meu painel', BASE_URL + '/painel')}
    `),
  }
}

export function tplMatriculaCancelada(opts: {
  nome: string
  modalidade: string
}): { subject: string; html: string } {
  return {
    subject: 'Matrícula cancelada — Gorila Rise',
    html: layout('Matrícula cancelada', `
      ${badge('MATRÍCULA CANCELADA')}
      ${h1('Sua matrícula foi cancelada')}
      ${p(`Olá, ${opts.nome}. Informamos que sua matrícula na modalidade <strong>${opts.modalidade}</strong> foi cancelada.`)}
      ${p('Se isso foi um engano ou você deseja reativar sua matrícula, entre em contato com nossa equipe.')}
      ${btn('Fale conosco', BASE_URL)}
    `),
  }
}

export function tplPagamentoConfirmado(opts: {
  nome: string
  plano: string
  valor: string
  data: string
}): { subject: string; html: string } {
  return {
    subject: 'Pagamento confirmado — Gorila Rise',
    html: layout('Pagamento confirmado', `
      ${badge('PAGAMENTO CONFIRMADO')}
      ${h1('Pagamento recebido!')}
      ${p(`Olá, ${opts.nome}. Seu pagamento foi registrado com sucesso. Confira os detalhes:`)}
      ${infoBox([
        { label: 'Plano',              valor: opts.plano },
        { label: 'Valor',              valor: `R$ ${opts.valor}` },
        { label: 'Data de pagamento',  valor: opts.data },
      ])}
      ${p('Obrigado! Continuamos treinando juntos.')}
      ${btn('Acessar meu painel', BASE_URL + '/painel')}
    `),
  }
}

export function tplPlanoVencendo(opts: {
  nome: string
  plano: string
  diasRestantes: number
  dataVencimento: string
}): { subject: string; html: string } {
  return {
    subject: `Seu plano vence em ${opts.diasRestantes} dia(s) — Gorila Rise`,
    html: layout('Plano vencendo', `
      ${badge('AVISO DE VENCIMENTO')}
      ${h1('Seu plano está próximo do vencimento')}
      ${p(`Olá, ${opts.nome}. Seu plano <strong>${opts.plano}</strong> vence em <strong>${opts.diasRestantes} dia(s)</strong>, no dia ${opts.dataVencimento}.`)}
      ${p('Renove agora para não perder o acesso às atividades. Entre em contato com nossa equipe para mais informações.')}
      ${btn('Fale com a equipe', BASE_URL)}
    `),
  }
}

export function tplPlanoVencido(opts: {
  nome: string
  plano: string
  dataVencimento: string
}): { subject: string; html: string } {
  return {
    subject: 'Seu plano venceu — Gorila Rise',
    html: layout('Plano vencido', `
      ${badge('PLANO VENCIDO')}
      ${h1('Seu plano está vencido')}
      ${p(`Olá, ${opts.nome}. Informamos que seu plano <strong>${opts.plano}</strong> venceu em ${opts.dataVencimento}.`)}
      ${p('Para continuar treinando, entre em contato com nossa equipe e renove sua matrícula.')}
      ${btn('Renovar agora', BASE_URL)}
    `),
  }
}

export function tplRecuperacaoSenha(opts: { nome: string; link: string }): { subject: string; html: string } {
  return {
    subject: 'Recuperação de senha — Gorila Rise',
    html: layout('Recuperação de senha', `
      ${badge('SEGURANÇA')}
      ${h1('Redefinição de senha')}
      ${p(`Olá, ${opts.nome}. Recebemos uma solicitação para redefinir a senha da sua conta.`)}
      ${p('Clique no botão abaixo para criar uma nova senha. Este link é válido por <strong>1 hora</strong>.')}
      ${btn('Redefinir minha senha', opts.link)}
      ${p('Se você não solicitou a redefinição de senha, ignore este e-mail — sua conta permanece segura.')}
    `),
  }
}
