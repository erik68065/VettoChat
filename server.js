require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('./middleware/auth'); // Import our auth guard

const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

io.on('connection', (socket) => {
  console.log('Dashboard connected:', socket.id);
});

// ── UNPROTECTED ENDPOINT: Lead Capture Widget ─────────────────────────────────
// (Stays open to the public so websites can stream leads into your system)
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

// ── UNPROTECTED ENDPOINT: Initial Client Setup ────────────────────────────────
// (Triggered right after a user registers on the frontend to provision their profile)
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


// ── PROTECTED ENDPOINTS: Dashboard Data Overrides ─────────────────────────────

/**
 * 1. Fetch Logged-in Client Profile
 * Replaces the old GET /api/clients/me/:userId. No params needed.
 * The profile is safely resolved purely from the user's secure JWT session.
 */
app.get('/api/clients/me', requireAuth, async (req, res) => {
  try {
    const client = await prisma.client.findUnique({ 
      where: { supabaseUserId: req.user.id } 
    });
    
    if (!client) {
      return res.status(404).json({ error: 'Workspace profile not found. Onboarding required.' });
    }
    
    return res.status(200).json({ client });
  } catch (error) {
    console.error('Profile fetch error:', error);
    return res.status(500).json({ error: 'Failed to retrieve workspace profile.' });
  }
});

/**
 * 2. Fetch Isolated Leads for Logged-in Client Only
 * Leverages Prisma's relational queries to pull leads strictly belonging 
 * to the client associated with the verified Supabase User ID.
 */
app.get('/api/leads', requireAuth, async (req, res) => {
  try {
    const leads = await prisma.lead.findMany({
      where: {
        client: {
          supabaseUserId: req.user.id // Strict multi-tenant data boundary
        }
      },
      orderBy: {
        createdAt: 'desc' // Newest leads display at the top of the dashboard
      }
    });

    return res.status(200).json({ success: true, leads });
  } catch (error) {
    console.error('Failed to fetch isolated leads:', error);
    return res.status(500).json({ error: 'Internal server error while fetching leads.' });
  }
});

// ONBOARDING SAVE ENDPOINT
app.put('/api/clients/:id/settings', async (req, res) => {
  const { id } = req.params; // This is the tenantId / client_id
  const { industry, botName, themeColor, companyWebsite, businessName } = req.body;
  
  try {
    // 🔥 FIXED: Changed prisma.onboarding_settings to prisma.onboardingSettings
    const settings = await prisma.onboardingSettings.upsert({
      where: { client_id: id },
      update: { 
        botName: botName,
        themeColor: themeColor,
        companyWebsite: companyWebsite,
        businessName: businessName,
        onboardingCompleted: true
      },
      create: {
        client_id: id,
        botName: botName,
        themeColor: themeColor,
        companyWebsite: companyWebsite,
        businessName: businessName,
        onboardingCompleted: true
      }
    });

    res.status(200).json({ success: true, settings });
  } catch (error) {
    console.error("Settings Update Failed:", error);
    res.status(500).json({ error: "Failed to save onboarding config" });
  }
});

// ── GET ORGANIZATION PROFILE ───────────────────────────────────────
app.get('/api/organizations/:id', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
    res.status(200).json(org);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch organization" });
  }
});

// server.js - FETCH ONBOARDING SETTINGS FOR DASHBOARD
app.get('/api/clients/:id/settings', async (req, res) => {
  const { id } = req.params;
  
  try {
    const settings = await prisma.onboardingSettings.findUnique({
      where: { client_id: id }
    });
    
    if (!settings) {
      return res.status(404).json({ error: "Settings not found" });
    }
    
    res.status(200).json(settings);
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    res.status(500).json({ error: "Failed to fetch onboarding config" });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🚀 VettoChat running securely on port ${PORT}`));