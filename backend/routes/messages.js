const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @swagger
 * /chat/conversations:
 *   get:
 *     summary: List all conversations for the logged-in user
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of conversations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       401:
 *         description: Unauthorized
 */
router.get('/conversations', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ studentId: userId }, { landlordId: userId }],
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1, // Latest message preview
        },
        student: { select: { id: true, name: true, email: true } },
        landlord: { select: { id: true, name: true, email: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(conversations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /chat/messages:
 *   get:
 *     summary: Get messages in a conversation
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: conversationId
 *         schema:
 *           type: integer
 *         required: true
 *         description: Conversation ID
 *     responses:
 *       200:
 *         description: List of messages
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       400:
 *         description: conversationId is required
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 */
router.get('/messages', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const conversationId = parseInt(req.query.conversationId);

  if (!conversationId) return res.status(400).json({ error: 'conversationId is required' });

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation || (conversation.studentId !== userId && conversation.landlordId !== userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /chat/messages:
 *   post:
 *     summary: Send a message in a conversation or start a new one
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - recipientId
 *               - content
 *             properties:
 *               recipientId:
 *                 type: string
 *                 description: User ID of the recipient
 *               content:
 *                 type: string
 *                 description: Message content
 *     responses:
 *       201:
 *         description: Message sent
 *       400:
 *         description: Recipient and content required, or invalid recipient/roles
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/messages', authenticateToken, async (req, res) => {
  const senderId = req.user.id;
  const { recipientId, content } = req.body;

  if (!recipientId || !content) {
    return res.status(400).json({ error: 'Recipient and content required' });
  }

  try {
    const recipient = await prisma.user.findUnique({ where: { id: recipientId } });
    if (!recipient || recipient.id === senderId) {
      return res.status(400).json({ error: 'Invalid recipient' });
    }

    // Determine roles
    let studentId, landlordId;
    if (req.user.role === 'student' && recipient.role === 'landlord') {
      studentId = senderId;
      landlordId = recipientId;
    } else if (req.user.role === 'landlord' && recipient.role === 'student') {
      studentId = recipientId;
      landlordId = senderId;
    } else {
      return res.status(400).json({ error: 'Messages only allowed between students and landlords' });
    }

    // Find or create conversation
    let conversation = await prisma.conversation.upsert({
      where: {
        studentId_landlordId: { studentId, landlordId },
      },
      update: {},
      create: { studentId, landlordId },
    });

    // Create message
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId,
        content,
      },
    });

    res.status(201).json({ message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
