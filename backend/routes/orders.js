const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Ticket = require('../models/Ticket');

// Create a new order
router.post('/create', async (req, res) => {
  try {
    const { eventId, amount, phone, ticketsCount, ticketType } = req.body;

    if (!eventId || !amount || !phone || !ticketsCount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate phone number (Kenya format)
    if (!/^(254|\+254|0)[17][0-9]{8}$/.test(phone.replace(/\s/g, ''))) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const orderId = await Order.create(eventId, amount, phone, ticketsCount, ticketType);

    res.json({
      success: true,
      orderId,
      message: 'Order created. Awaiting payment confirmation.'
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get order details
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.getById(orderId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const tickets = await Ticket.getByOrder(orderId);
    
    res.json({
      ...order,
      tickets
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all orders
router.get('/', async (req, res) => {
  try {
    const orders = await Order.getAll();
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get orders by event
router.get('/event/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const orders = await Order.getByEvent(eventId);
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get orders by status
router.get('/status/:status', async (req, res) => {
  try {
    const { status } = req.params;
    let orders;

    switch (status.toUpperCase()) {
      case 'PENDING':
        orders = await Order.getPending();
        break;
      case 'CONFIRMED':
        orders = await Order.getConfirmed();
        break;
      case 'FAILED':
        orders = await Order.getFailed();
        break;
      default:
        return res.status(400).json({ error: 'Invalid status' });
    }

    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get orders by phone
router.get('/phone/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const orders = await Order.getByPhone(phone);
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
