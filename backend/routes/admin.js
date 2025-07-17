const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /admin/listings/pending
 * List all properties pending approval
 */
router.get('/admin/listings/pending', [authenticateToken, authorizeRoles('admin')], async (req, res) => {
  try {
    const listings = await prisma.property.findMany({
      where: { status: 'PENDING' },
      include: { landlord: { select: { id: true, name: true, email: true } } },
    });
    res.json(listings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending listings' });
  }
});

/**
 * PUT /admin/listings/:id/approve
 */
router.put('/admin/listings/:id/approve', [authenticateToken, authorizeRoles('admin')], async (req, res) => {
  const propertyId = parseInt(req.params.id);
  try {
    await prisma.property.update({
      where: { id: propertyId },
      data: { status: 'APPROVED' },
    });
    res.json({ message: 'Listing approved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve listing' });
  }
});

/**
 * PUT /admin/listings/:id/decline
 */
router.put('/admin/listings/:id/decline', [authenticateToken, authorizeRoles('admin')], async (req, res) => {
  const propertyId = parseInt(req.params.id);
  try {
    await prisma.property.update({
      where: { id: propertyId },
      data: { status: 'DECLINED' },
    });
    res.json({ message: 'Listing declined' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to decline listing' });
  }
});

/**
 * GET /admin/users/spam
 * Flagged users (based on reports or moderation)
 */
router.get('/admin/users/spam', [authenticateToken, authorizeRoles('admin')], async (req, res) => {
  try {
    const spamUsers = await prisma.user.findMany({
      where: { isFlagged: true },
      select: { id: true, email: true, name: true, role: true },
    });
    res.json(spamUsers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch spam users' });
  }
});

/**
 * DELETE /admin/users/:id
 */
router.delete('/admin/users/:id', [authenticateToken, authorizeRoles('admin')], async (req, res) => {
  const userId = parseInt(req.params.id);
  try {
    await prisma.user.delete({ where: { id: userId } });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * GET /admin/analytics
 * Dashboard data: user count, top properties, messages, bookings etc.
 */
router.get('/admin/analytics', [authenticateToken, authorizeRoles('admin')], async (req, res) => {
  try {
    const [userCount, propertyCount, bookingCount, messageCount, topListings] = await Promise.all([
      prisma.user.count(),
      prisma.property.count(),
      prisma.viewingRequest.count(),
      prisma.message.count(),
      prisma.property.findMany({
        orderBy: { reviews: { _count: 'desc' } },
        take: 5,
        include: { reviews: true },
      }),
    ]);

    res.json({
      users: userCount,
      properties: propertyCount,
      bookings: bookingCount,
      messages: messageCount,
      topListings,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

module.exports = router;
