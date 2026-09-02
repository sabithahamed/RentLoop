import request from 'supertest';

import app from '../app';
import prisma from '../prismaClient';

async function registerAndLogin(email: string, password: string): Promise<string> {
  await request(app).post('/api/auth/register').send({ email, password, name: email });

  const login = await request(app).post('/api/auth/login').send({ email, password });

  return login.body.token as string;
}

describe('Rentals endpoints', () => {
  beforeEach(async () => {
    await prisma.rental.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates rental for authenticated user', async () => {
    const token = await registerAndLogin('owner@rentloop.test', 'owner-pass-123');

    const response = await request(app)
      .post('/api/rentals')
      .set('Authorization', 'Bearer ' + token)
      .send({
        title: 'Test Rental',
        description: 'Nice rental',
        price: 1200,
        location: 'City Center'
      });

    expect(response.status).toBe(201);
    expect(response.body.title).toBe('Test Rental');
  });

  it('prevents non-owner from updating rental', async () => {
    const ownerToken = await registerAndLogin('owner2@rentloop.test', 'owner-pass-123');
    const otherToken = await registerAndLogin('other@rentloop.test', 'other-pass-123');

    const created = await request(app)
      .post('/api/rentals')
      .set('Authorization', 'Bearer ' + ownerToken)
      .send({ title: 'Owner Rental', price: 900 });

    const update = await request(app)
      .put(`/api/rentals/${created.body.id}`)
      .set('Authorization', 'Bearer ' + otherToken)
      .send({ title: 'Hijacked title' });

    expect(update.status).toBe(403);
  });

  it('lists rentals', async () => {
    const token = await registerAndLogin('owner3@rentloop.test', 'owner-pass-123');

    await request(app)
      .post('/api/rentals')
      .set('Authorization', 'Bearer ' + token)
      .send({ title: 'Listed Rental', price: 500 });

    const list = await request(app).get('/api/rentals');

    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBeGreaterThan(0);
  });
});
