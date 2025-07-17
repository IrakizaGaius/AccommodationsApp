const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin management routes
 */

/**
 * @swagger
 * /admin/listings/pending:
 *   get:
 *     summary: Get all property listings pending approval
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending properties
 */
router.get('/listings/pending', [authenticateToken, authorizeRoles('admin')], async (req, res) => {
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
 * @swagger
 * /admin/listings/{id}/approve:
 *   put:
 *     summary: Approve a specific property listing
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the property to approve
 *     responses:
 *       200:
 *         description: Listing approved successfully
 */
router.put('/listings/:id/approve', [authenticateToken, authorizeRoles('admin')], async (req, res) => {
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
 * @swagger
 * /admin/listings/{id}/decline:
 *   put:
 *     summary: Decline a specific property listing
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the property to decline
 *     responses:
 *       200:
 *         description: Listing declined successfully
 */
router.put('/listings/:id/decline', [authenticateToken, authorizeRoles('admin')], async (req, res) => {
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
 * @swagger
 * /admin/users/spam:
 *   get:
 *     summary: Get a list of flagged (spam) users
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of flagged users
 */
router.get('/users/spam', [authenticateToken, authorizeRoles('admin')], async (req, res) => {
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
 * @swagger
 * /admin/users/{id}:
 *   delete:
 *     summary: Delete a specific user by ID
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
 */
router.delete('/users/:id', [authenticateToken, authorizeRoles('admin')], async (req, res) => {
  const userId = parseInt(req.params.id);
  try {
    await prisma.user.delete({ where: { id: userId } });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * @swagger
 * /admin/analytics:
 *   get:
 *     summary: Get admin dashboard analytics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics dashboard data
 */
router.get('/analytics', [authenticateToken, authorizeRoles('admin')], async (req, res) => {
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
