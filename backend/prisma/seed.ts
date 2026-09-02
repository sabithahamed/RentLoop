import 'dotenv/config';

import bcrypt from 'bcryptjs';

import prisma from '../src/prismaClient';

const DEMO_EMAIL = 'demo@rentloop.test';
const DEMO_PASSWORD = 'demo-password-123';
const SALT_ROUNDS = 10;

async function main() {
  const password = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { password },
    create: {
      email: DEMO_EMAIL,
      password,
      name: 'RentLoop Demo'
    }
  });

  await prisma.rental.deleteMany({ where: { ownerId: user.id } });

  await prisma.rental.createMany({
    data: [
      {
        title: 'Downtown Studio Apartment',
        description: 'Fully furnished studio near transit.',
        price: 950,
        location: 'Downtown',
        ownerId: user.id
      },
      {
        title: 'Two Bedroom Family Flat',
        description: 'Spacious 2BHK with balcony and parking.',
        price: 1400,
        location: 'Northside',
        ownerId: user.id
      },
      {
        title: 'Cozy Shared Room',
        description: 'Affordable shared space for students.',
        price: 450,
        location: 'University District',
        ownerId: user.id
      }
    ]
  });

  console.log('Seeded demo user and rentals successfully.');
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
