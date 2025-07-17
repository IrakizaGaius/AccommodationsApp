const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /saved-properties/:propertyId
 * Bookmark/save a property
 */
router.post('/:propertyId', authenticateToken, authorizeRoles('student'), async (req, res) => {
  const userId = req.user.id;
  const propertyId = parseInt(req.params.propertyId);

  try {
    // Check if property exists
    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) return res.status(404).json({ error: 'Property not found' });

    // Check for duplicate
    const exists = await prisma.savedProperties.findUnique({
      where: {
        userId_propertyId: {
          userId,
          propertyId,
        },
      },
    });

    if (exists) return res.status(409).json({ error: 'Property already saved' });

    const saved = await prisma.savedProperties.create({
      data: {
        userId,
        propertyId,
      },
    });

    res.status(201).json({ message: 'Property saved', saved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /saved-properties
 * List saved properties for the student
 */
router.get('/', authenticateToken, authorizeRoles('student'), async (req, res) => {
  const userId = req.user.id;

  try {
    const saved = await prisma.savedProperties.findMany({
      where: { userId },
      include: {
        property: {
          include: {
            media: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(saved.map(item => item.property));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /saved-properties/:propertyId
 * Remove bookmark
 */
router.delete('/:propertyId', authenticateToken, authorizeRoles('student'), async (req, res) => {
  const userId = req.user.id;
  const propertyId = parseInt(req.params.propertyId);

  try {
    await prisma.savedProperties.delete({
      where: {
        userId_propertyId: {
          userId,
          propertyId,
        },
      },
    });

    res.json({ message: 'Property removed from saved list' });
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Saved property not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
