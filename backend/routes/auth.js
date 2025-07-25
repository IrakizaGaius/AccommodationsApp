const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { sendVerificationEmail } = require('../utils/email');
const jwt = require('jsonwebtoken');

const {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} = require('../utils/auth');

const prisma = new PrismaClient();

const passwordValidator = body('password')
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters long')
  .matches(/[a-z]/)
  .withMessage('Password must contain at least one lowercase letter')
  .matches(/[A-Z]/)
  .withMessage('Password must contain at least one uppercase letter')
  .matches(/\d/)
  .withMessage('Password must contain at least one number')
  .matches(/[!@#$%^&*(),.?":{}|<>]/)
  .withMessage('Password must contain at least one special character');

router.post('/signup', [
  body('email').isEmail().withMessage('Invalid email'),
  passwordValidator,
  body('role').isIn(['STUDENT', 'LANDLORD', 'ADMIN']).withMessage('Invalid role'),
  body('name').optional().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password, role, name } = req.body;
  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'Email already in use' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash: hashedPassword, role, name, isVerified: false },
    });
    // Generate verification token
    const token = jwt.sign({ userId: user.id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    await sendVerificationEmail(user.email, token);

    res.status(201).json({ message: 'User created. Please verify your email.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/verify', async (req, res) => {
  try {
    const { token } = req.query;
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    await prisma.user.update({
      where: { id: payload.userId },
      data: { isVerified: true },
    });

    res.send('Email verified successfully!');
  } catch (err) {
    console.error(err);
    res.status(400).send('Invalid or expired verification link.');
  }
});

router.post('/login', [
  body('email').isEmail(),
  body('password').exists(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Validation errors:', errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log('User not found for email:', email);
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    if (!user.isVerified) {
      console.log('User email not verified:', email);
      return res.status(403).json({ error: 'Email not verified' });
    }

    // Check your actual DB field for hashed password (e.g., user.passwordHash)
    const hashedPasswordField = user.passwordHash || user.password;
    if (!hashedPasswordField) {
      console.log('Password hash missing for user:', email);
      return res.status(500).json({ error: 'Internal server error' });
    }

    const validPassword = await bcrypt.compare(password, hashedPasswordField);
    if (!validPassword) {
      console.log('Invalid password attempt for:', email);
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: false, sameSite: 'strict' });
    res.json({ accessToken, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh token route
router.post('/auth/refresh-token', (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.sendStatus(401);

  try {
    const user = verifyToken(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const accessToken = generateAccessToken(user);
    res.json({ accessToken });
  } catch (err) {
    res.sendStatus(403);
  }
});

// Google OAuth routes
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login', session: false }),
  (req, res) => {
    // Successful login
    const accessToken = generateAccessToken(req.user);
    const refreshToken = generateRefreshToken(req.user);

    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: false, sameSite: 'strict' });

    // Redirect to frontend with tokens (or send tokens in JSON, depends on your client)
    res.redirect(`http://localhost:3000/oauth-success?accessToken=${accessToken}`);
  }
);

// Logout route
router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out' });
});

module.exports = router;