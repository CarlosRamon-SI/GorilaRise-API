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

async function columnIsNullable(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT IS_NULLABLE as nullable FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table, column,
  )
  return rows[0]?.nullable === 'YES'
}

async function main() {
  console.log('→ migrate-nutricao: iniciando...')

  // Anamnese: alergias/intolerâncias, restrições, preferências e rotina alimentar
  for (const column of ['alergiasIntolerancias', 'restricoesAlimentares', 'preferenciasAlimentares', 'rotinaAlimentar']) {
    if (!await columnExists('Anamnese', column)) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`Anamnese\` ADD COLUMN \`${column}\` TEXT NULL`
      )
      console.log(`✓ Anamnese.${column} adicionado`)
    } else {
      console.log(`– Anamnese.${column} já existe`)
    }
  }

  // Alimento: banco de alimentos (valores nutricionais por 100g)
  if (!await tableExists('Alimento')) {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE \`Alimento\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`nome\` VARCHAR(191) NOT NULL,
        \`categoria\` VARCHAR(191) NULL,
        \`caloriasKcal\` DECIMAL(7,2) NOT NULL,
        \`carboidratosG\` DECIMAL(6,2) NOT NULL,
        \`proteinasG\` DECIMAL(6,2) NOT NULL,
        \`gordurasG\` DECIMAL(6,2) NOT NULL,
        \`autorId\` INT NULL,
        \`criadoEm\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_alimento_autor\`
          FOREIGN KEY (\`autorId\`) REFERENCES \`Usuario\`(\`id\`) ON DELETE SET NULL
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    )
    console.log('✓ Tabela Alimento criada')
  } else {
    console.log('– Tabela Alimento já existe')
  }

  // RefeicaoDieta: refeições de uma PrescricaoDieta
  if (!await tableExists('RefeicaoDieta')) {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE \`RefeicaoDieta\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`prescricaoDietaId\` INT NOT NULL,
        \`nome\` VARCHAR(191) NOT NULL,
        \`horario\` VARCHAR(20) NULL,
        \`ordem\` INT NOT NULL DEFAULT 0,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_refeicaodieta_prescricao\`
          FOREIGN KEY (\`prescricaoDietaId\`) REFERENCES \`PrescricaoDieta\`(\`id\`) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    )
    console.log('✓ Tabela RefeicaoDieta criada')
  } else {
    console.log('– Tabela RefeicaoDieta já existe')
  }

  // ItemRefeicaoDieta: alimentos + quantidade dentro de uma refeição
  if (!await tableExists('ItemRefeicaoDieta')) {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE \`ItemRefeicaoDieta\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`refeicaoDietaId\` INT NOT NULL,
        \`alimentoId\` INT NOT NULL,
        \`quantidadeGramas\` DECIMAL(7,2) NOT NULL,
        \`ordem\` INT NOT NULL DEFAULT 0,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_itemrefeicao_refeicao\`
          FOREIGN KEY (\`refeicaoDietaId\`) REFERENCES \`RefeicaoDieta\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_itemrefeicao_alimento\`
          FOREIGN KEY (\`alimentoId\`) REFERENCES \`Alimento\`(\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    )
    console.log('✓ Tabela ItemRefeicaoDieta criada')
  } else {
    console.log('– Tabela ItemRefeicaoDieta já existe')
  }

  // ModeloDieta: templates de dieta reutilizáveis
  if (!await tableExists('ModeloDieta')) {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE \`ModeloDieta\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`titulo\` VARCHAR(191) NOT NULL,
        \`descricao\` TEXT NULL,
        \`categoria\` VARCHAR(191) NULL,
        \`calorias\` INT NULL,
        \`estrutura\` JSON NOT NULL,
        \`autorId\` INT NULL,
        \`criadoEm\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_modelodieta_autor\`
          FOREIGN KEY (\`autorId\`) REFERENCES \`Usuario\`(\`id\`) ON DELETE SET NULL
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    )
    console.log('✓ Tabela ModeloDieta criada')
  } else {
    console.log('– Tabela ModeloDieta já existe')
  }

  // PrescricaoDieta.biotipo: passa a ser opcional (novo fluxo em 2 passos não coleta mais biotipo)
  if (!await columnIsNullable('PrescricaoDieta', 'biotipo')) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`PrescricaoDieta\` MODIFY COLUMN \`biotipo\` VARCHAR(191) NULL`
    )
    console.log('✓ PrescricaoDieta.biotipo agora é opcional')
  } else {
    console.log('– PrescricaoDieta.biotipo já é opcional')
  }

  console.log('✓ migrate-nutricao: concluído')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
