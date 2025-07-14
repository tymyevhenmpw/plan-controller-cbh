// server.js
import dotenv from 'dotenv';
import express from 'express';
import os from 'os';
import cors from 'cors'; // Import the cors middleware
import { connectPostgres, pgClient } from './src/config/db.js';
// Import adminPanelUrl and mainBackendUrl for CORS configuration
import { initializeSharedServices, mainBackendUrl, adminPanelUrl } from './src/config/services.js';
import planStateRoutes from './src/routes/planState.routes.js';
import authMiddleware from './src/middleware/auth.js';
import { startScheduler } from './src/services/scheduler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

// ------------------------------------------
// UPDATED: Dynamic CORS application using a function
// This ensures CORS origins are set based on fetched shared variables.
// The `cors()` middleware with a function is the most robust way to handle dynamic origins.
// ------------------------------------------
app.use(cors(async (req, callback) => {
    let corsOptions;
    const allowedOrigins = [mainBackendUrl, adminPanelUrl].filter(Boolean); // Filter out null/undefined

    // Default to allow all if no specific origins are set, or for non-browser requests
    let originIsAllowed = false;
    const requestOrigin = req.header('Origin');

    if (!requestOrigin) {
        // Allow requests from same-origin tools like Postman, curl, or internal services without an Origin header
        originIsAllowed = true;
    } else if (allowedOrigins.includes(requestOrigin)) {
        originIsAllowed = true;
    } else {
        // If in development and trying to access from localhost:X, allow it
        if (process.env.NODE_ENV === 'development' && requestOrigin.startsWith('http://localhost:')) {
            originIsAllowed = true;
        }
    }
    
    if (originIsAllowed) {
        corsOptions = { origin: requestOrigin, credentials: true, methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', optionsSuccessStatus: 204 };
    } else {
        corsOptions = { origin: false }; // Reflect rejection in CORS header
        console.warn(`[CORS] Request from disallowed origin: ${requestOrigin}`);
    }
    callback(null, corsOptions); // Callback to signal CORS configuration is ready
}));
// ------------------------------------------

// Apply authentication middleware to all plan state routes
app.use('/plan-states', authMiddleware, planStateRoutes);

async function initializeApp() {
    try {
        await connectPostgres();
        console.log('PostgreSQL connected successfully.');

        // Ensure the plan_states table exists and add new notification flags
        await pgClient.query(`
            CREATE TABLE IF NOT EXISTS plan_states (
                website_id VARCHAR(255) PRIMARY KEY,
                plan_id VARCHAR(255) NOT NULL,
                free_trial_start_date TIMESTAMP WITH TIME ZONE,
                next_billing_date TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                free_trial_end_notified_5d BOOLEAN DEFAULT FALSE,
                free_trial_end_notified_3d BOOLEAN DEFAULT FALSE,
                free_trial_end_notified_1d BOOLEAN DEFAULT FALSE,
                free_trial_ended_action_taken BOOLEAN DEFAULT FALSE,
                billing_date_notified_3d BOOLEAN DEFAULT FALSE,
                last_scheduler_run TIMESTAMP WITH TIME ZONE DEFAULT NULL
            );
        `);
        console.log('PostgreSQL plan_states table ensured with new notification flags.');

        // Initialize shared service configurations (fetch mainBackendUrl and adminPanelUrl)
        await initializeSharedServices(); // This populates mainBackendUrl and adminPanelUrl

        startScheduler();

    } catch (error) {
        console.error('Failed to initialize app:', error);
        process.exit(1); // Exit if critical initialization fails
    }
}

// ------------------------------------------
// UPDATED: Health Check and Load Info Route
// Now includes System Metrics mirroring shared-variables-service for consistency in Admin Panel
// ------------------------------------------
app.get('/health', async (req, res) => {
    let pgStatus = 'disconnected';
    let pgError = null;

    try {
        if (pgClient) {
            await pgClient.query('SELECT 1');
            pgStatus = 'connected';
        }
    } catch (err) {
        pgStatus = 'error';
        pgError = err.message;
        console.error('Health check PostgreSQL query failed:', err);
    }

    // Get system load average
    const loadAverage = os.loadavg();
    // Get total and free memory in bytes
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const uptime = os.uptime(); // System uptime in seconds

    res.status(200).json({
        service: 'plan-controller-service',
        status: pgStatus === 'connected' ? 'healthy' : 'degraded',
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
        database_connections: {
            // Plan controller only uses Postgres, no Redis
            postgres: {
                status: pgStatus,
                error: pgError
            }
        },
        system_load: { // Include system load metrics for Plan Controller
            load_average_1min: loadAverage[0],
            load_average_5min: loadAverage[1],
            load_average_15min: loadAverage[2],
            cpu_count: os.cpus().length,
            memory_usage: {
                total_mb: (totalMemory / (1024 * 1024)).toFixed(2),
                free_mb: (freeMemory / (1024 * 1024)).toFixed(2),
                used_mb: (usedMemory / (1024 * 1024)).toFixed(2),
                used_percentage: ((usedMemory / totalMemory) * 100).toFixed(2)
            }
        },
        timestamp: new Date().toISOString()
    });
});
// ------------------------------------------

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.statusCode || 500).json({
        code: err.statusCode || 500,
        status: 'error',
        error: err.message || 'An unexpected error occurred.'
    });
});

initializeApp().then(() => {
    app.listen(PORT, () => {
        console.log(`Plan Controller Service listening on port ${PORT}`);
    });
});