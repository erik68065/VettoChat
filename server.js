// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');

// // 1. Initialize Express & Middleware
// const app = express();
// app.use(express.json());
// // Allow requests from the widget and dashboard during the demo
// app.use(cors({ origin: '*' })); 
// app.use(express.static(__dirname));

// // 2. Initialize Real-Time WebSockets
// const server = http.createServer(app);
// const io = new Server(server, {
//   cors: {
//     origin: "*", 
//     methods: ["GET", "POST"]
//   }
// });

// // 3. Lead Scoring Engine (Phase 3 Integrated)
// const SCORING_MATRIX = {
//   urgency: {
//     "Emergency (Within 24h)": 50,
//     "This week": 30,
//     "Just browsing / Next month": 10
//   },
//   intent: {
//     "Active Leak / Storm Damage": 40,
//     "Full Roof Replacement": 35,
//     "Minor Repair": 15,
//     "Gutter Cleaning": 5
//   }
// };

// function calculateLeadTier(leadData) {
//   let score = 0;

//   // Point Distribution
//   score += SCORING_MATRIX.urgency[leadData.urgency] || 10;
//   score += SCORING_MATRIX.intent[leadData.intent] || 15;

//   // Light NLP / Regex overrides for edge cases
//   const highIntentKeywords = /(leak|flooding|tree fell|hole|hail|emergency)/i;
//   if (highIntentKeywords.test(leadData.intent)) {
//     score += 20; 
//   }

//   // UPDATED: High, Medium, Low Thresholds
//   let status = 'Low';
//   if (score >= 80) status = 'High';
//   else if (score >= 50) status = 'Medium';

//   return { score, status };
// }

// // 4. API Endpoint: Capture Lead from Widget
// app.post('/api/leads/capture', (req, res) => {
//   const leadData = req.body; 
//   console.log("📥 New Lead Captured:", leadData.name);

//   // Score the lead instantly
//   const { score, status } = calculateLeadTier(leadData);

//   // Enrich payload for the dashboard
//   const enrichedLead = { 
//     ...leadData, 
//     score, 
//     status, 
//     timestamp: new Date() 
//   };

//   // 5. Emit instantly to the active VettoChat Dashboard
//   io.emit('new_lead', enrichedLead);
//   console.log(`🚀 Emitted to Dashboard: ${status} Tier (Score: ${score})`);

//   // Respond to the widget so it can show the success message
//   res.status(200).json({ success: true });
// });

// // 6. Start the Engine
// const PORT = 8080;
// server.listen(PORT, () => {
//   console.log(`===========================================`);
//   console.log(`⚡ VETTOCHAT LOCAL ENGINE RUNNING ON ${PORT}`);
//   console.log(`===========================================`);
//   console.log(`Ready to receive leads from the demo widget...`);
// });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client'); // Connects to our Vault

// 1. Initialize Express & Middleware
const app = express();
app.use(express.static(__dirname));
app.use(express.json());
app.use(cors({ origin: '*' })); 

// 2. Initialize Real-Time WebSockets
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const prisma = new PrismaClient(); // Our Supabase Database connection

// --- MULTI-TENANT SOCKET CONNECTIONS ---
io.on('connection', (socket) => {
  console.log(`🔌 Dashboard connected: ${socket.id}`);

  // Dashboard joins a secure VIP room for their specific org
  socket.on('join_dashboard', (tenantId) => {
    socket.join(tenantId);
    console.log(`🔒 Socket ${socket.id} joined secure room for Tenant: ${tenantId}`);
  });
});

// --- CORE INGESTION ENDPOINT ---
app.post('/api/leads/capture', async (req, res) => {
  try {
    const leadData = req.body; 
    console.log("📥 New Lead Captured:", leadData.firstName);

    // 1. Fallback for testing (before we create our first real tenant)
    const tenantId = leadData.tenantId || "test-tenant-id"; 

    // 2. Score the Lead
    let score = 0;
    if (leadData.intent && (leadData.intent.toLowerCase().includes('leak') || leadData.intent.toLowerCase().includes('storm'))) score += 40;
    if (leadData.urgency && (leadData.urgency.toLowerCase().includes('24h') || leadData.urgency.toLowerCase().includes('emergency'))) score += 50;

    let status = 'Cold';
    if (score >= 80) status = 'Hot';
    else if (score >= 50) status = 'Warm';

    // 3. Save to Database (Wrapped in try/catch to not crash if tenant doesn't exist yet)
    let dbLead = null;
    try {
      dbLead = await prisma.lead.create({
        data: {
          id: `lead_${Date.now()}`,
          orgId: tenantId, 
          firstName: leadData.firstName || "Unknown",
          phone: leadData.phone || "No Phone",
          intent: leadData.intent || "Not specified",
          urgency: leadData.urgency || "Not specified",
          score: score,
          status: status
        }
      });
      console.log("✅ Saved to Supabase Vault!");
    } catch (dbError) {
      console.log("⚠️ Could not save to DB (Tenant likely missing). Proceeding in memory mode.");
    }

    // 4. Enrich payload for the dashboard
    const enrichedLead = dbLead || { ...leadData, score, status, timestamp: new Date() };

    // 5. Emit instantly to the active VettoChat Dashboard
    // In production, we use: io.to(tenantId).emit('new_lead', enrichedLead);
    // For now, we will broadcast so your current dashboard still works!
    io.emit('new_lead', enrichedLead);
    
    return res.status(200).json({ success: true, lead: enrichedLead });

  } catch (error) {
    console.error("Ingestion Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 VettoChat Engine running on port ${PORT} with Supabase Connection`);
});