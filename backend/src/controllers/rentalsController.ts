import { Response } from 'express';

import { AuthRequest } from '../middleware/auth';
import prisma from '../prismaClient';

export async function createRental(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  const { title, description, price, location } = req.body as {
    title?: string;
    description?: string;
    price?: number;
    location?: string;
  };

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!title || typeof price !== 'number') {
    res.status(400).json({ error: 'title and numeric price required' });
    return;
  }

  const rental = await prisma.rental.create({
    data: {
      title,
      description,
      price,
      location,
      ownerId: userId
    }
  });

  res.status(201).json(rental);
}

export async function listRentals(_req: AuthRequest, res: Response): Promise<void> {
  const rentals = await prisma.rental.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      owner: {
        select: {
          id: true,
          email: true,
          name: true
        }
      }
    }
  });

  res.json(rentals);
}

export async function getRental(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const rental = await prisma.rental.findUnique({
    where: { id },
    include: {
      owner: {
        select: {
          id: true,
          email: true,
          name: true
        }
      }
    }
  });

  if (!rental) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.json(rental);
}

export async function updateRental(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  const id = Number(req.params.id);

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const rental = await prisma.rental.findUnique({ where: { id } });
  if (!rental) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  if (rental.ownerId !== userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const { title, description, price, location } = req.body as {
    title?: string;
    description?: string;
    price?: number;
    location?: string;
  };

  const updatedRental = await prisma.rental.update({
    where: { id },
    data: {
      title,
      description,
      price,
      location
    }
  });

  res.json(updatedRental);
}

export async function deleteRental(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  const id = Number(req.params.id);

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const rental = await prisma.rental.findUnique({ where: { id } });
  if (!rental) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  if (rental.ownerId !== userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  await prisma.rental.delete({ where: { id } });

  res.status(204).send();
}
