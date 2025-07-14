// src/services/planState.service.js
import { pgClient } from '../config/db.js';

/**
 * Creates or updates a website's plan state in the database.
 * Resets notification flags on update/insert for a new period.
 * @param {string} websiteId
 * @param {string} planId
 * @param {Date | null} freeTrialStartDate
 * @param {Date | null} nextBillingDate
 * @returns {Promise<any>} The created/updated plan state record.
 */
async function upsertPlanState(websiteId, planId, freeTrialStartDate, nextBillingDate) {
    try {
        const query = `
            INSERT INTO plan_states (
                website_id, plan_id, free_trial_start_date, next_billing_date, updated_at,
                free_trial_end_notified_5d, free_trial_end_notified_3d, free_trial_end_notified_1d,
                free_trial_ended_action_taken, billing_date_notified_3d
            )
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, FALSE, FALSE, FALSE, FALSE, FALSE) -- Reset flags on insert
            ON CONFLICT (website_id) DO UPDATE
            SET
                plan_id = $2,
                free_trial_start_date = $3,
                next_billing_date = $4,
                updated_at = CURRENT_TIMESTAMP,
                -- Always reset notification flags when the state is updated by Main Service
                free_trial_end_notified_5d = FALSE,
                free_trial_end_notified_3d = FALSE,
                free_trial_end_notified_1d = FALSE,
                free_trial_ended_action_taken = FALSE,
                billing_date_notified_3d = FALSE,
                last_scheduler_run = NULL -- Reset last_scheduler_run to force initial check
            RETURNING *;
        `;
        const values = [websiteId, planId, freeTrialStartDate, nextBillingDate];
        const result = await pgClient.query(query, values);
        console.log(`[PlanStateService] Upserted plan state for website ${websiteId}. Notification flags reset.`);
        return result.rows[0];
    } catch (error) {
        console.error(`[PlanStateService] Error upserting plan state for website ${websiteId}:`, error);
        throw new Error('Failed to create/update plan state.');
    }
}

/**
 * Retrieves a single plan state by websiteId.
 * @param {string} websiteId
 * @returns {Promise<any | null>} The plan state record, or null if not found.
 */
async function getPlanState(websiteId) {
    try {
        const query = `SELECT * FROM plan_states WHERE website_id = $1;`;
        const result = await pgClient.query(query, [websiteId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error(`[PlanStateService] Error getting plan state for website ${websiteId}:`, error);
        throw new Error('Failed to retrieve plan state.');
    }
}

/**
 * Retrieves all plan states from the database.
 * @returns {Promise<Array<any>>} An array of all plan state records.
 */
async function getAllPlanStates() {
    try {
        const query = `SELECT * FROM plan_states;`;
        const result = await pgClient.query(query);
        return result.rows;
    } catch (error) {
        console.error('[PlanStateService] Error getting all plan states:', error);
        throw new Error('Failed to retrieve all plan states.');
    }
}

/**
 * Updates only the next_billing_date for a website.
 * This function will likely be deprecated if upsertPlanState handles all updates.
 * @param {string} websiteId
 * @param {Date} newNextBillingDate
 * @returns {Promise<boolean>} True if updated, false if not found.
 */
async function updateNextBillingDate(websiteId, newNextBillingDate) {
    try {
        const query = `
            UPDATE plan_states
            SET next_billing_date = $1, updated_at = CURRENT_TIMESTAMP, billing_date_notified_3d = FALSE -- Reset on date change
            WHERE website_id = $2;
        `;
        const result = await pgClient.query(query, [newNextBillingDate, websiteId]);
        if (result.rowCount === 0) {
            return false; // Website not found
        }
        console.log(`[PlanStateService] Updated next_billing_date for website ${websiteId}. Notification flag reset.`);
        return true;
    } catch (error) {
        console.error(`[PlanStateService] Error updating next_billing_date for website ${websiteId}:`, error);
        throw new Error('Failed to update next billing date.');
    }
}

/**
 * Updates specific notification flags for a plan state.
 * @param {string} websiteId
 * @param {object} flags - Object with flags to update (e.g., { free_trial_end_notified_5d: true })
 */
async function updatePlanStateNotificationFlags(websiteId, flags) {
    try {
        const setClauses = Object.keys(flags).map((key, index) => `${key} = $${index + 2}`).join(', ');
        const values = [websiteId, ...Object.values(flags)];

        const query = `
            UPDATE plan_states
            SET ${setClauses}, updated_at = CURRENT_TIMESTAMP
            WHERE website_id = $1;
        `;
        const result = await pgClient.query(query, values);
        if (result.rowCount === 0) {
            console.warn(`[PlanStateService] Failed to update notification flags for website ${websiteId}: Not found.`);
            return false;
        }
        console.log(`[PlanStateService] Updated notification flags for website ${websiteId}: ${JSON.stringify(flags)}.`);
        return true;
    } catch (error) {
        console.error(`[PlanStateService] Error updating notification flags for website ${websiteId}:`, error);
        throw new Error('Failed to update notification flags.');
    }
}

/**
 * Clears free trial info after it has ended and the main service has been notified.
 * @param {string} websiteId
 */
async function clearFreeTrial(websiteId) {
    try {
        const query = `
            UPDATE plan_states
            SET free_trial_start_date = NULL, free_trial_end_notified_5d = FALSE,
            free_trial_end_notified_3d = FALSE, free_trial_end_notified_1d = FALSE,
            free_trial_ended_action_taken = FALSE, updated_at = CURRENT_TIMESTAMP
            WHERE website_id = $1;
        `;
        const result = await pgClient.query(query, [websiteId]);
        if (result.rowCount > 0) {
            console.log(`[PlanStateService] Cleared free trial start date and reset its flags for website ${websiteId}.`);
        }
    } catch (error) {
        console.error(`[PlanStateService] Error clearing free trial for website ${websiteId}:`, error);
    }
}

export { upsertPlanState, getPlanState, getAllPlanStates, updateNextBillingDate, updatePlanStateNotificationFlags, clearFreeTrial };