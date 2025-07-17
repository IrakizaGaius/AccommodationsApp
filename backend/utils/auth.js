const jwt = require('jsonwebtoken');
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

function generateAccessToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
}

function generateRefreshToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
}

function verifyToken(token, secret) {
  return jwt.verify(token, secret);
}

module.exports = { generateAccessToken, generateRefreshToken, verifyToken };