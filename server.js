// Local Express server to test the portfolio and APIs without Vercel (CommonJS)
const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

// Load local env for GROQ_API_KEY, etc.
dotenv.config({ path: '.env.local' });
if (!process.env.GROQ_API_KEY) {
  dotenv.config(); // fallback to .env
}

// Ensure global fetch exists (Node <18)
if (typeof fetch === 'undefined') {
  try {
    // node-fetch v3 is ESM-only; use a dynamic import wrapper compatible with CommonJS
    global.fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
  } catch (_) {
    // If node-fetch not installed and Node >=18, fetch should already exist
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static files from project root
app.use(express.static(__dirname));

// Mount API routes using existing CommonJS handlers in api/*.js
const pingHandler = require('./api/ping.js');
const chatHandler = require('./api/chat.js');
const dataHandler = require('./api/data.js');

app.get('/api/ping', (req, res) => pingHandler(req, res));
app.post('/api/chat', (req, res) => chatHandler(req, res));
app.get('/api/data', (req, res) => dataHandler(req, res));

// SPA fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Local server running at http://localhost:${PORT}`);
});
