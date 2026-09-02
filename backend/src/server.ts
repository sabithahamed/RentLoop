import app from './app';
import prisma from './prismaClient';

const PORT = Number(process.env.PORT || 4000);

async function start(): Promise<void> {
  try {
    await prisma.$connect();

    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server', error);
    process.exit(1);
  }
}

start();
