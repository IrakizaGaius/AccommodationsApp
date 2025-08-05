const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @swagger
 * /saved-properties/{propertyId}:
 *   post:
 *     summary: Bookmark/save a property (student only)
 *     tags: [SavedProperties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         schema:
 *           type: integer
 *         required: true
 *         description: Property ID to save
 *     responses:
 *       201:
 *         description: Property saved
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Property not found
 *       409:
 *         description: Property already saved
 *       500:
 *         description: Internal server error
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
 * @swagger
 * /saved-properties:
 *   get:
 *     summary: List saved properties for the student
 *     tags: [SavedProperties]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of saved properties
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
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
 * @swagger
 * /saved-properties/{propertyId}:
 *   delete:
 *     summary: Remove bookmark (student only)
 *     tags: [SavedProperties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         schema:
 *           type: integer
 *         required: true
 *         description: Property ID to remove from saved list
 *     responses:
 *       200:
 *         description: Property removed from saved list
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Saved property not found
 *       500:
 *         description: Internal server error
 */
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
