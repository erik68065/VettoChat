const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// 1. Initialize Express & Middleware
const app = express();
app.use(express.json());
// Allow requests from the widget and dashboard during the demo
app.use(cors({ origin: '*' })); 
app.use(express.static(__dirname));

// 2. Initialize Real-Time WebSockets
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// 3. Lead Scoring Engine (Phase 3 Integrated)
const SCORING_MATRIX = {
  urgency: {
    "Emergency (Within 24h)": 50,
    "This week": 30,
    "Just browsing / Next month": 10
  },
  intent: {
    "Active Leak / Storm Damage": 40,
    "Full Roof Replacement": 35,
    "Minor Repair": 15,
    "Gutter Cleaning": 5
  }
};

function calculateLeadTier(leadData) {
  let score = 0;

  // Point Distribution
  score += SCORING_MATRIX.urgency[leadData.budget] || 10; // Default to 10 if unknown
  score += SCORING_MATRIX.intent[leadData.intent] || 15;  // Default to 15 if unknown

  // Light NLP / Regex overrides for edge cases
  const highIntentKeywords = /(leak|flooding|tree fell|hole|hail|emergency)/i;
  if (highIntentKeywords.test(leadData.intent)) {
    score += 20; 
  }

  // Dashboard Default Thresholds (Hot >= 80, Warm >= 50)
  let status = 'Cold';
  if (score >= 80) status = 'Hot';
  else if (score >= 50) status = 'Warm';

  return { score, status };
}

// 4. API Endpoint: Capture Lead from Widget
app.post('/api/leads/capture', (req, res) => {
  const leadData = req.body; 
  console.log("📥 New Lead Captured:", leadData.name);

  // Score the lead instantly
  const { score, status } = calculateLeadTier(leadData);

  // Enrich payload for the dashboard
  const enrichedLead = { 
    ...leadData, 
    score, 
    status, 
    timestamp: new Date() 
  };

  // 5. Emit instantly to the active VettoChat Dashboard
  io.emit('new_lead', enrichedLead);
  console.log(`🚀 Emitted to Dashboard: ${status} Tier (Score: ${score})`);

  // Respond to the widget so it can show the success message
  res.status(200).json({ success: true });
});

// 6. Start the Engine
const PORT = 8080;
server.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`⚡ VETTOCHAT LOCAL ENGINE RUNNING ON ${PORT}`);
  console.log(`===========================================`);
  console.log(`Ready to receive leads from the demo widget...`);
});