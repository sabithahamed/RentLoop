import { Router } from 'express';

import authRouter from './auth';
import rentalsRouter from './rentals';

const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/rentals', rentalsRouter);

export default apiRouter;
