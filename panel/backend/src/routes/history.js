import { Router } from 'express';
import { readHistory } from '../services/history.js';

export const historyRouter = Router();

historyRouter.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json(readHistory(limit));
});
