const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /conversations
 * List all conversations for the logged-in user
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
 * GET /messages?conversationId=123
 * Get messages in a conversation
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
 * POST /messages
 * Send a message in a conversation or start new one
 * { recipientId, content }
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
