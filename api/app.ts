import express from 'express';
import cors from 'cors';
import uploadHandler from './upload';
import healthHandler from './health';
import analyzeHandler from './analyze';
import resultHandler from './result';
import localImageHandler from './local-image';

const app = express();

app.use(cors());

// Selectively apply express.json() so file upload streams are not consumed early
app.use((req, res, next) => {
  const p = req.path || '';
  if (p.includes('/upload')) {
    return next();
  }
  return express.json()(req, res, next);
});

// Adapter helper to handle async handler errors gracefully
const adapt = (handler: any) => async (req: any, res: any, next: any) => {
  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
};

const router = express.Router();

router.get('/health', adapt(healthHandler));
router.get('/local-image', adapt(localImageHandler));
router.post('/upload', adapt(uploadHandler));

router.post('/analyze/:patientId', (req: any, res: any, next: any) => {
  req.query = { ...req.query, patientId: req.params.patientId };
  return adapt(analyzeHandler)(req, res, next);
});

router.get('/result/:patientId', (req: any, res: any, next: any) => {
  req.query = { ...req.query, patientId: req.params.patientId };
  return adapt(resultHandler)(req, res, next);
});

router.patch('/result/:patientId', (req: any, res: any, next: any) => {
  req.query = { ...req.query, patientId: req.params.patientId };
  return adapt(resultHandler)(req, res, next);
});

// Mount router on /api and root /
app.use('/api', router);
app.use('/', router);

export default app;
