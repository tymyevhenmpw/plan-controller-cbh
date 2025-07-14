// src/controllers/planState.controller.js
import { upsertPlanState, updateNextBillingDate } from '../services/planState.service.js';
// Removed axios and mainBackendUrl import if not directly used here
// import axios from 'axios';
// import { mainBackendUrl, freeTrialDurationDays } from '../config/services.js';

/**
 * Creates or updates a plan state.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 */
async function upsertPlanStateController(req, res, next) {
    const { websiteId, planId, freeTrialStartDate, nextBillingDate } = req.body;
    // Removed mainServiceApiKey as it's not needed here or in main service calls now
    // const mainServiceApiKey = process.env.MAIN_SERVICE_API_KEY;

    if (!websiteId || !planId || !nextBillingDate) {
        return res.status(400).json({
            code: 400,
            status: 'error',
            error: 'Missing required fields: websiteId, planId, nextBillingDate.'
        });
    }

    // Validate freeTrialStartDate format if provided
    let parsedFreeTrialStartDate = null;
    if (freeTrialStartDate) {
        parsedFreeTrialStartDate = new Date(freeTrialStartDate);
        if (isNaN(parsedFreeTrialStartDate.getTime())) {
            return res.status(400).json({
                code: 400,
                status: 'error',
                error: 'Invalid freeTrialStartDate format.'
            });
        }
    }

    const parsedNextBillingDate = new Date(nextBillingDate);
    if (isNaN(parsedNextBillingDate.getTime())) {
        return res.status(400).json({
            code: 400,
            status: 'error',
            error: 'Invalid nextBillingDate format.'
        });
    }

    try {
        const planState = await upsertPlanState(websiteId, planId, parsedFreeTrialStartDate, parsedNextBillingDate);

        res.status(200).json({
            message: 'Plan state created/updated successfully.',
            code: 200,
            status: 'success',
            data: planState
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Updates the next billing date for a website.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 */
async function updateBillingDateController(req, res, next) {
    const { websiteId } = req.params;
    const { nextBillingDate } = req.body;

    if (!nextBillingDate) {
        return res.status(400).json({
            code: 400,
            status: 'error',
            error: 'Missing required field: nextBillingDate.'
        });
    }

    const parsedNextBillingDate = new Date(nextBillingDate);
    if (isNaN(parsedNextBillingDate.getTime())) {
        return res.status(400).json({
            code: 400,
            status: 'error',
            error: 'Invalid nextBillingDate format.'
        });
    }

    try {
        const updated = await updateNextBillingDate(websiteId, parsedNextBillingDate);
        if (updated) {
            res.status(200).json({
                message: 'Next billing date updated successfully.',
                code: 200,
                status: 'success',
                data: { websiteId, nextBillingDate: parsedNextBillingDate.toISOString() }
            });
        } else {
            res.status(404).json({
                code: 404,
                status: 'error',
                error: 'Website plan state not found.'
            });
        }
    } catch (error) {
        next(error);
    }
}

export { upsertPlanStateController, updateBillingDateController };