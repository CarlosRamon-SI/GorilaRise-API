import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  const nome = process.env.ADMIN_NOME ?? 'Administrador'
  const email = process.env.ADMIN_EMAIL
  const senha = process.env.ADMIN_SENHA

  if (!email || !senha) {
    console.error('❌  Defina ADMIN_EMAIL e ADMIN_SENHA no .env antes de rodar o seed.')
    process.exit(1)
  }

  const existe = await prisma.usuario.findUnique({ where: { email } })
  if (existe) {
    console.log(`ℹ️  Usuário ${email} já existe (role: ${existe.role}). Nada foi alterado.`)
    return
  }

  const hash = await bcrypt.hash(senha, 10)

  const admin = await prisma.usuario.create({
    data: {
      nome,
      email,
      cpf: '000.000.000-00',
      telefone: '00000000000',
      nascimento: new Date('1990-01-01'),
      endereco: 'Sede',
      cidade: 'Porto Alegre',
      cep: '00000-000',
      senha: hash,
      role: 'ADMIN',
    },
    select: { id: true, nome: true, email: true, role: true },
  })

  console.log('✅  Admin criado:', admin)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
