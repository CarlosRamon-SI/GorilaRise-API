/**
 * Migração: Turma v2 — adiciona Ambiente, TurmaAtleta, TreinadorModalidade
 * e substitui coluna ativa por status (enum).
 * Executar UMA VEZ: npx tsx prisma/migrate-turmas-v2.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
    SELECT COUNT(*) as count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${table}'
      AND COLUMN_NAME = '${column}'
  `)
  return Number(rows[0].count) > 0
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
    SELECT COUNT(*) as count
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${table}'
  `)
  return Number(rows[0].count) > 0
}

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
    SELECT COUNT(*) as count
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${table}'
      AND INDEX_NAME = '${indexName}'
  `)
  return Number(rows[0].count) > 0
}

async function main() {
  console.log('Iniciando migração turmas-v2...')

  // 1. Criar tabela Ambiente
  if (!await tableExists('Ambiente')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE Ambiente (
        id         INT          NOT NULL AUTO_INCREMENT,
        nome       VARCHAR(191) NOT NULL,
        descricao  VARCHAR(191) NULL,
        capacidade INT          NOT NULL DEFAULT 20,
        ativo      TINYINT(1)   NOT NULL DEFAULT 1,
        PRIMARY KEY (id)
      )
    `)
    console.log('✓ Tabela Ambiente criada')
  } else {
    console.log('· Tabela Ambiente já existe')
  }

  // 2. Criar tabela TurmaAtleta
  if (!await tableExists('TurmaAtleta')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE TurmaAtleta (
        turmaId  INT      NOT NULL,
        atletaId INT      NOT NULL,
        criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (turmaId, atletaId)
      )
    `)
    await prisma.$executeRawUnsafe(`
      ALTER TABLE TurmaAtleta
        ADD CONSTRAINT fk_turmaatleta_turma
          FOREIGN KEY (turmaId) REFERENCES Turma(id) ON DELETE CASCADE,
        ADD CONSTRAINT fk_turmaatleta_atleta
          FOREIGN KEY (atletaId) REFERENCES Usuario(id)
    `)
    console.log('✓ Tabela TurmaAtleta criada')
  } else {
    console.log('· Tabela TurmaAtleta já existe')
  }

  // 3. Criar tabela TreinadorModalidade
  if (!await tableExists('TreinadorModalidade')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE TreinadorModalidade (
        treinadorId  INT NOT NULL,
        modalidadeId INT NOT NULL,
        PRIMARY KEY (treinadorId, modalidadeId)
      )
    `)
    await prisma.$executeRawUnsafe(`
      ALTER TABLE TreinadorModalidade
        ADD CONSTRAINT fk_treinadormod_treinador
          FOREIGN KEY (treinadorId) REFERENCES Usuario(id),
        ADD CONSTRAINT fk_treinadormod_modalidade
          FOREIGN KEY (modalidadeId) REFERENCES Modalidade(id)
    `)
    console.log('✓ Tabela TreinadorModalidade criada')
  } else {
    console.log('· Tabela TreinadorModalidade já existe')
  }

  // 4. Adicionar coluna status à Turma
  if (!await columnExists('Turma', 'status')) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE Turma
      ADD COLUMN status ENUM('PROPOSTA','PENDENTE_APROVACAO','ATIVA','INATIVA')
        NOT NULL DEFAULT 'ATIVA'
    `)
    console.log('✓ Coluna status adicionada à Turma')
  } else {
    console.log('· Coluna status já existe na Turma')
  }

  // 5. Backfill: copiar ativa → status (só se ativa ainda existe)
  if (await columnExists('Turma', 'ativa')) {
    await prisma.$executeRawUnsafe(`
      UPDATE Turma SET status = IF(ativa = 1, 'ATIVA', 'INATIVA')
    `)
    console.log('✓ Backfill status realizado a partir de ativa')
  }

  // 6. Adicionar ambienteId
  if (!await columnExists('Turma', 'ambienteId')) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE Turma ADD COLUMN ambienteId INT NULL
    `)
    if (!await indexExists('Turma', 'fk_turma_ambiente')) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE Turma
        ADD CONSTRAINT fk_turma_ambiente
          FOREIGN KEY (ambienteId) REFERENCES Ambiente(id)
      `)
    }
    console.log('✓ Coluna ambienteId adicionada à Turma')
  } else {
    console.log('· Coluna ambienteId já existe na Turma')
  }

  // 7. Adicionar treinadorId
  if (!await columnExists('Turma', 'treinadorId')) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE Turma ADD COLUMN treinadorId INT NULL
    `)
    if (!await indexExists('Turma', 'fk_turma_treinador')) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE Turma
        ADD CONSTRAINT fk_turma_treinador
          FOREIGN KEY (treinadorId) REFERENCES Usuario(id)
      `)
    }
    console.log('✓ Coluna treinadorId adicionada à Turma')
  } else {
    console.log('· Coluna treinadorId já existe na Turma')
  }

  // 8. Remover coluna ativa (após backfill)
  if (await columnExists('Turma', 'ativa')) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE Turma DROP COLUMN ativa
    `)
    console.log('✓ Coluna ativa removida da Turma')
  } else {
    console.log('· Coluna ativa já foi removida')
  }

  console.log('\nMigração turmas-v2 concluída com sucesso.')
}

main()
  .catch(e => { console.error('Erro na migração:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
