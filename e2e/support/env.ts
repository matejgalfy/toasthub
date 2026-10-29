// The dev stack's addresses (docs/AGENTS.md → Dev URLs); override them through the environment.
export const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:5173';
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';
