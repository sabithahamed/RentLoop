import { Router } from 'express';

import {
  createRental,
  deleteRental,
  getRental,
  listRentals,
  updateRental
} from '../controllers/rentalsController';
import { requireAuth } from '../middleware/auth';

const rentalsRouter = Router();

rentalsRouter.get('/', listRentals);
rentalsRouter.get('/:id', getRental);
rentalsRouter.post('/', requireAuth, createRental);
rentalsRouter.put('/:id', requireAuth, updateRental);
rentalsRouter.delete('/:id', requireAuth, deleteRental);

export default rentalsRouter;
