// src/services/scheduler.js
import cron from 'node-cron';
import { getAllPlanStates, updatePlanStateNotificationFlags } from './planState.service.js';
import { mainBackendUrl, fetchSharedVariable } from '../config/services.js';
import axios from 'axios';

// Helper function to get the number of full days between two dates
// This counts days from start-of-day to start-of-day
function getDaysBetween(date1, date2) {
    const d1 = new Date(date1);
    d1.setHours(0, 0, 0, 0);
    const d2 = new Date(date2);
    d2.setHours(0, 0, 0, 0);
    const diffTime = d2.getTime() - d1.getTime();
    // Using Math.round to handle potential daylight saving time shifts which can cause non-exact day milliseconds
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

// Function to send a warning notification to the main backend
async function sendWarningNotification(websiteId, type, daysUntilEvent, nextBillingDate = null) {
    if (!mainBackendUrl) {
        console.error(`[Scheduler] Cannot send warning notification: Main backend URL not configured.`);
        return;
    }
    const mainServiceApiKey = process.env.MAIN_SERVICE_API_KEY; // Ensure you have this ENV var in your Plan Controller

    if (!mainServiceApiKey) {
        console.error(`[Scheduler] Cannot send warning notification: MAIN_SERVICE_API_KEY not configured.`);
        return;
    }

    try {
        await axios.post(`${mainBackendUrl}/api/websites/${websiteId}/payment-warning`, {
            type,
            daysUntilEvent,
            nextBillingDate: nextBillingDate ? nextBillingDate.toISOString() : null
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-main-service-api-key': mainServiceApiKey // Use an API key for internal service authentication
            }
        });
        console.log(`[Scheduler] Successfully sent ${type} warning for website ${websiteId} (ends in ${daysUntilEvent} days).`);
    } catch (error) {
        console.error(`[Scheduler] Failed to send ${type} warning for website ${websiteId}:`, error.message);
        if (axios.isAxiosError(error) && error.response) {
            console.error(`[Scheduler] Main Service Error Response:`, error.response.data);
        }
    }
}

