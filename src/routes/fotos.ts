import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireTreinador, assertMatriculaAtiva } from '../middleware/auth.js'

const MIN_DIAS_ENTRE_FOTOS = 7

export async function fotosRoutes(app: FastifyInstance) {
  app.get('/fotos-progresso', { preHandler: requireAuth }, async (request) => {
    const { sub } = request.user as { sub: number }
    return prisma.fotoProgresso.findMany({
      where: { usuarioId: sub },
      orderBy: { criadoEm: 'asc' },
    })
  })

  // Admin/treinador: ver fotos de um atleta específico
  app.get('/fotos-progresso/:userId', { preHandler: requireTreinador }, async (request) => {
    const { userId } = request.params as { userId: string }
    return prisma.fotoProgresso.findMany({
      where: { usuarioId: Number(userId) },
      orderBy: { criadoEm: 'asc' },
    })
  })

  // Atleta: registra um novo progresso. Sempre permitido (respeitado só o intervalo mínimo),
  // independente da configuração do clube — essa configuração hoje controla apenas a exclusão.
  app.post('/fotos-progresso', { preHandler: requireAuth }, async (request, reply) => {
    const { sub } = request.user as { sub: number }
    if (!await assertMatriculaAtiva(sub, reply)) return

    const schema = z.object({ url: z.string().min(1) })
    const result = schema.safeParse(request.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const ultima = await prisma.fotoProgresso.findFirst({
      where: { usuarioId: sub },
      orderBy: { criadoEm: 'desc' },
    })
    if (ultima) {
      const proximoPermitido = new Date(ultima.criadoEm)
      proximoPermitido.setDate(proximoPermitido.getDate() + MIN_DIAS_ENTRE_FOTOS)
      if (proximoPermitido > new Date()) {
        return reply.status(403).send({
          error: `Aguarde pelo menos ${MIN_DIAS_ENTRE_FOTOS} dias entre registros de progresso.`,
          proximoRegistroEm: proximoPermitido,
        })
      }
    }

    const foto = await prisma.fotoProgresso.create({
      data: { usuarioId: sub, url: result.data.url, tipo: 'PROGRESSO' },
    })
    return reply.status(201).send(foto)
  })

  // Exclui uma foto de progresso.
  // - Atleta (dono): só se o clube permitir (Configuracao.permitirAlteracaoFotos).
  // - Treinador/Admin: sempre pode, mesmo com a configuração desativada — e o atleta
  //   é notificado da remoção (para os casos em que o próprio atleta enviou uma foto
  //   errada e pediu ao treinador para removê-la).
  app.delete('/fotos-progresso/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { sub, role } = request.user as { sub: number; role: string }
    const { id } = request.params as { id: string }

    const foto = await prisma.fotoProgresso.findUnique({ where: { id: Number(id) } })
    if (!foto) return reply.status(404).send({ error: 'Foto não encontrada.' })

    const isTreinador = role === 'TREINADOR' || role === 'ADMIN'
    const isDono = foto.usuarioId === sub
    if (!isDono && !isTreinador) return reply.status(404).send({ error: 'Foto não encontrada.' })

    if (isDono && !isTreinador) {
      const config = await prisma.configuracao.findFirst()
      if (config && !config.permitirAlteracaoFotos) {
        return reply.status(403).send({ error: 'A exclusão de fotos de progresso está desativada pelo seu clube. Peça ao seu treinador para remover.' })
      }
    }

    await prisma.fotoProgresso.delete({ where: { id: foto.id } })

    if (isTreinador && !isDono) {
      try {
        await prisma.notificacao.create({
          data: {
            titulo: 'Foto de progresso removida',
            corpo: `Seu treinador removeu uma foto do seu histórico de progresso (enviada em ${foto.criadoEm.toLocaleDateString('pt-BR')}).`,
            tipo: 'AVISO',
            destinatarioId: foto.usuarioId,
          },
        })
      } catch { /* não bloqueia */ }
    }

    return reply.status(204).send()
  })
}
