const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'enjoymentclan.db');
const db = new sqlite3.Database(dbPath);

// Promisify database methods
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const initializeDatabase = () => {
  // Create Orders table
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT UNIQUE NOT NULL,
      event_id TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      amount REAL NOT NULL,
      phone TEXT NOT NULL,
      mpesa_receipt TEXT,
      mpesa_transaction_id TEXT,
      tickets_count INTEGER NOT NULL,
      ticket_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME,
      failed_at DATETIME,
      FOREIGN KEY (event_id) REFERENCES events(id)
    )
  `);

  // Create Tickets table
  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT UNIQUE NOT NULL,
      order_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      status TEXT DEFAULT 'UNUSED',
      qr_code TEXT UNIQUE,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(order_id),
      FOREIGN KEY (event_id) REFERENCES events(id)
    )
  `);

  // Create Events table (if not exists)
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      location TEXT,
      price_per_ticket REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create M-Pesa Logs table for debugging
  db.run(`
    CREATE TABLE IF NOT EXISTS mpesa_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT,
      phone TEXT,
      amount REAL,
      transaction_id TEXT,
      status TEXT,
      response_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('✅ Database initialized successfully');
};

module.exports = {
  db,
  dbRun,
  dbGet,
  dbAll,
  initializeDatabase
};
