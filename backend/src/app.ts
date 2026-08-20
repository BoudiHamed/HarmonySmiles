import express from 'express';
import cors from 'cors';
import { publicRouter } from './routes/public.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { errorMiddleware } from './middlewares/error.middleware.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', publicRouter);
app.use('/api/admin', adminRouter);

app.use(errorMiddleware);

export default app;
