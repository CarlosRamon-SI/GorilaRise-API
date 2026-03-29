import { FastifyRequest, FastifyReply } from 'fastify'

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    reply.status(401).send({ error: 'Não autorizado' })
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
    const payload = request.user as { role: string }
    if (payload.role !== 'ADMIN') {
      reply.status(403).send({ error: 'Acesso negado' })
    }
  } catch {
    reply.status(401).send({ error: 'Não autorizado' })
  }
}
