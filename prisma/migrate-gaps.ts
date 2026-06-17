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

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table,
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

  // G5: Anamnese.sexo
  if (!await columnExists('Anamnese', 'sexo')) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`Anamnese\` ADD COLUMN \`sexo\` VARCHAR(20) NULL`
    )
    console.log('✓ Anamnese.sexo adicionado')
  } else {
    console.log('– Anamnese.sexo já existe')
  }

  // G6: Notificacao.destinatarioId
  if (!await columnExists('Notificacao', 'destinatarioId')) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`Notificacao\`
       ADD COLUMN \`destinatarioId\` INT NULL,
       ADD CONSTRAINT \`fk_notificacao_destinatario\`
         FOREIGN KEY (\`destinatarioId\`) REFERENCES \`Usuario\`(\`id\`) ON DELETE SET NULL`
    )
    console.log('✓ Notificacao.destinatarioId adicionado')
  } else {
    console.log('– Notificacao.destinatarioId já existe')
  }

  // G10: Usuario.fotoPerfil
  if (!await columnExists('Usuario', 'fotoPerfil')) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`Usuario\` ADD COLUMN \`fotoPerfil\` VARCHAR(512) NULL`
    )
    console.log('✓ Usuario.fotoPerfil adicionado')
  } else {
    console.log('– Usuario.fotoPerfil já existe')
  }

  // G1: Escalacao table
  if (!await tableExists('Escalacao')) {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE \`Escalacao\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`titulo\` VARCHAR(191) NOT NULL,
        \`descricao\` TEXT NULL,
        \`data\` DATE NOT NULL,
        \`treinadorId\` INT NOT NULL,
        \`criadoEm\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_escalacao_treinador\`
          FOREIGN KEY (\`treinadorId\`) REFERENCES \`Usuario\`(\`id\`) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    )
    console.log('✓ Tabela Escalacao criada')
  } else {
    console.log('– Tabela Escalacao já existe')
  }

  // G1: EscalacaoAtleta table
  if (!await tableExists('EscalacaoAtleta')) {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE \`EscalacaoAtleta\` (
        \`escalacaoId\` INT NOT NULL,
        \`atletaId\` INT NOT NULL,
        \`posicao\` VARCHAR(100) NULL,
        PRIMARY KEY (\`escalacaoId\`, \`atletaId\`),
        CONSTRAINT \`fk_ea_escalacao\`
          FOREIGN KEY (\`escalacaoId\`) REFERENCES \`Escalacao\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_ea_atleta\`
          FOREIGN KEY (\`atletaId\`) REFERENCES \`Usuario\`(\`id\`) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    )
    console.log('✓ Tabela EscalacaoAtleta criada')
  } else {
    console.log('– Tabela EscalacaoAtleta já existe')
  }

  console.log('✓ migrate-gaps: concluído')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
