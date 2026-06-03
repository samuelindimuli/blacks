const { dbRun } = require('./database');
require('dotenv').config();

async function wipeDatabase() {
  console.log('🧹 Starting database wipe...');
  
  try {
    // Clear all transactional data
    await dbRun('DELETE FROM tickets');
    await dbRun('DELETE FROM orders');
    await dbRun('DELETE FROM mpesa_logs');
    
    // Reset auto-increment counters to start IDs from 1 again
    await dbRun("DELETE FROM sqlite_sequence WHERE name IN ('tickets', 'orders', 'mpesa_logs')");
    
    console.log('✅ Success: All orders, tickets, and M-Pesa logs have been cleared.');
    console.log('🚀 You are now ready to track new data input.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error wiping database:', error);
    process.exit(1);
  }
}

wipeDatabase();