const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const prisma = new PrismaClient();
const router = express.Router();

/**
 * POST /reviews
 * Students leave a review on a property and landlord
 */
router.post(
  '/',
  authenticateToken,
  authorizeRoles('student'),
  [
    body('propertyId').isInt(),
    body('landlordId').isInt(),
    body('rating').isFloat({ min: 1, max: 5 }),
    body('comment').optional().isString().isLength({ max: 1000 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { propertyId, landlordId, rating, comment } = req.body;
    const studentId = req.user.id;

    try {
      // Prevent self-reviews
      const property = await prisma.property.findUnique({ where: { id: propertyId } });
      if (!property) return res.status(404).json({ error: 'Property not found' });
      if (property.landlordId === studentId) return res.status(403).json({ error: 'You cannot review your own listing' });

      // Check for duplicate review
      const existing = await prisma.review.findFirst({
        where: {
          studentId,
          propertyId,
        },
      });
      if (existing) return res.status(409).json({ error: 'You already reviewed this property' });

      // Create review
      const review = await prisma.review.create({
        data: {
          propertyId,
          landlordId,
          studentId,
          rating,
          comment,
        },
      });

      res.status(201).json({ message: 'Review submitted', review });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * GET /properties/:id/reviews
 * List reviews for a property
 */
router.get('/properties/:id/reviews', async (req, res) => {
  const propertyId = parseInt(req.params.id);

  try {
    const reviews = await prisma.review.findMany({
      where: { propertyId },
      include: {
        student: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ propertyId, reviews });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /landlords/:id/reviews
 * List reviews for a landlord
 */
router.get('/landlords/:id/reviews', async (req, res) => {
  const landlordId = parseInt(req.params.id);

  try {
    const reviews = await prisma.review.findMany({
      where: { landlordId },
      include: {
        student: {
          select: { id: true, name: true },
        },
        property: {
          select: { id: true, title: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ landlordId, reviews });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
