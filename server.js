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
  // Extract tenantId (from embed.js) and map it to orgId
  const { tenantId, orgId, firstName, phone, intent, urgency } = req.body;
  
  // The exact ID coming from your test frontend
  const activeOrgId = orgId || tenantId || 'test-tenant-id';

  try {
    // 🔴 THE FIX: Auto-provision the Organization so the Foreign Key never fails
    await prisma.organization.upsert({
      where: { id: activeOrgId },
      update: {}, // If it exists, do nothing
      create: {
        id: activeOrgId,
        name: "Demo Contractor LLC",
        ownerName: "Demo User",
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

    // Write strictly mapping to your Prisma schema columns
    const dbLead = await prisma.lead.create({
      data: {
        orgId: activeOrgId,
        firstName: firstName,
        phone: phone || "No phone provided",
        intent: intent || "Not specified",
        urgency: urgency || "Not specified",
        score: score,
        status: status
      }
    });

    // Fire Real-Time Alert to Dashboard
    console.log(`✅ Lead [${dbLead.firstName}] secured! Org: ${activeOrgId}`);
    io.emit('new_lead', dbLead); 
    
    return res.status(200).json({ success: true, lead: dbLead });

  } catch (error) {
    console.error("Prisma Ingestion Error:", error);
    return res.status(500).json({ error: "Failed to process lead" });
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🚀 VettoChat Engine running on port ${PORT}`));