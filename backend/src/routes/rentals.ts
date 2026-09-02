import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import {
  createRental,
  deleteRental,
  getRental,
  listRentals,
  updateRental
} from '../controllers/rentalsController';
import { requireAuth } from '../middleware/auth';

const rentalsRouter = Router();
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

rentalsRouter.get('/', listRentals);
rentalsRouter.get('/:id', getRental);
rentalsRouter.post('/', writeLimiter, requireAuth, createRental);
rentalsRouter.put('/:id', writeLimiter, requireAuth, updateRental);
rentalsRouter.delete('/:id', writeLimiter, requireAuth, deleteRental);

export default rentalsRouter;
