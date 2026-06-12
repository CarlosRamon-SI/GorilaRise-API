import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function run() {
  console.log('Migrando tabelas do Sócio Torcedor...')

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Evento (
      id        INT AUTO_INCREMENT PRIMARY KEY,
      titulo    VARCHAR(255) NOT NULL,
      descricao TEXT,
      data      DATETIME NOT NULL,
      local     VARCHAR(255),
      imagemUrl VARCHAR(500),
      ativo     TINYINT(1) NOT NULL DEFAULT 1,
      criadoEm  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  console.log('✓ Evento')

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Ingresso (
      id        INT AUTO_INCREMENT PRIMARY KEY,
      eventoId  INT NOT NULL,
      usuarioId INT NOT NULL,
      codigo    VARCHAR(36) NOT NULL UNIQUE DEFAULT (UUID()),
      criadoEm  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_evento_usuario (eventoId, usuarioId),
      CONSTRAINT fk_ingresso_evento  FOREIGN KEY (eventoId)  REFERENCES Evento(id)  ON DELETE CASCADE,
      CONSTRAINT fk_ingresso_usuario FOREIGN KEY (usuarioId) REFERENCES Usuario(id) ON DELETE CASCADE
    )
  `)
  console.log('✓ Ingresso')

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS PontoSocio (
      id        INT AUTO_INCREMENT PRIMARY KEY,
      usuarioId INT NOT NULL,
      pontos    INT NOT NULL DEFAULT 0,
      motivo    VARCHAR(255) NOT NULL,
      criadoEm  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_ponto_usuario FOREIGN KEY (usuarioId) REFERENCES Usuario(id) ON DELETE CASCADE
    )
  `)
  console.log('✓ PontoSocio')

  // Adicionar destinatarioRole na Notificacao (idempotente)
  const [cols] = await prisma.$queryRawUnsafe<any[]>(`
    SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Notificacao'
    AND COLUMN_NAME = 'destinatarioRole'
  `)
  if (Number(cols.cnt) === 0) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE Notificacao ADD COLUMN destinatarioRole VARCHAR(50) NULL
    `)
    console.log('✓ Notificacao.destinatarioRole')
  } else {
    console.log('✓ Notificacao.destinatarioRole (já existe)')
  }

  console.log('Migração concluída.')
  await prisma.$disconnect()
}

run().catch(e => { console.error(e); process.exit(1) })
