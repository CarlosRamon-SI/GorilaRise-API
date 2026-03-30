import { FastifyInstance } from 'fastify'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { randomUUID } from 'crypto'
import path from 'path'
import { requireAdmin } from '../middleware/auth.js'

const UPLOADS_DIR = path.resolve('uploads')
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

export async function uploadRoutes(app: FastifyInstance) {
  app.post('/', { preHandler: requireAdmin }, async (request, reply) => {
    const data = await request.file()

    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })
    if (!ALLOWED_TYPES.includes(data.mimetype)) {
      return reply.status(400).send({ error: 'Tipo não permitido. Use JPEG, PNG, WebP ou GIF.' })
    }

    const ext = path.extname(data.filename) || '.jpg'
    const filename = `${randomUUID()}${ext}`
    const dest = path.join(UPLOADS_DIR, filename)

    let size = 0
    data.file.on('data', (chunk: Buffer) => { size += chunk.length })

    await pipeline(data.file, createWriteStream(dest))

    if (size > MAX_SIZE) {
      const { unlink } = await import('fs/promises')
      await unlink(dest)
      return reply.status(400).send({ error: 'Arquivo muito grande. Máximo 5MB.' })
    }

    const url = `/uploads/${filename}`
    return { url }
  })
}
