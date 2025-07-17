const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, param, validationResult } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Helper to validate input
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

/**
 * POST /viewing-requests
 * Student books a viewing appointment
 */
router.post('/', authenticateToken, authorizeRoles('student'), [
  body('propertyId').isInt(),
  body('scheduledAt').isISO8601().toDate(),
], handleValidation, async (req, res) => {
  const { propertyId, scheduledAt } = req.body;

  try {
    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const request = await prisma.viewingRequest.create({
      data: {
        propertyId,
        studentId: req.user.id,
        scheduledAt,
        status: 'pending',
      },
    });

    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create viewing request' });
  }
});

/**
 * GET /viewing-requests
 * Landlord sees requests for own properties, student sees their bookings
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    let requests;

    if (req.user.role === 'landlord') {
      // Fetch properties owned by landlord
      const properties = await prisma.property.findMany({
        where: { landlordId: req.user.id },
        select: { id: true },
      });
      const propertyIds = properties.map(p => p.id);

      requests = await prisma.viewingRequest.findMany({
        where: { propertyId: { in: propertyIds } },
        include: {
          property: true,
          student: { select: { id: true, name: true, email: true } },
        },
        orderBy: { scheduledAt: 'asc' },
      });

    } else if (req.user.role === 'student') {
      // Fetch bookings made by student
      requests = await prisma.viewingRequest.findMany({
        where: { studentId: req.user.id },
        include: {
          property: { include: { landlord: true } },
        },
        orderBy: { scheduledAt: 'asc' },
      });
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch viewing requests' });
  }
});

/**
 * PUT /viewing-requests/:id
 * Landlord confirms or declines a request
 */
router.put('/:id', authenticateToken, authorizeRoles('landlord'), [
  param('id').isInt(),
  body('status').isIn(['confirmed', 'declined']),
], handleValidation, async (req, res) => {
  const requestId = parseInt(req.params.id);
  const { status } = req.body;

  try {
    const request = await prisma.viewingRequest.findUnique({
      where: { id: requestId },
      include: { property: true },
    });

    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.property.landlordId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this request' });
    }

    const updated = await prisma.viewingRequest.update({
      where: { id: requestId },
      data: { status },
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update request' });
  }
});

/**
 * DELETE /viewing-requests/:id
 * Cancel request (by student or landlord)
 */
router.delete('/:id', authenticateToken, [
  param('id').isInt(),
], handleValidation, async (req, res) => {
  const requestId = parseInt(req.params.id);

  try {
    const request = await prisma.viewingRequest.findUnique({
      where: { id: requestId },
      include: { property: true },
    });

    if (!request) return res.status(404).json({ error: 'Request not found' });

    const isOwner = req.user.id === request.studentId;
    const isLandlord = req.user.id === request.property.landlordId;

    if (!isOwner && !isLandlord) {
      return res.status(403).json({ error: 'Not authorized to cancel this request' });
    }

    await prisma.viewingRequest.delete({ where: { id: requestId } });
    res.json({ message: 'Viewing request cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel request' });
  }
});

module.exports = router;
