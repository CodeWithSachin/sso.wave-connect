import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'acme' },
    update: {},
    create: {
      name: 'Acme Corp',
      slug: 'acme',
      displayName: 'Acme Corporation',
      plan: 'free',
      isActive: true,
    },
  });

  console.log(`Tenant created: ${tenant.id} (${tenant.slug})`);

  await prisma.tenantPolicy.upsert({
    where: { id: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@acme.com' },
    update: {},
    create: {
      email: 'admin@acme.com',
      emailVerified: true,
      displayName: 'Admin User',
      firstName: 'Admin',
      lastName: 'User',
      status: 'active',
    },
  });

  console.log(`User created: ${adminUser.id} (${adminUser.email})`);

  const membership = await prisma.membership.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: adminUser.id,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: adminUser.id,
      role: 'owner',
      joinedAt: new Date(),
    },
  });

  console.log(`Membership created: ${membership.id} (role: ${membership.role})`);
  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
