import request from 'supertest';

import app from '../app';
import prisma from '../prismaClient';

describe('Auth endpoints', () => {
  const email = 'new-user@rentloop.test';
  const password = 'super-secure-pass';

  beforeEach(async () => {
    await prisma.rental.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('registers and returns a token', async () => {
    const response = await request(app).post('/api/auth/register').send({
      email,
      password,
      name: 'New User'
    });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('token');
    expect(response.body.user.email).toBe(email);
  });

  it('logs in with valid credentials', async () => {
    await request(app).post('/api/auth/register').send({ email, password });

    const response = await request(app).post('/api/auth/login').send({ email, password });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
  });
});
