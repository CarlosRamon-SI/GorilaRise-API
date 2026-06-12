/**
 * Script de migração: renomear roles e unificar TREINADOR/PROFESSOR/NUTRICIONISTA
 * Executar UMA VEZ antes de rodar `prisma generate` / restart do servidor.
 *   npx tsx prisma/migrate-roles.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Iniciando migração de roles...')

  // 1. Verificar se coluna funcao já existe
  const cols = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
    SELECT COUNT(*) as count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'Usuario'
      AND COLUMN_NAME = 'funcao'
  `)
  const funcaoExists = Number(cols[0].count) > 0

  if (!funcaoExists) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE Usuario
      ADD COLUMN funcao ENUM('PROFESSOR','NUTRICIONISTA','FISIOTERAPEUTA') NULL
    `)
    console.log('✓ Coluna funcao adicionada')
  } else {
    console.log('· Coluna funcao já existe, pulando')
  }

  // 2. Expandir enum role para incluir ATLETA (transição segura)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE Usuario
    MODIFY COLUMN role ENUM('USUARIO','ATLETA','TREINADOR','ADMIN','PROFESSOR','NUTRICIONISTA','SOCIO_TORCEDOR')
    NOT NULL DEFAULT 'USUARIO'
  `)
  console.log('✓ Enum expandido temporariamente')

  // 3. Migrar PROFESSOR → TREINADOR + funcao=PROFESSOR
  const [profRows] = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(*) as c FROM Usuario WHERE role = 'PROFESSOR'`
  ) as any
  const profCount = Number(profRows.c)
  if (profCount > 0) {
    await prisma.$executeRawUnsafe(`
      UPDATE Usuario SET funcao = 'PROFESSOR', role = 'TREINADOR' WHERE role = 'PROFESSOR'
    `)
    console.log(`✓ ${profCount} usuário(s) PROFESSOR → TREINADOR+funcao=PROFESSOR`)
  } else {
    console.log('· Nenhum usuário PROFESSOR encontrado')
  }

  // 4. Migrar NUTRICIONISTA → TREINADOR + funcao=NUTRICIONISTA
  const [nutriRows] = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(*) as c FROM Usuario WHERE role = 'NUTRICIONISTA'`
  ) as any
  const nutriCount = Number(nutriRows.c)
  if (nutriCount > 0) {
    await prisma.$executeRawUnsafe(`
      UPDATE Usuario SET funcao = 'NUTRICIONISTA', role = 'TREINADOR' WHERE role = 'NUTRICIONISTA'
    `)
    console.log(`✓ ${nutriCount} usuário(s) NUTRICIONISTA → TREINADOR+funcao=NUTRICIONISTA`)
  } else {
    console.log('· Nenhum usuário NUTRICIONISTA encontrado')
  }

  // 5. Migrar USUARIO → ATLETA
  const [usuRows] = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(*) as c FROM Usuario WHERE role = 'USUARIO'`
  ) as any
  const usuCount = Number(usuRows.c)
  if (usuCount > 0) {
    await prisma.$executeRawUnsafe(`UPDATE Usuario SET role = 'ATLETA' WHERE role = 'USUARIO'`)
    console.log(`✓ ${usuCount} usuário(s) USUARIO → ATLETA`)
  } else {
    console.log('· Nenhum usuário USUARIO encontrado')
  }

  // 6. Encolher enum role para valores finais
  await prisma.$executeRawUnsafe(`
    ALTER TABLE Usuario
    MODIFY COLUMN role ENUM('ATLETA','TREINADOR','ADMIN','SOCIO_TORCEDOR')
    NOT NULL DEFAULT 'ATLETA'
  `)
  console.log('✓ Enum encolhido para valores finais')

  console.log('\nMigração concluída com sucesso.')
}

main()
  .catch(e => { console.error('Erro na migração:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
