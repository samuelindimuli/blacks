# EnjoymentClan Backend - Setup Guide

## 📋 Database Schema

### Orders Table
```sql
id              INTEGER PRIMARY KEY
order_id        TEXT UNIQUE NOT NULL
event_id        TEXT NOT NULL
status          TEXT (PENDING/CONFIRMED/FAILED)
amount          REAL NOT NULL
phone           TEXT NOT NULL
mpesa_receipt   TEXT
mpesa_transaction_id TEXT
tickets_count   INTEGER NOT NULL
ticket_type     TEXT
created_at      DATETIME
confirmed_at    DATETIME
failed_at       DATETIME
```

### Tickets Table
```sql
id              INTEGER PRIMARY KEY
ticket_id       TEXT UNIQUE NOT NULL
order_id        TEXT NOT NULL
event_id        TEXT NOT NULL
status          TEXT (UNUSED/USED)
qr_code         TEXT UNIQUE
used_at         DATETIME
created_at      DATETIME
```

## 🚀 Installation & Setup

### 1. Install Dependencies
```bash
cd /Users/mac/Desktop/visual\ studio\ codes/enjoymentClan-webpage
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and fill in your M-Pesa credentials:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```
PORT=5000
MPESA_CONSUMER_KEY=your_safaricom_api_key
MPESA_CONSUMER_SECRET=your_safaricom_api_secret
MPESA_SHORTCODE=174379
MPESA_PASSKEY=bfb279f9aa9bdbcf158e97dd1a503b6e
MPESA_PHONE=0791615005
MPESA_ENVIRONMENT=sandbox
ADMIN_TOKEN=enjoyment-admin-token
FRONTEND_URL=http://localhost:3000
```

**Get M-Pesa Credentials:**
1. Go to https://developer.safaricom.co.ke/
2. Create an account and register an app
3. Copy your Consumer Key and Consumer Secret
4. Use the sandbox environment for testing

### 3. Start the Server
```bash
npm run server    # Production
npm run dev       # Development (with auto-reload)
```

The server will run on `http://localhost:5000`

## 📡 API Endpoints

### Orders

#### Create Order
```
POST /api/orders/create
```
Body:
```json
{
  "eventId": "event-1",
  "amount": 500,
  "phone": "0791615005",
  "ticketsCount": 2,
  "ticketType": "General"
}
```

Response:
```json
{
  "success": true,
  "orderId": "ORD-1726234567890-ABC123",
  "message": "Order created. Awaiting payment confirmation."
}
```

#### Get Order Details
```
GET /api/orders/:orderId
```

#### Get Orders by Event
```
GET /api/orders/event/:eventId
```

#### Get Orders by Status
```
GET /api/orders/status/:status
```

### M-Pesa Payment

#### Initiate STK Push (Prompt Payment)
```
POST /api/mpesa/stk-push
```

Body:
```json
{
  "orderId": "ORD-1726234567890-ABC123",
  "amount": 500,
  "phone": "0791615005"
}
```

Response:
```json
{
  "success": true,
  "message": "STK push sent. Check your phone for M-Pesa prompt.",
  "requestId": "29115-2953953-1"
}
```

#### Check Payment Status
```
GET /api/mpesa/status/:orderId
```

### Tickets

#### Get Tickets by Order
```
GET /api/tickets/order/:orderId
```

#### Get Unused Tickets
```
GET /api/tickets/event/:eventId/unused
```

#### Get Used Tickets
```
GET /api/tickets/event/:eventId/used
```

#### Mark Ticket as Used (Scan QR)
```
POST /api/tickets/:ticketId/use
```

### Analytics

#### Get Event Analytics
```
GET /api/analytics/event/:eventId
```

Response:
```json
{
  "event": {
    "eventId": "event-1",
    "totalOrders": 10,
    "confirmedOrders": 8,
    "pendingOrders": 1,
    "failedOrders": 1
  },
  "revenue": {
    "total": 4000,
    "average": 500,
    "byStatus": {
      "PENDING": 500,
      "CONFIRMED": 4000,
      "FAILED": 0
    }
  },
  "tickets": {
    "total": 20,
    "unused": 18,
    "used": 2,
    "usageRate": "10.00%",
    "byType": {
      "General": 16,
      "VIP": 4
    }
  }
}
```

#### Get All Events Analytics
```
GET /api/analytics
```

#### Get Conversion Rate
```
GET /api/analytics/conversion/:eventId
```

## 🎯 Workflow

1. **Customer Creates Order** → `POST /api/orders/create`
   - Order created with status: PENDING
   - No tickets generated yet

2. **Admin/Customer Initiates Payment** → `POST /api/mpesa/stk-push`
   - STK prompt sent to customer's phone
   - Customer enters M-Pesa PIN

3. **M-Pesa Callback** → `POST /api/mpesa/callback`
   - Payment confirmed/failed
   - If successful:
     - Order status → CONFIRMED
     - Tickets generated automatically
     - QR codes created
   - If failed:
     - Order status → FAILED

4. **Admin Scans Ticket** → `POST /api/tickets/:ticketId/use`
   - Ticket marked as USED
   - Timestamp recorded

5. **Admin Checks Analytics** → `GET /api/analytics/event/:eventId`
   - See pending, confirmed, failed orders
   - Revenue tracking
   - Ticket usage statistics

## 📊 Sample Data Flow

```
Order Created:
ORD-1726234567890-ABC123 (PENDING) → 2 tickets for event-1

Customer pays via M-Pesa:
0791615005 receives payment prompt
↓
Customer enters PIN
↓
Payment confirmed (receipt: ABC123DEF456)

Order Updated:
ORD-1726234567890-ABC123 (CONFIRMED) ✅
├─ TKT-1726234568001-XYZ123 (UNUSED)
└─ TKT-1726234568002-XYZ124 (UNUSED)

Event Entry:
Admin scans TKT-1726234568001-XYZ123
↓
TKT-1726234568001-XYZ123 (USED) ✅
used_at: 2026-05-19 14:30:00

Analytics:
Total Tickets: 20
Used: 15
Pending: 5
Usage Rate: 75%
Revenue: 10,000 KES
```

## 🔐 Security Notes

- Use real M-Pesa credentials in production (not sandbox)
- Store `.env` file in `.gitignore` (never commit)
- Add admin authentication middleware
- Validate all phone numbers
- Use HTTPS in production
- Rate limit the M-Pesa endpoints

## 📝 Testing

### Test M-Pesa Credentials (Sandbox)
- Consumer Key: `xxxxxxxxxxxxxxxxxxxxxxxxxxx`
- Consumer Secret: `xxxxxxxxxxxxxxxxxxxxxxxxxxx`
- Test Phone: `254708374149`
- Test Amount: Any amount (will be reversed in sandbox)

### Manual Testing Steps

1. Create an order:
```bash
curl -X POST http://localhost:5000/api/orders/create \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "event-1",
    "amount": 1,
    "phone": "254708374149",
    "ticketsCount": 1,
    "ticketType": "General"
  }'
```

2. Initiate payment:
```bash
curl -X POST http://localhost:5000/api/mpesa/stk-push \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORD-xxxx",
    "amount": 1,
    "phone": "254708374149"
  }'
```

3. Check payment status:
```bash
curl http://localhost:5000/api/mpesa/status/ORD-xxxx
```

## 📚 Additional Resources

- M-Pesa API: https://developer.safaricom.co.ke/
- Express.js: https://expressjs.com/
- SQLite: https://www.sqlite.org/
- QR Code: https://github.com/davidshimjs/qrcodejs
