// Frontend integration helper for ticketing system

const API_BASE = (typeof window !== 'undefined' && window.EC_CONFIG?.apiBaseUrl)
  || process.env.API_BASE_URL
  || 'http://localhost:3000/api';

const ADMIN_TOKEN = (typeof window !== 'undefined' && window.EC_CONFIG?.adminToken)
  || process.env.ADMIN_TOKEN
  || 'enjoyment-admin-token';

class TicketingClient {
  // Create new order
  static async createOrder(eventId, amount, phone, ticketsCount, ticketType = 'General') {
    try {
      const response = await fetch(`${API_BASE}/orders/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          eventId,
          amount,
          phone,
          ticketsCount,
          ticketType
        })
      });
      return await response.json();
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  }

  // Initiate M-Pesa payment
  static async initiatePayment(orderId, amount, phone) {
    try {
      const response = await fetch(`${API_BASE}/mpesa/stk-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orderId,
          amount,
          phone
        })
      });
      return await response.json();
    } catch (error) {
      console.error('Error initiating payment:', error);
      throw error;
    }
  }

  // Check payment status
  static async checkPaymentStatus(orderId) {
    try {
      const response = await fetch(`${API_BASE}/mpesa/status/${orderId}`);
      return await response.json();
    } catch (error) {
      console.error('Error checking payment status:', error);
      throw error;
    }
  }

  // Get order details with tickets
  static async getOrder(orderId) {
    try {
      const response = await fetch(`${API_BASE}/orders/${orderId}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching order:', error);
      throw error;
    }
  }

  // Get tickets for an order
  static async getOrderTickets(orderId) {
    try {
      const response = await fetch(`${API_BASE}/tickets/order/${orderId}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching tickets:', error);
      throw error;
    }
  }

  // Mark ticket as used (scan QR code)
  static async useTicket(ticketId) {
    try {
      const response = await fetch(`${API_BASE}/tickets/${ticketId}/use`, {
        method: 'POST',
        headers: { 'x-admin-token': ADMIN_TOKEN }
      });
      return await response.json();
    } catch (error) {
      console.error('Error using ticket:', error);
      throw error;
    }
  }

  // Get event analytics
  static async getEventAnalytics(eventId) {
    try {
      const response = await fetch(`${API_BASE}/analytics/event/${eventId}`, {
        headers: { 'x-admin-token': ADMIN_TOKEN }
      });
      return await response.json();
    } catch (error) {
      console.error('Error fetching analytics:', error);
      throw error;
    }
  }

  // Get all events analytics
  static async getAllAnalytics() {
    try {
      const response = await fetch(`${API_BASE}/analytics`, {
        headers: { 'x-admin-token': ADMIN_TOKEN }
      });
      return await response.json();
    } catch (error) {
      console.error('Error fetching all analytics:', error);
      throw error;
    }
  }

  // Get conversion rate
  static async getConversionRate(eventId) {
    try {
      const response = await fetch(`${API_BASE}/analytics/conversion/${eventId}`, {
        headers: { 'x-admin-token': ADMIN_TOKEN }
      });
      return await response.json();
    } catch (error) {
      console.error('Error fetching conversion rate:', error);
      throw error;
    }
  }
}

// Example usage:
/*
// Step 1: Create order
const order = await TicketingClient.createOrder('event-1', 500, '0791615005', 2, 'General');
console.log('Order created:', order.orderId);

// Step 2: Initiate payment
const payment = await TicketingClient.initiatePayment(order.orderId, 500, '0791615005');
console.log('Payment initiated:', payment.requestId);

// Step 3: Poll for payment status
let attempts = 0;
const checkStatus = setInterval(async () => {
  const status = await TicketingClient.checkPaymentStatus(order.orderId);
  console.log('Payment status:', status.status);
  
  if (status.status === 'CONFIRMED' || attempts > 30) {
    clearInterval(checkStatus);
    
    if (status.status === 'CONFIRMED') {
      // Get tickets
      const tickets = await TicketingClient.getOrderTickets(order.orderId);
      console.log('Tickets:', tickets);
    }
  }
  attempts++;
}, 2000); // Check every 2 seconds

// Step 4: Get analytics
const analytics = await TicketingClient.getEventAnalytics('event-1');
console.log('Analytics:', analytics);

// Step 5: Mark ticket as used
const ticketUsed = await TicketingClient.useTicket('TKT-xxx');
console.log('Ticket marked as used:', ticketUsed);
*/
