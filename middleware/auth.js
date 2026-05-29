// ── AUTH GUARD MIDDLEWARE (Updated for ES256) ────────────────────────────────
const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Ping Supabase directly to validate the token and get the user
    const response = await fetch('https://xneegnjcegsfkyvonziy.supabase.co/auth/v1/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuZWVnbmpjZWdzZmt5dm9ueml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjY4MzYsImV4cCI6MjA5NTI0MjgzNn0.nlVF9eI7p5Lmnl9u16YghtlyKmLmm9Y7HUjQfmcmSrE'
      }
    });

    if (!response.ok) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    const user = await response.json();
    req.user = { id: user.id, email: user.email };
    next(); 
  } catch (error) {
    return res.status(500).json({ error: 'Auth service unreachable.' });
  }
};

module.exports = { requireAuth };