/**
 * Migração: resolver dívidas técnicas de rastreabilidade
 *   - TreinoPrescrito: adicionar atletaId FK -> Usuario
 *   - WOD: adicionar autorId FK -> Usuario
 *   - Funcionario: adicionar usuarioId FK -> Usuario
 *
 * Executar uma vez: npx tsx prisma/migrate-debts.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function colExists(table: string, col: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
    SELECT COUNT(*) as count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
  `, table, col)
  return Number(rows[0].count) > 0
}

async function main() {
  console.log('Iniciando migração de dívidas técnicas...\n')

  // ── TreinoPrescrito.atletaId ───────────────────────────────────────────────
  if (await colExists('TreinoPrescrito', 'atletaId')) {
    console.log('· TreinoPrescrito.atletaId já existe')
  } else {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE TreinoPrescrito
      ADD COLUMN atletaId INT NULL,
      ADD CONSTRAINT fk_treino_atleta
        FOREIGN KEY (atletaId) REFERENCES Usuario(id) ON DELETE SET NULL
    `)
    console.log('✓ TreinoPrescrito.atletaId adicionado')
  }

  // ── WOD.autorId ────────────────────────────────────────────────────────────
  if (await colExists('WOD', 'autorId')) {
    console.log('· WOD.autorId já existe')
  } else {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE WOD
      ADD COLUMN autorId INT NULL,
      ADD CONSTRAINT fk_wod_autor
        FOREIGN KEY (autorId) REFERENCES Usuario(id) ON DELETE SET NULL
    `)
    console.log('✓ WOD.autorId adicionado')
  }

  // ── Funcionario.usuarioId ──────────────────────────────────────────────────
  if (await colExists('Funcionario', 'usuarioId')) {
    console.log('· Funcionario.usuarioId já existe')
  } else {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE Funcionario
      ADD COLUMN usuarioId INT NULL UNIQUE,
      ADD CONSTRAINT fk_funcionario_usuario
        FOREIGN KEY (usuarioId) REFERENCES Usuario(id) ON DELETE SET NULL
    `)
    console.log('✓ Funcionario.usuarioId adicionado')
  }

  console.log('\nMigração concluída.')
}

main()
  .catch(e => { console.error('Erro:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
