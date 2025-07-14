// src/config/db.js
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

// PostgreSQL Client (Neon)
const pgClient = new Client({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
        rejectUnauthorized: false // Required for Neon if connecting from Vercel/similar environments
    }
});

async function connectPostgres() {
    if (!process.env.POSTGRES_URL) {
        throw new Error('POSTGRES_URL is not defined in environment variables.');
    }
    await pgClient.connect();
}

export { pgClient, connectPostgres };