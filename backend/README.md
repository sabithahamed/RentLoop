# RentLoop Backend

TypeScript + Express backend API with Prisma, JWT auth, and rentals CRUD.

## Environment

Copy `.env.example` to `.env` and set values:

```bash
cp .env.example .env
```

Required variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `PORT`

## Local setup

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

## Build and run

```bash
npm run build
npm run start
```

## Prisma migrations

```bash
npm run prisma:migrate
```

## Seed demo data

This creates demo user and rentals:

- email: `demo@rentloop.test`
- password: `demo-password-123`

```bash
npm run seed
```

## Tests (SQLite)

Tests run against SQLite for isolation.

```bash
npm test
```

The `test` script regenerates Prisma client using `prisma/schema.sqlite.prisma` and resets `.tmp/test.db`.

## Docker Compose (Postgres + backend)

```bash
docker compose up --build
```

Use a Postgres `DATABASE_URL` in `.env`, e.g.:

```text
DATABASE_URL="postgresql://<user>:<password>@postgres:5432/rentloop?schema=public"
```

## API routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/rentals`
- `GET /api/rentals/:id`
- `POST /api/rentals` (auth)
- `PUT /api/rentals/:id` (auth)
- `DELETE /api/rentals/:id` (auth)
