require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

io.on('connection', (socket) => {
  console.log('Dashboard connected:', socket.id);
});

// ── Lead Capture Endpoint ─────────────────────────────────────────────────────
// Clients table: id, businessName, ownerFullName, ownerPhone, industry, createdAt
// Leads table:   id, fullName, phone, intent, urgency, score, status, createdAt, companyId
app.post('/api/leads/capture', async (req, res) => {
  const {
    companyId,
    fullName,
    phone,
    intent,
    urgency,
    // optional extras stored in dashboard but not in Leads table
    location,
    budget,
  } = req.body;

  const activeCompanyId = companyId || 'default-company';

  try {
    // Auto-provision the Client record so the foreign key never fails
    await prisma.client.upsert({
      where: { id: activeCompanyId },
      update: {},
      create: {
        id:            activeCompanyId,
        businessName:  'VettoChat Demo',
        ownerFullName: 'Account Owner',
        ownerPhone:    'Not provided',
        industry:      'Home Services',
      },
    });

    // Score the lead
    let score = 0;
    if (urgency === 'Emergency (Within 24h)') score += 50;
    else if (urgency === 'This week')          score += 30;
    if (intent === 'Storm Damage')             score += 40;
    else if (intent === 'Full Replacement')    score += 30;
    else if (intent === 'Leak Repair')         score += 20;

    const status = score >= 70 ? 'hot' : score >= 30 ? 'warm' : 'new';

    // Write to Leads table
    const lead = await prisma.lead.create({
      data: {
        client: { 
          connect: { id: activeCompanyId } 
        },
        fullName: fullName || "Unknown Visitor",
        phone: phone || "No phone provided",
        intent: intent || "Not specified",
        urgency: urgency || "Not specified",
        score: score,
        status: status
      },
    });

    console.log(`✅ Lead captured: ${lead.fullName} | Company: ${activeCompanyId}`);

    // Broadcast to all connected dashboard tabs in real time
    io.emit('new_lead', {
      ...lead,
      location: location || '',
      budget:   budget   || '',
    });

    return res.status(200).json({ success: true, lead });

  } catch (error) {
    console.error('Lead capture error:', error);
    return res.status(500).json({ error: 'Failed to capture lead' });
  }
});

// ── Client Setup (Onboarding) ─────────────────────────────────────────────────
// Creates or updates the Client record tied to a Supabase auth user.
app.post('/api/clients/setup', async (req, res) => {
  const { supabaseUserId, email, businessName, ownerFullName, ownerPhone, industry } = req.body;

  if (!supabaseUserId || !businessName || !ownerFullName) {
    return res.status(400).json({ error: 'supabaseUserId, businessName, and ownerFullName are required' });
  }

  try {
    const client = await prisma.client.upsert({
      where: { supabaseUserId },
      update: { businessName, ownerFullName, ownerPhone: ownerPhone || '', industry: industry || 'General' },
      create: {
        supabaseUserId,
        email:         email || '',
        businessName,
        ownerFullName,
        ownerPhone:    ownerPhone || '',
        industry:      industry || 'General',
      },
    });

    console.log(`✅ Client setup: ${client.businessName} (${supabaseUserId})`);
    return res.status(200).json({ success: true, client });
  } catch (error) {
    console.error('Client setup error:', error);
    return res.status(500).json({ error: 'Failed to set up workspace' });
  }
});

// ── Client Lookup by Supabase User ID ────────────────────────────────────────
app.get('/api/clients/me/:userId', async (req, res) => {
  try {
    const client = await prisma.client.findUnique({ where: { supabaseUserId: req.params.userId } });
    if (!client) return res.status(404).json({ error: 'No workspace found' });
    return res.status(200).json({ client });
  } catch (error) {
    return res.status(500).json({ error: 'Lookup failed' });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🚀 VettoChat running on port ${PORT}`));
