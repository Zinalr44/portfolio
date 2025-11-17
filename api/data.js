// Serves portfolio knowledge for the chatbot
// GET /api/data -> { about, skills, projects, contact, resume, faq }

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    // Load static JSON bundled with the project
    // Relative to this file (api/), knowledge.json is one level up
    let kb;
    try {
      kb = require('../knowledge.json');
    } catch (e) {
      res.status(404).json({ error: 'knowledge.json not found' });
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(kb);
  } catch (e) {
    console.error('api/data error', e);
    res.status(500).json({ error: 'Server error' });
  }
};
