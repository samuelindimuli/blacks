const { dbRun, dbGet, dialect } = require('../database');

class Event {
  static async ensureExists(eventId, { title, description, date, location } = {}) {
    const existing = await dbGet('SELECT id FROM events WHERE id = ?', [eventId]);
    if (existing) return;

    const eventTitle = title || eventId;
    const eventDate = date || new Date().toISOString().split('T')[0];
    const eventDescription = description || '';
    const eventLocation = location || '';

    const sql = dialect === 'postgres'
      ? `
        INSERT INTO events (id, title, description, date, location)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (id) DO NOTHING
      `
      : `
        INSERT OR IGNORE INTO events (id, title, description, date, location)
        VALUES (?, ?, ?, ?, ?)
      `;

    await dbRun(sql, [eventId, eventTitle, eventDescription, eventDate, eventLocation]);
  }
}

module.exports = Event;
