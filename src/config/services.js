// src/config/services.js
import axios from 'axios';

let freeTrialDurationDays = 14; // Default value
let mainBackendUrl = 'http://localhost:3000'; // Default value, will be fetched

async function fetchSharedVariable(name) { // This is the function that needs to be exported
    const url = `${process.env.SHARED_VARIABLES_SERVICE_URL}/variables/${name}`;
    const apiKey = process.env.SHARED_VARIABLES_SERVICE_API_KEY;

    if (!url || !apiKey) {
        console.warn(`[SharedServicesConfig] Missing URL or API Key for shared variables service.`);
        return null;
    }

    try {
        const response = await axios.get(url, {
            headers: { 'x-api-key': apiKey }
        });
        if (response.data.status === 'success' && response.data.value !== undefined) {
            return response.data.value;
        }
        console.warn(`[SharedServicesConfig] Shared variable '${name}' not found or invalid response.`);
        return null;
    } catch (error) {
        console.error(`[SharedServicesConfig] Error fetching shared variable '${name}':`, error.message);
        return null;
    }
}

async function initializeSharedServices() {
    console.log('[SharedServicesConfig] Initializing shared service configurations...');
    // Fetch FREE_TRIAL_DURATION_DAYS
    const fetchedFreeTrialDays = await fetchSharedVariable('FREE_TRIAL_DURATION_DAYS');
    if (fetchedFreeTrialDays !== null) {
        freeTrialDurationDays = fetchedFreeTrialDays;
        console.log(`[SharedServicesConfig] FREE_TRIAL_DURATION_DAYS set to: ${freeTrialDurationDays}`);
    } else {
        console.warn(`[SharedServicesConfig] Using default FREE_TRIAL_DURATION_DAYS: ${freeTrialDurationDays}`);
    }

    // Fetch MAIN_BACKEND_URL
    const fetchedMainBackendUrl = await fetchSharedVariable('MAIN_BACKEND_URL');
    if (fetchedMainBackendUrl !== null) {
        mainBackendUrl = fetchedMainBackendUrl; // Assign to the module-level variable
        console.log(`[SharedServicesConfig] MAIN_BACKEND_URL set to: ${mainBackendUrl}`);
    } else {
        console.warn(`[SharedServicesConfig] Using default MAIN_BACKEND_URL: ${mainBackendUrl}`);
    }
}

// Ensure fetchSharedVariable is included in the export list
export { initializeSharedServices, freeTrialDurationDays, mainBackendUrl, fetchSharedVariable };