async function checkAndTriggerEvents() {
    console.log(`[Scheduler] Running check at ${new Date().toISOString()}`);

    const currentFreeTrialDurationDays = await fetchSharedVariable('FREE_TRIAL_DURATION_DAYS');
    const freeTrialDuration = currentFreeTrialDurationDays !== null && !isNaN(currentFreeTrialDurationDays)
        ? currentFreeTrialDurationDays
        : 14; // Fallback to 14 days if value is null or invalid number

    console.log(`[Scheduler] Current Configured Free Trial Duration: ${freeTrialDuration} days`);
    console.log(`[Scheduler] Main Backend URL: ${mainBackendUrl}`); // This is fetched once at app startup

    const planStates = await getAllPlanStates();
    const now = new Date();
    // Normalize 'now' to start of day for consistent day calculations
    now.setHours(0, 0, 0, 0);

    for (const state of planStates) {
        const websiteId = state.website_id;

        if (!mainBackendUrl) {
            console.error(`[Scheduler] Skipping checks for website ${websiteId}: Main service URL not configured.`);
            continue;
        }

        let updatedFlags = {};

        // --- Free Trial Monitoring ---
        if (state.free_trial_start_date) {
            const trialStartDate = new Date(state.free_trial_start_date);
            trialStartDate.setHours(0, 0, 0, 0);

            const trialEndDate = new Date(trialStartDate);
            trialEndDate.setDate(trialEndDate.getDate() + (freeTrialDuration - 1));
            trialEndDate.setHours(0, 0, 0, 0);

            const daysRemaining = getDaysBetween(now, trialEndDate);

            console.log(`Website ${websiteId}: Trial Start: ${trialStartDate.toISOString().split('T')[0]}, Trial End Day (inclusive): ${trialEndDate.toISOString().split('T')[0]}, Now: ${now.toISOString().split('T')[0]}, Days Remaining: ${daysRemaining}`);

            if (daysRemaining === 5 && !state.free_trial_end_notified_5d) {
                console.log(`[Scheduler] Notification: Website ${websiteId} free trial ends in 5 days.`);
                await sendWarningNotification(websiteId, 'free_trial_end', 5);
                updatedFlags.free_trial_end_notified_5d = true;
            }
            if (daysRemaining === 3 && !state.free_trial_end_notified_3d) {
                console.log(`[Scheduler] Notification: Website ${websiteId} free trial ends in 3 days.`);
                await sendWarningNotification(websiteId, 'free_trial_end', 3);
                updatedFlags.free_trial_end_notified_3d = true;
            }
            if (daysRemaining === 1 && !state.free_trial_end_notified_1d) { // Tomorrow
                console.log(`[Scheduler] Notification: Website ${websiteId} free trial ends tomorrow.`);
                await sendWarningNotification(websiteId, 'free_trial_end', 1);
                updatedFlags.free_trial_end_notified_1d = true;
            }

            if (daysRemaining < 0 && !state.free_trial_ended_action_taken) { // Trial has passed
                console.log(`[Scheduler] Action: Website ${websiteId} free trial has ended (past due). Notifying main service to downgrade.`);
                try {
                    await axios.put(`${mainBackendUrl}/api/websites/${websiteId}/free-trial-ended`, {}, {
                        headers: {
                            'Content-Type': 'application/json',
                            'x-plan-controller-api-key': process.env.PLAN_CONTROLLER_API_KEY
                        }
                    });
                    console.log(`[Scheduler] Main service notified for free trial end of website ${websiteId}.`);
                    updatedFlags.free_trial_ended_action_taken = true;
                } catch (error) {
                    console.error(`[Scheduler] Failed to notify main service for website ${websiteId} free trial end:`, error.message);
                }
            } else if (daysRemaining === 0 && !state.free_trial_ended_action_taken) { // Trial ends today
                console.log(`[Scheduler] Action: Website ${websiteId} free trial ends today. Notifying main service to downgrade.`);
                try {
                    await axios.put(`${mainBackendUrl}/api/websites/${websiteId}/free-trial-ended`, {}, {
                        headers: {
                            'Content-Type': 'application/json',
                            'x-plan-controller-api-key': process.env.PLAN_CONTROLLER_API_KEY
                        }
                    });
                    console.log(`[Scheduler] Main service notified for free trial end of website ${websiteId}.`);
                    updatedFlags.free_trial_ended_action_taken = true;
                } catch (error) {
                    console.error(`[Scheduler] Failed to notify main service for website ${websiteId} free trial end:`, error.message);
                }
            }
        }

        // --- Billing Date Monitoring ---
        if (state.next_billing_date) {
            const nextBillingDate = new Date(state.next_billing_date);
            nextBillingDate.setHours(0, 0, 0, 0);

            const daysUntilBilling = getDaysBetween(now, nextBillingDate);

            console.log(`Website ${websiteId}: Next billing on ${nextBillingDate.toISOString().split('T')[0]}. Now: ${now.toISOString().split('T')[0]}, Days until billing: ${daysUntilBilling}. Flag: 3d=${state.billing_date_notified_3d}`);

            if (daysUntilBilling === 5 && !state.billing_date_notified_5d) { // Assuming a 5-day warning
                console.log(`[Scheduler] Notification: Website ${websiteId} next billing date is in 5 days.`);
                await sendWarningNotification(websiteId, 'billing', 5, nextBillingDate);
                updatedFlags.billing_date_notified_5d = true;
            }
            if (daysUntilBilling === 3 && !state.billing_date_notified_3d) {
                console.log(`[Scheduler] Notification: Website ${websiteId} next billing date is in 3 days.`);
                await sendWarningNotification(websiteId, 'billing', 3, nextBillingDate);
                updatedFlags.billing_date_notified_3d = true;
            }
            if (daysUntilBilling === 1 && !state.billing_date_notified_1d) { // Tomorrow
                console.log(`[Scheduler] Notification: Website ${websiteId} next billing date is tomorrow.`);
                await sendWarningNotification(websiteId, 'billing', 1, nextBillingDate);
                updatedFlags.billing_date_notified_1d = true;
            }
        }

        // --- Update Notification Flags in DB if any were changed ---
        if (Object.keys(updatedFlags).length > 0) {
            await updatePlanStateNotificationFlags(websiteId, updatedFlags);
        }
    }
}

function startScheduler() {
    const intervalMinutes = parseInt(process.env.SCHEDULER_INTERVAL_MINUTES || '60', 10);
    if (isNaN(intervalMinutes) || intervalMinutes <= 0) {
        console.error('Invalid SCHEDULER_INTERVAL_MINUTES. Scheduler will not start.');
        return;
    }

    // Run immediately on start, then periodically
    checkAndTriggerEvents();

    cron.schedule(`*/${intervalMinutes} * * * *`, () => {
        console.log(`[Scheduler] Scheduled task triggered (every ${intervalMinutes} minutes).`);
        checkAndTriggerEvents();
    });

    console.log(`[Scheduler] Started cron job to run every ${intervalMinutes} minutes.`);
}

export { startScheduler };