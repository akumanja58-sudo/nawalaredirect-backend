const express = require('express');
const bcrypt = require('bcryptjs');
const { generateToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(
  process.env.ADMIN_PASSWORD || 'admin123', 
  10
);

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'Username dan password wajib diisi' 
    });
  }

  if (username !== ADMIN_USERNAME) {
    return res.status(401).json({ 
      success: false, 
      error: 'Username atau password salah' 
    });
  }

  const isValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!isValid) {
    return res.status(401).json({ 
      success: false, 
      error: 'Username atau password salah' 
    });
  }

  const token = generateToken({ username, role: 'admin' });
  
  res.json({ 
    success: true, 
    token,
    user: { username, role: 'admin' }
  });
});

// GET /api/auth/verify
router.get('/verify', authMiddleware, (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = router;
