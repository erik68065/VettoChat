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
app.use(cors({ origin: '*' })); // Note: Restrict this to your Vercel domains later

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

io.on('connection', (socket) => {
  console.log('Dashboard connected via WebSocket:', socket.id);
});

// 2. Lead Capture & Scoring Endpoint
app.post('/api/leads/capture', async (req, res) => {
  // Extract variables (matching new schema)
  const { companyId, fullName, phone, intent, urgency } = req.body;
  
  // Fallback ID if none provided during testing
  const activeCompanyId = companyId || 'test-company-id';

  try {
    // Auto-provision the Client so the Foreign Key never fails
    await prisma.client.upsert({
      where: { id: activeCompanyId },
      update: {}, // If it exists, do nothing
      create: {
        id: activeCompanyId,
        businessName: "Demo Contractor LLC",
        ownerFullName: "Demo User",
        ownerPhone: "Not Provided",
        industry: "Home Services"
      }
    });

    // Phase 1 Scoring Math
    let score = 0;
    if (urgency === "Emergency (Within 24h)") score += 50;
    if (urgency === "This week") score += 30;
    if (intent === "Active Leak / Storm Damage") score += 40;
    
    const status = score >= 50 ? 'Hot' : (score >= 20 ? 'Warm' : 'Cold');

    // Write strictly mapping to your new Leads schema
    const dbLead = await prisma.lead.create({
      data: {
        companyId: activeCompanyId,
        fullName: fullName || "Unknown Visitor",
        phone: phone || "No phone provided",
        intent: intent || "Not specified",
        urgency: urgency || "Not specified",
        score: score,
        status: status
      }
    });

    // Fire Real-Time Alert to Dashboard
    console.log(`✅ Lead [${dbLead.fullName}] secured! Company ID: ${activeCompanyId}`);
    io.emit('new_lead', dbLead); 
    
    return res.status(200).json({ success: true, lead: dbLead });
  } catch (error) {
    console.error("❌ Database Error:", error);
    return res.status(500).json({ error: "Failed to save lead" });
  }
});
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🚀 VettoChat Engine running on port ${PORT}`));