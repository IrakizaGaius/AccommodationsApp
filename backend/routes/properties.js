const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, param, query, validationResult } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const prisma = new PrismaClient();
const router = express.Router();

// Helpers
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

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
