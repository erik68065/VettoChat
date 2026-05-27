require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

// 1. Initialize Prisma ORM
const prisma = new PrismaClient();

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' })); // Restrict this to your actual domains before hard launch

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

io.on('connection', (socket) => {
  console.log('Dashboard connected via WebSocket:', socket.id);
});

// 2. Lead Capture & Scoring Endpoint
app.post('/api/leads/capture', async (req, res) => {
  const { tenantId, firstName, phone, intent, urgency } = req.body;

  try {
    // Phase 1 Scoring Math
    let score = 0;
    if (urgency === "Emergency (Within 24h)") score += 50;
    if (urgency === "This week") score += 30;
    if (intent === "Active Leak / Storm Damage") score += 40;
    
    const status = score >= 50 ? 'Hot' : (score >= 20 ? 'Warm' : 'Cold');

    // 3. Write to Supabase using Prisma
    // *Note: Ensure 'tenantId', 'name', etc. match your schema.prisma exact field names*
    const dbLead = await prisma.lead.create({
      data: {
        tenantId: tenantId || 'test-tenant-id',
        name: firstName,
        phone: phone,
        intent: intent,
        urgency: urgency,
        score: score,
        status: status
      }
    });

    // 4. Fire Real-Time Alert to Dashboard
    console.log(`✅ Lead secured in DB! Emitting to dashboard.`);
    io.emit('new_lead', dbLead); 
    
    return res.status(200).json({ success: true, lead: dbLead });

  } catch (error) {
    console.error("Prisma Ingestion Error:", error);
    return res.status(500).json({ error: "Failed to process lead" });
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🚀 VettoChat Engine running on port ${PORT}`));