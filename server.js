// server.js
import dotenv from 'dotenv';
import express from 'express';
import os from 'os';
import cors from 'cors';
import { connectPostgres, pgClient } from './src/config/db.js';
import { initializeSharedServices, mainBackendUrl as storedMainBackendUrl } from './src/config/services.js';
import planStateRoutes from './src/routes/planState.routes.js';
import authMiddleware from './src/middleware/auth.js';
import { startScheduler } from './src/services/scheduler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

let corsOptions = {
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
};

app.use(express.json());

// Conditional CORS application after fetching MAIN_BACKEND_URL
// This part will be executed after `initializeSharedServices()` in initializeApp()
// For now, it defaults to allowing all.
app.use(cors(corsOptions));

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
                -- NEW COLUMNS FOR NOTIFICATION TRACKING
                free_trial_end_notified_5d BOOLEAN DEFAULT FALSE,
                free_trial_end_notified_3d BOOLEAN DEFAULT FALSE,
                free_trial_end_notified_1d BOOLEAN DEFAULT FALSE,
                free_trial_ended_action_taken BOOLEAN DEFAULT FALSE,
                billing_date_notified_3d BOOLEAN DEFAULT FALSE,
                last_scheduler_run TIMESTAMP WITH TIME ZONE DEFAULT NULL
            );
        `);
        console.log('PostgreSQL plan_states table ensured with new notification flags.');

        await initializeSharedServices();

        if (storedMainBackendUrl && storedMainBackendUrl !== 'http://localhost:3000') {
            app.use(function(req, res, next) {
                res.header("Access-Control-Allow-Origin", storedMainBackendUrl);
                res.header("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE");
                res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Key");
                res.header("Access-Control-Allow-Credentials", "true");
                if (req.method === 'OPTIONS') {
                    res.sendStatus(204);
                } else {
                    next();
                }
            });
            console.log(`CORS policy updated: Allowing requests only from ${storedMainBackendUrl}`);
        } else {
            console.warn('MAIN_BACKEND_URL not fetched or is default. CORS remains unrestricted or requires manual configuration.');
        }

        startScheduler();

    } catch (error) {
        console.error('Failed to initialize app:', error);
        process.exit(1);
    }
}

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

    res.status(200).json({
        service: 'plan-controller-service',
        status: pgStatus === 'connected' ? 'healthy' : 'degraded',
        database_connection: {
            postgres: {
                status: pgStatus,
                error: pgError
            }
        },
        timestamp: new Date().toISOString()
    });
});

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