const jwt = require('jsonwebtoken');

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Check if the Authorization header exists and follows the Bearer schema
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify the token using your Supabase JWT Secret
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
    
    // Supabase stores the unique User ID inside the 'sub' (subject) claim of the JWT
    req.user = {
      id: decoded.sub,
      email: decoded.email
    };

    next(); // Token is valid, proceed to the route handler
  } catch (error) {
    console.error('Security Alert: Invalid or expired token attempted:', error.message);
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

module.exports = { requireAuth };