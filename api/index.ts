/**
 * Vercel Serverless Function entry point for Apex Fit API.
 * Mounts the production Express application for serverless execution.
 */
import { createApp } from '../server/app.js';

const app = createApp();

export default app;
