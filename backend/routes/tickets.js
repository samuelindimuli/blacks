const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const { requireAuth } = require('../middleware/auth');

router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const tickets = await Ticket.getByOrder(orderId);
    res.json(tickets);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/event/:eventId/unused', requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const tickets = await Ticket.getUnused(eventId);
    res.json(tickets);
  } catch (error) {
    console.error('Error fetching unused tickets:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/event/:eventId/used', requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const tickets = await Ticket.getUsed(eventId);
    res.json(tickets);
  } catch (error) {
    console.error('Error fetching used tickets:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/event/:eventId', requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const tickets = await Ticket.getByEvent(eventId);
    res.json(tickets);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:ticketId/use', requireAuth, async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await Ticket.getById(ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (ticket.status === 'USED') {
      return res.status(400).json({ error: 'Ticket already used' });
    }

    await Ticket.markAsUsed(ticketId);

    res.json({
      success: true,
      message: 'Ticket marked as used',
      ticketId
    });
  } catch (error) {
    console.error('Error marking ticket as used:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const ticket = await Ticket.getById(ticketId);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(ticket);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
