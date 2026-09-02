import fs from 'node:fs';
import path from 'node:path';

const tmpDir = path.resolve('.tmp');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? `file:${process.cwd()}/.tmp/test.db`;

beforeAll(() => {
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
});
