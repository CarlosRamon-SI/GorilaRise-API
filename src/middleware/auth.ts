import { FastifyRequest, FastifyReply } from 'fastify'

type JwtPayload = {
  sub: number
  role: 'ATLETA' | 'TREINADOR' | 'ADMIN' | 'SOCIO_TORCEDOR'
  funcao?: 'PROFESSOR' | 'NUTRICIONISTA' | 'FISIOTERAPEUTA'
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    reply.status(401).send({ error: 'Não autorizado' })
  }
}

export async function requireTreinador(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
    const { role } = request.user as JwtPayload
    if (!['TREINADOR', 'ADMIN'].includes(role)) {
      reply.status(403).send({ error: 'Acesso negado' })
    }
  } catch {
    reply.status(401).send({ error: 'Não autorizado' })
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
    const { role } = request.user as JwtPayload
    if (role !== 'ADMIN') {
      reply.status(403).send({ error: 'Acesso negado' })
    }
  } catch {
    reply.status(401).send({ error: 'Não autorizado' })
  }
}
