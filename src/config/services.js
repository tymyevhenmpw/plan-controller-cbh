// src/config/services.js
import axios from 'axios';

let freeTrialDurationDays = 14; // Default value
let mainBackendUrl = 'http://localhost:3000'; // Default value, will be fetched
let adminPanelUrl = 'http://localhost:303'; // Default value, will be fetched (e.g., your Next.js admin panel URL)

async function fetchSharedVariable(name) {
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
    
    const results = await Promise.all([
        fetchSharedVariable('FREE_TRIAL_DURATION_DAYS'),
        fetchSharedVariable('MAIN_BACKEND_URL'),
        fetchSharedVariable('ADMIN_URL') // Fetch ADMIN_URL
    ]);

    const [fetchedFreeTrialDays, fetchedMainBackendUrl, fetchedAdminUrl] = results;

    if (fetchedFreeTrialDays !== null) {
        freeTrialDurationDays = fetchedFreeTrialDays;
        console.log(`[SharedServicesConfig] FREE_TRIAL_DURATION_DAYS set to: ${freeTrialDurationDays}`);
    } else {
        console.warn(`[SharedServicesConfig] Using default FREE_TRIAL_DURATION_DAYS: ${freeTrialDurationDays}`);
    }

    if (fetchedMainBackendUrl !== null) {
        mainBackendUrl = fetchedMainBackendUrl;
        console.log(`[SharedServicesConfig] MAIN_BACKEND_URL set to: ${mainBackendUrl}`);
    } else {
        console.warn(`[SharedServicesConfig] Using default MAIN_BACKEND_URL: ${mainBackendUrl}`);
    }

    if (fetchedAdminUrl !== null) {
        adminPanelUrl = fetchedAdminUrl; // Assign to the module-level variable
        console.log(`[SharedServicesConfig] ADMIN_URL set to: ${adminPanelUrl}`);
    } else {
        console.warn(`[SharedServicesConfig] Using default ADMIN_URL: ${adminPanelUrl}`);
    }
}

// Export all necessary variables and functions
export { initializeSharedServices, freeTrialDurationDays, mainBackendUrl, adminPanelUrl, fetchSharedVariable };