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
    // This `now` will be the reference point for "today"
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
            trialStartDate.setHours(0, 0, 0, 0); // Normalize trial start date
            
            // CORRECTED: trialEndDate is the LAST DAY of the trial.
            // If trialDuration is 3, and trialStartDate is July 9th,
            // trialEndDate should be July 11th (9th, 10th, 11th).
            // So, add (freeTrialDuration - 1) days to the start date.
            const trialEndDate = new Date(trialStartDate);
            trialEndDate.setDate(trialEndDate.getDate() + (freeTrialDuration - 1)); // Corrected calculation
            trialEndDate.setHours(0, 0, 0, 0); // Normalize trial end date

            // Calculate days remaining until trialEndDate (inclusive of trialEndDate)
            // If trialEndDate is today, daysRemaining = 0.
            // If trialEndDate is tomorrow, daysRemaining = 1.
            const daysRemaining = getDaysBetween(now, trialEndDate);
            
            console.log(`Website ${websiteId}: Trial Start: ${trialStartDate.toISOString().split('T')[0]}, Trial End Day (inclusive): ${trialEndDate.toISOString().split('T')[0]}, Now: ${now.toISOString().split('T')[0]}, Days Remaining: ${daysRemaining}`);

            // Notify X days before trial ends
            // daysRemaining means: 'X' more full days are left, including today, before the trial is over.
            // So, if daysRemaining = 5, it means "trial ends 5 days from now (including today)".
            // If trial ends on Friday, and it's Monday, daysRemaining = 5.
            if (daysRemaining === 5 && !state.free_trial_end_notified_5d) {
                console.log(`[Scheduler] Notification: Website ${websiteId} free trial ends in 5 days.`);
                updatedFlags.free_trial_end_notified_5d = true;
            } 
            if (daysRemaining === 3 && !state.free_trial_end_notified_3d) {
                console.log(`[Scheduler] Notification: Website ${websiteId} free trial ends in 3 days.`);
                updatedFlags.free_trial_end_notified_3d = true;
            } 
            if (daysRemaining === 1 && !state.free_trial_end_notified_1d) { // Tomorrow
                console.log(`[Scheduler] Notification: Website ${websiteId} free trial ends tomorrow.`);
                updatedFlags.free_trial_end_notified_1d = true;
            } 
            
            // Free trial has ended (daysRemaining < 0), and action hasn't been taken
            // If trial ends today (daysRemaining = 0), action taken today or next run.
            if (daysRemaining < 0 && !state.free_trial_ended_action_taken) { // Trial has passed
                console.log(`[Scheduler] Action: Website ${websiteId} free trial has ended (past due). Notifying main service to downgrade.`);
                try {
                    await axios.put(`${mainBackendUrl}/websites/${websiteId}/free-trial-ended`, {}, {
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
                    await axios.put(`${mainBackendUrl}/websites/${websiteId}/free-trial-ended`, {}, {
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
            nextBillingDate.setHours(0, 0, 0, 0); // Normalize billing date

            const daysUntilBilling = getDaysBetween(now, nextBillingDate);

            console.log(`Website ${websiteId}: Next billing on ${nextBillingDate.toISOString().split('T')[0]}. Now: ${now.toISOString().split('T')[0]}, Days until billing: ${daysUntilBilling}. Flag: 3d=${state.billing_date_notified_3d}`);


            if (daysUntilBilling === 3 && !state.billing_date_notified_3d) {
                console.log(`[Scheduler] Notification: Website ${websiteId} next billing date is in 3 days.`);
                updatedFlags.billing_date_notified_3d = true;
            }
            // Add more billing date notifications (e.g., 1 day, on due date) if needed
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