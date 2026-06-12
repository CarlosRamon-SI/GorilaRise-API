import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table, column,
  )
  return Number(rows[0]?.cnt) > 0
}

async function main() {
  console.log('→ migrate-gaps: iniciando...')

  // Matricula.responsavelId
  if (!await columnExists('Matricula', 'responsavelId')) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`Matricula\`
       ADD COLUMN \`responsavelId\` INT NULL,
       ADD CONSTRAINT \`fk_matricula_responsavel\`
         FOREIGN KEY (\`responsavelId\`) REFERENCES \`Usuario\`(\`id\`) ON DELETE SET NULL`
    )
    console.log('✓ Matricula.responsavelId adicionado')
  } else {
    console.log('– Matricula.responsavelId já existe')
  }

  // Premiacao.atletaId
  if (!await columnExists('Premiacao', 'atletaId')) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`Premiacao\`
       ADD COLUMN \`atletaId\` INT NULL,
       ADD CONSTRAINT \`fk_premiacao_atleta\`
         FOREIGN KEY (\`atletaId\`) REFERENCES \`Usuario\`(\`id\`) ON DELETE SET NULL`
    )
    console.log('✓ Premiacao.atletaId adicionado')
  } else {
    console.log('– Premiacao.atletaId já existe')
  }

  console.log('✓ migrate-gaps: concluído')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
