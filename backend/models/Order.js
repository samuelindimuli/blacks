const { dbRun, dbGet, dbAll } = require('../database');
const crypto = require('crypto');

class Order {
  static generateOrderId() {
    return 'ORD-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  static async create(eventId, amount, phone, ticketsCount, ticketType = 'General') {
    const orderId = this.generateOrderId();
    const sql = `
      INSERT INTO orders (order_id, event_id, amount, phone, tickets_count, ticket_type, status)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
    `;
    await dbRun(sql, [orderId, eventId, amount, phone, ticketsCount, ticketType]);
    return orderId;
  }

  static async getById(orderId) {
    const sql = 'SELECT * FROM orders WHERE order_id = ?';
    return dbGet(sql, [orderId]);
  }

  static async getByCheckoutRequestId(checkoutRequestId) {
    const sql = 'SELECT * FROM orders WHERE checkout_request_id = ?';
    return dbGet(sql, [checkoutRequestId]);
  }

  static async updateCheckoutRequestId(orderId, checkoutRequestId) {
    const sql = 'UPDATE orders SET checkout_request_id = ? WHERE order_id = ?';
    await dbRun(sql, [checkoutRequestId, orderId]);
  }

  static async updateStatus(orderId, status, mpesaReceipt = null, mpesaTransactionId = null) {
    let sql = 'UPDATE orders SET status = ?';
    const params = [status];

    if (status === 'CONFIRMED') {
      sql += ', confirmed_at = CURRENT_TIMESTAMP';
      if (mpesaReceipt) {
        sql += ', mpesa_receipt = ?';
        params.push(mpesaReceipt);
      }
      if (mpesaTransactionId) {
        sql += ', mpesa_transaction_id = ?';
        params.push(mpesaTransactionId);
      }
    } else if (status === 'FAILED') {
      sql += ', failed_at = CURRENT_TIMESTAMP';
    }

    sql += ' WHERE order_id = ?';
    params.push(orderId);

    await dbRun(sql, params);
  }

  static async getByEvent(eventId) {
    const sql = 'SELECT * FROM orders WHERE event_id = ? ORDER BY created_at DESC';
    return dbAll(sql, [eventId]);
  }

  static async getAll() {
    const sql = 'SELECT * FROM orders ORDER BY created_at DESC';
    return dbAll(sql);
  }

  static async getByPhone(phone) {
    const sql = 'SELECT * FROM orders WHERE phone = ? ORDER BY created_at DESC';
    return dbAll(sql, [phone]);
  }

  static async getPending() {
    const sql = 'SELECT * FROM orders WHERE status = "PENDING" ORDER BY created_at DESC';
    return dbAll(sql);
  }

  static async getConfirmed() {
    const sql = 'SELECT * FROM orders WHERE status = "CONFIRMED" ORDER BY created_at DESC';
    return dbAll(sql);
  }

  static async getFailed() {
    const sql = 'SELECT * FROM orders WHERE status = "FAILED" ORDER BY created_at DESC';
    return dbAll(sql);
  }
}

module.exports = Order;
