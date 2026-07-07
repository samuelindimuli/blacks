const path = require('path');

function isRailway() {
  return Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
}

function isProduction() {
  return process.env.NODE_ENV === 'production' || isRailway();
}

function resolveDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  // Railway's private hostname only resolves inside their network, not on your machine.
  if (/railway\.internal/i.test(url) && !isRailway()) {
    console.warn('⚠️  DATABASE_URL uses postgres.railway.internal, which is unreachable locally.');
    console.warn('   Falling back to local SQLite. For local Postgres, use Railway\'s public URL from the dashboard.');
    return null;
  }

  return url;
}

function toPgSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

const DATABASE_URL = resolveDatabaseUrl();
const dialect = DATABASE_URL ? 'postgres' : 'sqlite';

let db, dbRun, dbGet, dbAll, resetAutoIncrement;

if (DATABASE_URL) {
  // Use Postgres in production (Railway)
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  db = pool;

  dbRun = async (sql, params = []) => {
    const res = await pool.query(toPgSql(sql), params);
    return res;
  };

  dbGet = async (sql, params = []) => {
    const res = await pool.query(toPgSql(sql), params);
    return res.rows[0];
  };

  dbAll = async (sql, params = []) => {
    const res = await pool.query(toPgSql(sql), params);
    return res.rows;
  };

  resetAutoIncrement = async () => {
    // Postgres SERIAL sequences — optional reset after wipe; not required for correctness.
    const tables = ['orders', 'tickets', 'mpesa_logs'];
    for (const table of tables) {
      try {
        await pool.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), 1, false)`);
      } catch {
        // Table may not use a serial id; ignore.
      }
    }
  };

  const initializeDatabase = async () => {
    // Create Events table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        date TEXT NOT NULL,
        location TEXT,
        price_per_ticket REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_id TEXT UNIQUE NOT NULL,
        checkout_request_id TEXT UNIQUE,
        event_id TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        amount REAL NOT NULL,
        phone TEXT NOT NULL,
        mpesa_receipt TEXT,
        mpesa_transaction_id TEXT,
        tickets_count INTEGER NOT NULL,
        ticket_type TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        confirmed_at TIMESTAMP,
        failed_at TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id)
      )
    `);

    // Create Tickets table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        ticket_id TEXT UNIQUE NOT NULL,
        order_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        status TEXT DEFAULT 'UNUSED',
        qr_code TEXT UNIQUE,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(order_id),
        FOREIGN KEY (event_id) REFERENCES events(id)
      )
    `);

    // Create M-Pesa logs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mpesa_logs (
        id SERIAL PRIMARY KEY,
        order_id TEXT,
        checkout_request_id TEXT,
        phone TEXT,
        amount REAL,
        transaction_id TEXT,
        status TEXT,
        response_data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Safe migrations: add columns if missing (Postgres ignores IF NOT EXISTS for columns prior to v11; use try-catch)
    try {
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_request_id TEXT;`);
    } catch (e) {}

    try {
      await pool.query(`ALTER TABLE mpesa_logs ADD COLUMN IF NOT EXISTS checkout_request_id TEXT;`);
    } catch (e) {}

    console.log('✅ Postgres database initialized successfully');
  };

  module.exports = {
    db: pool,
    dbRun,
    dbGet,
    dbAll,
    dialect,
    resetAutoIncrement,
    initializeDatabase
  };

} else if (isProduction()) {
  console.error('❌ Production environment requires a DATABASE_URL.');
  console.error('   Add Railway Postgres and set DATABASE_URL, or switch to a production-ready database.');
  process.exit(1);
} else {
  // Fall back to sqlite for local development
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, 'enjoymentclan.db');
  const sqliteDb = new sqlite3.Database(dbPath);

  db = sqliteDb;

  // Promisify database methods
  dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      sqliteDb.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  };

  dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  };

  dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  };

  resetAutoIncrement = () =>
    dbRun("DELETE FROM sqlite_sequence WHERE name IN ('tickets', 'orders', 'mpesa_logs')");

  const initializeDatabase = () => {
    // Create Events table (if not exists)
    sqliteDb.run(`
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

    // Create Orders table
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT UNIQUE NOT NULL,
        checkout_request_id TEXT UNIQUE, -- UPDATED: Connects the order directly to the STK push tracking token
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
    sqliteDb.run(`
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

    // Create M-Pesa Logs table for debugging
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS mpesa_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT,
        checkout_request_id TEXT, -- UPDATED: Tracks Safaricom's transaction reference code
        phone TEXT,
        amount REAL,
        transaction_id TEXT,
        status TEXT,
        response_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // SAFE DEVELOPMENT MIGRATION ALTERATIONS:
    sqliteDb.run(`ALTER TABLE orders ADD COLUMN checkout_request_id TEXT;`, [], (err) => {
      // Catch block handles hiding standard "duplicate column name" logs gracefully if it's already present
    });

    sqliteDb.run(`ALTER TABLE mpesa_logs ADD COLUMN checkout_request_id TEXT;`, [], (err) => {
      // Quietly catch errors if the column is already built
    });

    console.log('✅ SQLite database initialized successfully');
  };

  module.exports = {
    db: sqliteDb,
    dbRun,
    dbGet,
    dbAll,
    dialect,
    resetAutoIncrement,
    initializeDatabase
  };
}
