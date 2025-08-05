const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, param, query, validationResult } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const prisma = new PrismaClient();
const router = express.Router();


const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

/**
 * @swagger
 * /properties:
 *   get:
 *     summary: Search and filter properties
 *     tags: [Properties]
 *     parameters:
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         required: false
 *         description: Location to search
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         required: false
 *         description: Minimum price
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         required: false
 *         description: Maximum price
 *       - in: query
 *         name: roomType
 *         schema:
 *           type: string
 *         required: false
 *         description: Room type
 *     responses:
 *       200:
 *         description: List of properties
 *       500:
 *         description: Failed to fetch properties
 */
// GET /properties - Search & filter
router.get('/', [
  query('location').optional().isString(),
  query('minPrice').optional().isFloat(),
  query('maxPrice').optional().isFloat(),
  query('roomType').optional().isString(),
  query('distance').optional().isFloat(),
], handleValidation, async (req, res) => {
  const { location, minPrice, maxPrice, roomType } = req.query;
  try {
    const properties = await prisma.property.findMany({
      where: {
        ...(location && { location: { contains: location, mode: 'insensitive' } }),
        ...(minPrice && { price: { gte: parseFloat(minPrice) } }),
        ...(maxPrice && { price: { lte: parseFloat(maxPrice) } }),
        ...(roomType && { roomType }),
      },
      include: { media: true },
    });
    res.json(properties);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

/**
 * @swagger
 * /properties/{id}:
 *   get:
 *     summary: Get property details
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Property details
 *       404:
 *         description: Property not found
 *       500:
 *         description: Failed to fetch property
 */
// GET /properties/:id - Property details
router.get('/:id', [
  param('id').isInt(),
], handleValidation, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        media: true,
        availability: true,
        reviews: true,
      },
    });
    if (!property) return res.status(404).json({ error: 'Property not found' });
    res.json(property);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch property' });
  }
});

/**
 * @swagger
 * /properties:
 *   post:
 *     summary: Create a new property (landlord only)
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - price
 *               - roomType
 *               - location
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               roomType:
 *                 type: string
 *               location:
 *                 type: string
 *     responses:
 *       201:
 *         description: Property created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to create property
 */
router.post('/', authenticateToken, authorizeRoles('LANDLORD'), [
  body('title').isString(),
  body('description').isString(),
  body('price').isFloat({ min: 0 }),
  body('roomType').isString(),
  body('location').isString(),
], handleValidation, async (req, res) => {
  const { title, description, price, roomType, location } = req.body;
  try {
    console.log('Creating property for user:', req.user);
    const property = await prisma.property.create({
      data: {
        title,
        description,
        price,
        roomType,
        location,
        landlordId: req.user.id,
      },
    });

    res.status(201).json(property);
  } catch (err) {
    console.error('Error creating property:', err);
    res.status(500).json({ error: 'Failed to create property', details: err.message });
  }
});

/**
 * @swagger
 * /properties/{id}:
 *   put:
 *     summary: Update a property (landlord only)
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Property ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Property updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Unauthorized or property not found
 *       500:
 *         description: Failed to update property
 */
// PUT /properties/:id - Update property
router.put('/:id', authenticateToken, authorizeRoles('LANDLORD'), [
  param('id').isInt(),
], handleValidation, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property || property.landlordId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized or property not found' });
    }

    const updated = await prisma.property.update({
      where: { id },
      data: req.body,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update property' });
  }
});

/**
 * @swagger
 * /properties/{id}:
 *   delete:
 *     summary: Delete a property (landlord only)
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Property deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Unauthorized or property not found
 *       500:
 *         description: Failed to delete property
 */
// DELETE /properties/:id - Delete property
router.delete('/:id', authenticateToken, authorizeRoles('landlord'), [
  param('id').isInt(),
], handleValidation, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property || property.landlordId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized or property not found' });
    }

    await prisma.property.delete({ where: { id } });
    res.json({ message: 'Property deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete property' });
  }
});

/**
 * @swagger
 * /properties/{id}/media:
 *   post:
 *     summary: Upload media for a property (landlord only)
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Property ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *               - type
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               type:
 *                 type: string
 *                 enum: [image, video]
 *     responses:
 *       201:
 *         description: Media uploaded
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to upload media
 */
// POST /properties/:id/media - Upload images/videos
router.post('/:id/media', authenticateToken, authorizeRoles('landlord'), [
  param('id').isInt(),
  body('url').isURL(),
  body('type').isIn(['image', 'video']),
], handleValidation, async (req, res) => {
  const id = parseInt(req.params.id);
  const { url, type } = req.body;
  try {
    const media = await prisma.propertyMedia.create({
      data: {
        propertyId: id,
        url,
        type,
      },
    });
    res.status(201).json(media);
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

/**
 * @swagger
 * /properties/{id}/availability:
 *   get:
 *     summary: Get property availability
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Property ID
 *     responses:
 *       200:
 *         description: List of availability dates
 *       500:
 *         description: Failed to fetch availability
 */
// GET /properties/:id/availability - View availability
router.get('/:id/availability', [
  param('id').isInt(),
], handleValidation, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const availability = await prisma.availability.findMany({
      where: { propertyId: id },
    });
    res.json(availability);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

/**
 * @swagger
 * /properties/{id}/availability:
 *   put:
 *     summary: Update property availability (landlord only)
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Property ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               required:
 *                 - date
 *                 - isAvailable
 *               properties:
 *                 date:
 *                   type: string
 *                   format: date
 *                 isAvailable:
 *                   type: boolean
 *     responses:
 *       200:
 *         description: Availability updated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Unauthorized or property not found
 *       500:
 *         description: Failed to update availability
 */
// PUT /properties/:id/availability - Update availability
router.put('/:id/availability', authenticateToken, authorizeRoles('landlord'), [
  param('id').isInt(),
  body().isArray(),
], handleValidation, async (req, res) => {
  const id = parseInt(req.params.id);
  const availabilityArray = req.body;

  try {
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property || property.landlordId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized or property not found' });
    }

    // Delete old availability
    await prisma.availability.deleteMany({ where: { propertyId: id } });

    // Insert new availability
    await prisma.availability.createMany({
      data: availabilityArray.map(dateObj => ({
        propertyId: id,
        date: new Date(dateObj.date),
        isAvailable: dateObj.isAvailable,
      })),
    });

    res.json({ message: 'Availability updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

module.exports = router;
