// src/middleware/auth.js
const API_KEY = process.env.PLAN_CONTROLLER_API_KEY;

function authMiddleware(req, res, next) {
    if (!API_KEY) {
        console.error('PLAN_CONTROLLER_API_KEY is not set in environment variables. Authentication disabled.');
        // In a production environment, you might want to throw an error or exit here.
        return next();
    }

    const providedApiKey = req.headers['x-api-key'];

    if (!providedApiKey || providedApiKey !== API_KEY) {
        return res.status(401).json({
            code: 401,
            status: 'error',
            error: 'Unauthorized: Invalid or missing API key.'
        });
    }
    next();
}

export default authMiddleware;