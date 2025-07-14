// src/routes/planState.routes.js
import express from 'express';
import { upsertPlanStateController, updateBillingDateController } from '../controllers/planState.controller.js';

const router = express.Router();

// Create or Update a website's plan state
router.post('/', upsertPlanStateController);

// Update a website's next billing date
router.put('/:websiteId/update-billing-date', updateBillingDateController);

export default router;