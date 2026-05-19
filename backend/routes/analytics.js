const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Ticket = require('../models/Ticket');
const { dbGet, dbAll } = require('../database');

// Get analytics for a specific event
router.get('/event/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;

    // Get orders data
    const orders = await Order.getByEvent(eventId);
    const totalOrders = orders.length;
    const confirmedOrders = orders.filter(o => o.status === 'CONFIRMED').length;
    const pendingOrders = orders.filter(o => o.status === 'PENDING').length;
    const failedOrders = orders.filter(o => o.status === 'FAILED').length;

    // Revenue calculation
    const totalRevenue = orders
      .filter(o => o.status === 'CONFIRMED')
      .reduce((sum, o) => sum + o.amount, 0);

    // Get tickets data
    const unusedCount = await Ticket.countByStatus(eventId, 'UNUSED');
    const usedCount = await Ticket.countByStatus(eventId, 'USED');
    const totalTickets = unusedCount + usedCount;

    // Detailed orders breakdown
    const ordersByStatus = {
      PENDING: orders.filter(o => o.status === 'PENDING'),
      CONFIRMED: orders.filter(o => o.status === 'CONFIRMED'),
      FAILED: orders.filter(o => o.status === 'FAILED')
    };

    // Ticket analytics by type
    const ticketsByType = {};
    orders.forEach(order => {
      if (!ticketsByType[order.ticket_type]) {
        ticketsByType[order.ticket_type] = 0;
      }
      ticketsByType[order.ticket_type] += order.tickets_count;
    });

    res.json({
      event: {
        eventId,
        totalOrders,
        confirmedOrders,
        pendingOrders,
        failedOrders
      },
      revenue: {
        total: totalRevenue,
        average: confirmedOrders > 0 ? totalRevenue / confirmedOrders : 0,
        byStatus: {
          PENDING: orders
            .filter(o => o.status === 'PENDING')
            .reduce((sum, o) => sum + o.amount, 0),
          CONFIRMED: orders
            .filter(o => o.status === 'CONFIRMED')
            .reduce((sum, o) => sum + o.amount, 0),
          FAILED: orders
            .filter(o => o.status === 'FAILED')
            .reduce((sum, o) => sum + o.amount, 0)
        }
      },
      tickets: {
        total: totalTickets,
        unused: unusedCount,
        used: usedCount,
        usageRate: totalTickets > 0 ? ((usedCount / totalTickets) * 100).toFixed(2) + '%' : '0%',
        byType: ticketsByType
      },
      orders: ordersByStatus
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all events analytics
router.get('/', async (req, res) => {
  try {
    const orders = await Order.getAll();
    
    // Group by event
    const eventAnalytics = {};

    for (const order of orders) {
      if (!eventAnalytics[order.event_id]) {
        eventAnalytics[order.event_id] = {
          eventId: order.event_id,
          totalOrders: 0,
          confirmedOrders: 0,
          pendingOrders: 0,
          failedOrders: 0,
          totalRevenue: 0,
          confirmedRevenue: 0,
          totalTickets: 0
        };
      }

      eventAnalytics[order.event_id].totalOrders++;

      if (order.status === 'CONFIRMED') {
        eventAnalytics[order.event_id].confirmedOrders++;
        eventAnalytics[order.event_id].confirmedRevenue += order.amount;
      } else if (order.status === 'PENDING') {
        eventAnalytics[order.event_id].pendingOrders++;
      } else if (order.status === 'FAILED') {
        eventAnalytics[order.event_id].failedOrders++;
      }

      eventAnalytics[order.event_id].totalRevenue += order.amount;
      eventAnalytics[order.event_id].totalTickets += order.tickets_count;
    }

    res.json({
      summary: {
        totalEvents: Object.keys(eventAnalytics).length,
        totalOrders: orders.length,
        confirmedOrders: orders.filter(o => o.status === 'CONFIRMED').length,
        totalRevenue: orders
          .filter(o => o.status === 'CONFIRMED')
          .reduce((sum, o) => sum + o.amount, 0)
      },
      byEvent: Object.values(eventAnalytics)
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get order conversion analysis
router.get('/conversion/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const orders = await Order.getByEvent(eventId);

    const conversionData = {
      total: orders.length,
      byStatus: {
        PENDING: orders.filter(o => o.status === 'PENDING').length,
        CONFIRMED: orders.filter(o => o.status === 'CONFIRMED').length,
        FAILED: orders.filter(o => o.status === 'FAILED').length
      },
      conversionRate: orders.length > 0 
        ? ((orders.filter(o => o.status === 'CONFIRMED').length / orders.length) * 100).toFixed(2) + '%'
        : '0%'
    };

    res.json(conversionData);
  } catch (error) {
    console.error('Error fetching conversion data:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
