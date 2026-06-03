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

const path = require('path');

// Allow external websites to fetch your widget UI
app.get('/widget.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'widget.html'));
});

// Allow external websites to fetch your embed script
app.get('/embed.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'embed.js'));
});

// ── UNPROTECTED ENDPOINT: Lead Capture Widget ─────────────────────────────────
app.post('/api/leads/capture', async (req, res) => {
  const { companyId, fullName, phone, intent, urgency, location, budget } = req.body;

  if (!companyId) return res.status(400).json({ error: 'companyId is required' });

  try {
    // Verify the company exists — never auto-create fake clients in production
    const client = await prisma.client.findUnique({ where: { id: companyId } });
    if (!client) return res.status(404).json({ error: 'Company not found' });

    // Score the lead
    let score = 0;
    if (urgency === 'Emergency (Within 24h)' || urgency === 'Emergency (Right now)') score += 50;
    else if (urgency === 'Today' || urgency === 'This week') score += 30;
    if (intent && ['Storm Damage','Full Replacement','AC Replacement','Heater Replacement','Panel Upgrade','Generator','Emergency Leak','Pipe Replacement'].includes(intent)) score += 40;
    else if (intent && ['Leak Repair','Water Heater','Wiring / Rewire','New Installation'].includes(intent)) score += 20;

    const status = score >= 70 ? 'hot' : score >= 30 ? 'warm' : 'new';

    const lead = await prisma.lead.create({
      data: {
        client:   { connect: { id: companyId } },
        fullName: fullName || 'Unknown Visitor',
        phone:    phone    || 'No phone provided',
        intent:   intent   || 'Not specified',
        urgency:  urgency  || 'Not specified',
        location: location || '',
        budget:   budget   || '',
        score,
        status
      },
    });

    console.log(`✅ Lead captured: ${lead.fullName} | Company: ${companyId}`);
    io.emit('new_lead', lead);
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

// ── Client Lookup (protected — use JWT, not userId in URL) ───────────────────
// Old unprotected route removed. Use GET /api/clients/me instead.


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

// ONBOARDING SAVE ENDPOINT (protected)
app.put('/api/clients/:id/settings', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { industry, botName, themeColor, companyWebsite, businessName, businessPhone } = req.body;

  try {
    // Save bot/branding settings to onboarding_settings table
    const settings = await prisma.onboardingSettings.upsert({
      where: { client_id: id },
      update: {
        botName,
        themeColor,
        companyWebsite,
        ...(businessName && { businessName }),
        onboardingCompleted: true
      },
      create: {
        client_id: id,
        botName,
        themeColor,
        companyWebsite,
        ...(businessName && { businessName }),
        onboardingCompleted: true
      }
    });

    // Industry and phone live on the Client record — update them there
    const clientUpdate = {};
    if (industry)      clientUpdate.industry   = industry;
    if (businessPhone) clientUpdate.ownerPhone = businessPhone;
    if (Object.keys(clientUpdate).length) {
      await prisma.client.update({ where: { id }, data: clientUpdate });
    }

    res.status(200).json({ success: true, settings: { ...settings, industry: industry || null } });
  } catch (error) {
    console.error("Settings Update Failed:", error);
    res.status(500).json({ error: "Failed to save onboarding config" });
  }
});


// Fetch onboarding settings + industry for the dashboard
app.get('/api/clients/:id/settings', async (req, res) => {
  const { id } = req.params;

  try {
    // Join onboarding_settings with the client to get industry + businessName
    const settings = await prisma.onboardingSettings.findUnique({
      where: { client_id: id },
      include: {
        client: { select: { industry: true, businessName: true, ownerFullName: true, email: true, ownerPhone: true } }
      }
    });

    if (!settings) {
      // No onboarding record yet — return client basics so dashboard isn't blank
      const client = await prisma.client.findUnique({ where: { id } });
      if (!client) return res.status(404).json({ error: 'Client not found' });
      return res.status(200).json({
        industry:      client.industry,
        businessName:  client.businessName,
        ownerFullName: client.ownerFullName,
        ownerPhone:    client.ownerPhone,
        email:         client.email,
        botName:       null,
        themeColor:    null,
        companyWebsite: null,
        onboardingCompleted: false
      });
    }

    // Merge: onboarding fields + client fields (industry lives on client)
    const { client, ...rest } = settings;
    res.status(200).json({
      ...rest,
      industry:      client.industry,
      businessName:  rest.businessName  || client.businessName,
      ownerFullName: client.ownerFullName,
      ownerPhone:    client.ownerPhone,
      email:         client.email
    });
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    res.status(500).json({ error: "Failed to fetch onboarding config" });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🚀 VettoChat running securely on port ${PORT}`));