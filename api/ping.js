// Simple health check to verify serverless is running in `vercel dev`
// GET http://localhost:3000/api/ping -> { ok: true, time: ... }
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({ ok: true, time: new Date().toISOString(), method: req.method });
};
