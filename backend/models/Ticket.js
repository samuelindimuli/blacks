const { dbRun, dbGet, dbAll } = require('../database');
const QRCode = require('qrcode');
const crypto = require('crypto');

class Ticket {
  static generateTicketId() {
    return 'TKT-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  static async generateQRCode(ticketId) {
    try {
      const qrCodeData = await QRCode.toDataURL(ticketId);
      return qrCodeData;
    } catch (err) {
      console.error('Error generating QR code:', err);
      return null;
    }
  }

  static async createMultiple(orderId, eventId, count) {
    const ticketIds = [];
    
    for (let i = 0; i < count; i++) {
      const ticketId = this.generateTicketId();
      const qrCode = await this.generateQRCode(ticketId);
      
      const sql = `
        INSERT INTO tickets (ticket_id, order_id, event_id, qr_code, status)
        VALUES (?, ?, ?, ?, 'UNUSED')
      `;
      await dbRun(sql, [ticketId, orderId, eventId, qrCode]);
      ticketIds.push(ticketId);
    }

    return ticketIds;
  }

  static async getById(ticketId) {
    const sql = 'SELECT * FROM tickets WHERE ticket_id = ?';
    return dbGet(sql, [ticketId]);
  }

  static async getByOrder(orderId) {
    const sql = 'SELECT * FROM tickets WHERE order_id = ? ORDER BY created_at DESC';
    return dbAll(sql, [orderId]);
  }

  static async getByEvent(eventId) {
    const sql = 'SELECT * FROM tickets WHERE event_id = ? ORDER BY created_at DESC';
    return dbAll(sql, [eventId]);
  }

  static async markAsUsed(ticketId) {
    const sql = 'UPDATE tickets SET status = "USED", used_at = CURRENT_TIMESTAMP WHERE ticket_id = ?';
    await dbRun(sql, [ticketId]);
  }

  static async getUnused(eventId) {
    const sql = 'SELECT * FROM tickets WHERE event_id = ? AND status = "UNUSED" ORDER BY created_at DESC';
    return dbAll(sql, [eventId]);
  }

  static async getUsed(eventId) {
    const sql = 'SELECT * FROM tickets WHERE event_id = ? AND status = "USED" ORDER BY used_at DESC';
    return dbAll(sql, [eventId]);
  }

  static async countByStatus(eventId, status) {
    const sql = 'SELECT COUNT(*) as count FROM tickets WHERE event_id = ? AND status = ?';
    const result = await dbGet(sql, [eventId, status]);
    return result?.count || 0;
  }

  static async getAnalytics(eventId) {
    const sql = `
      SELECT 
        status,
        COUNT(*) as count,
        SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) as scanned_count
      FROM tickets 
      WHERE event_id = ?
      GROUP BY status
    `;
    return dbAll(sql, [eventId]);
  }
}

module.exports = Ticket;
