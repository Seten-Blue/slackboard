import express from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createSurvey,
  getSurveys,
  getSurvey,
  updateSurvey,
  deleteSurvey,
  activateSurvey,
  closeSurvey,
  submitResponse,
  getSurveyResults,
  getSurveyStats,
} from '../controllers/surveysController';

const router = express.Router();

router.use(requireAuth);

router.post('/', createSurvey);
router.get('/', getSurveys);
router.get('/stats', getSurveyStats);
router.get('/:surveyId', getSurvey);
router.put('/:surveyId', updateSurvey);
router.delete('/:surveyId', deleteSurvey);
router.post('/:surveyId/activate', activateSurvey);
router.post('/:surveyId/close', closeSurvey);
router.post('/:surveyId/respond', submitResponse);
router.get('/:surveyId/results', getSurveyResults);

export default router;
