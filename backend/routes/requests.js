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
 * @swagger
 * /viewing-requests:
 *   post:
 *     summary: Book a viewing appointment (student only)
 *     tags: [ViewingRequests]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - propertyId
 *               - scheduledAt
 *             properties:
 *               propertyId:
 *                 type: integer
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Viewing request created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Property not found
 *       500:
 *         description: Failed to create viewing request
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
 * @swagger
 * /viewing-requests:
 *   get:
 *     summary: Get viewing requests (landlord sees requests for own properties, student sees their bookings)
 *     tags: [ViewingRequests]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of viewing requests
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Failed to fetch viewing requests
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
 * @swagger
 * /viewing-requests/{id}:
 *   put:
 *     summary: Confirm or decline a viewing request (landlord only)
 *     tags: [ViewingRequests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Viewing request ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [confirmed, declined]
 *     responses:
 *       200:
 *         description: Viewing request updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to update this request
 *       404:
 *         description: Request not found
 *       500:
 *         description: Failed to update request
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
 * @swagger
 * /viewing-requests/{id}:
 *   delete:
 *     summary: Cancel a viewing request (by student or landlord)
 *     tags: [ViewingRequests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Viewing request ID
 *     responses:
 *       200:
 *         description: Viewing request cancelled
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to cancel this request
 *       404:
 *         description: Request not found
 *       500:
 *         description: Failed to cancel request
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
