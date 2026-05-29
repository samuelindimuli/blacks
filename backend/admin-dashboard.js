// Admin Dashboard - Ticket Analysis Component
// Add this to your admin.html file in the Analytics tab

class TicketAnalyticsDashboard {
  constructor() {
    this.apiBase = 'http://localhost:3000/api';
    this.currentEventId = null;
    this.backendAvailable = false;
    this.checkBackendAvailability();
  }

  // Check if backend is running
  async checkBackendAvailability() {
    try {
      const response = await fetch(`${this.apiBase.replace('/api', '')}/api/health`, {
        method: 'GET',
        timeout: 3000
      });
      this.backendAvailable = response.ok;
      console.log('Backend status:', this.backendAvailable ? '✅ Online' : '❌ Offline');
    } catch (error) {
      this.backendAvailable = false;
      console.warn('Backend not available. Using demo mode.');
    }
  }

  // Render analytics for selected event
  async renderEventAnalytics(eventId) {
    this.currentEventId = eventId;
    
    try {
      if (this.backendAvailable) {
        const analytics = await this.fetchEventAnalytics(eventId);
        this.displayAnalytics(analytics);
      } else {
        this.displayDemoAnalytics(eventId);
      }
    } catch (error) {
      console.error('Error rendering analytics:', error);
      this.displayDemoAnalytics(eventId);
    }
  }

  // Fetch analytics data from backend
  async fetchEventAnalytics(eventId) {
    const response = await fetch(`${this.apiBase}/analytics/event/${eventId}`);
    if (!response.ok) throw new Error('Failed to fetch analytics');
    return await response.json();
  }

  // Display demo/mock analytics when backend is offline
  displayDemoAnalytics(eventId) {
    const demoData = {
      event: {
        eventId,
        totalOrders: 12,
        confirmedOrders: 10,
        pendingOrders: 1,
        failedOrders: 1
      },
      revenue: {
        total: 5000,
        average: 500,
        byStatus: {
          PENDING: 500,
          CONFIRMED: 5000,
          FAILED: 0
        }
      },
      tickets: {
        total: 25,
        unused: 5,
        used: 20,
        usageRate: '80.00%',
        byType: {
          General: 20,
          VIP: 5
        }
      },
      orders: {
        CONFIRMED: [
          { order_id: 'ORD-demo-001', phone: '0791615005', amount: 500, tickets_count: 2, ticket_type: 'General', mpesa_receipt: 'ABC123', confirmed_at: new Date().toISOString() },
          { order_id: 'ORD-demo-002', phone: '0712345678', amount: 1000, tickets_count: 2, ticket_type: 'VIP', mpesa_receipt: 'DEF456', confirmed_at: new Date().toISOString() }
        ],
        PENDING: [
          { order_id: 'ORD-demo-003', phone: '0741234567', amount: 500, tickets_count: 1, ticket_type: 'General', created_at: new Date().toISOString() }
        ],
        FAILED: [
          { order_id: 'ORD-demo-004', phone: '0722334455', amount: 500, tickets_count: 1, ticket_type: 'General', failed_at: new Date().toISOString() }
        ]
      }
    };

    this.displayAnalytics(demoData, true);
  }

  // Display analytics on dashboard
  displayAnalytics(data, isDemo = false) {
    const {event, revenue, tickets, orders} = data;

    let html = `
      ${isDemo ? '<div class="bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded mb-6"><strong>📊 Demo Mode:</strong> Backend server not detected. Showing sample data. Start the backend with <code class="bg-yellow-100 px-2 py-1 rounded">npm run dev</code></div>' : ''}
      
      <div class="space-y-8">
        <!-- Orders Summary -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div class="bg-blue-50 p-6 rounded-lg">
            <div class="text-sm font-semibold text-gray-600 mb-2">TOTAL ORDERS</div>
            <div class="text-3xl font-bold text-blue-600">${event.totalOrders}</div>
          </div>
          <div class="bg-green-50 p-6 rounded-lg">
            <div class="text-sm font-semibold text-gray-600 mb-2">CONFIRMED</div>
            <div class="text-3xl font-bold text-green-600">${event.confirmedOrders}</div>
          </div>
          <div class="bg-yellow-50 p-6 rounded-lg">
            <div class="text-sm font-semibold text-gray-600 mb-2">PENDING</div>
            <div class="text-3xl font-bold text-yellow-600">${event.pendingOrders}</div>
          </div>
          <div class="bg-red-50 p-6 rounded-lg">
            <div class="text-sm font-semibold text-gray-600 mb-2">FAILED</div>
            <div class="text-3xl font-bold text-red-600">${event.failedOrders}</div>
          </div>
        </div>

        <!-- Revenue Summary -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-gradient-to-br from-purple-50 to-blue-50 p-6 rounded-lg border border-purple-200">
            <div class="text-sm font-semibold text-gray-600 mb-2">TOTAL REVENUE</div>
            <div class="text-3xl font-bold text-purple-600">KES ${revenue.total.toLocaleString()}</div>
            <div class="text-xs text-gray-500 mt-2">From confirmed orders</div>
          </div>
          <div class="bg-gradient-to-br from-orange-50 to-red-50 p-6 rounded-lg border border-orange-200">
            <div class="text-sm font-semibold text-gray-600 mb-2">AVERAGE ORDER VALUE</div>
            <div class="text-3xl font-bold text-orange-600">KES ${revenue.average.toLocaleString()}</div>
            <div class="text-xs text-gray-500 mt-2">Per confirmed order</div>
          </div>
          <div class="bg-gradient-to-br from-teal-50 to-green-50 p-6 rounded-lg border border-teal-200">
            <div class="text-sm font-semibold text-gray-600 mb-2">CONVERSION RATE</div>
            <div class="text-3xl font-bold text-teal-600">${event.totalOrders > 0 ? ((event.confirmedOrders / event.totalOrders) * 100).toFixed(1) : 0}%</div>
            <div class="text-xs text-gray-500 mt-2">Pending to confirmed</div>
          </div>
        </div>

        <!-- Tickets Summary -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div class="bg-indigo-50 p-6 rounded-lg">
            <div class="text-sm font-semibold text-gray-600 mb-2">TOTAL TICKETS</div>
            <div class="text-3xl font-bold text-indigo-600">${tickets.total}</div>
          </div>
          <div class="bg-cyan-50 p-6 rounded-lg">
            <div class="text-sm font-semibold text-gray-600 mb-2">UNUSED</div>
            <div class="text-3xl font-bold text-cyan-600">${tickets.unused}</div>
          </div>
          <div class="bg-emerald-50 p-6 rounded-lg">
            <div class="text-sm font-semibold text-gray-600 mb-2">USED</div>
            <div class="text-3xl font-bold text-emerald-600">${tickets.used}</div>
          </div>
          <div class="bg-violet-50 p-6 rounded-lg">
            <div class="text-sm font-semibold text-gray-600 mb-2">USAGE RATE</div>
            <div class="text-3xl font-bold text-violet-600">${tickets.usageRate}</div>
          </div>
        </div>

        <!-- Revenue Breakdown -->
        <div class="bg-white p-6 rounded-lg shadow-md">
          <h3 class="text-lg font-bold mb-4">Revenue by Status</h3>
          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-green-600 font-semibold">Confirmed: </span>
              <span class="text-2xl font-bold">KES ${revenue.byStatus.CONFIRMED.toLocaleString()}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-yellow-600 font-semibold">Pending: </span>
              <span class="text-2xl font-bold">KES ${revenue.byStatus.PENDING.toLocaleString()}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-red-600 font-semibold">Failed: </span>
              <span class="text-2xl font-bold">KES ${revenue.byStatus.FAILED.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <!-- Tickets by Type -->
        <div class="bg-white p-6 rounded-lg shadow-md">
          <h3 class="text-lg font-bold mb-4">Tickets by Type</h3>
          <div class="space-y-3">
            ${Object.entries(tickets.byType).map(([type, count]) => `
              <div class="flex justify-between items-center p-3 bg-gray-50 rounded">
                <span class="font-semibold">${type}</span>
                <span class="bg-primary text-white px-4 py-2 rounded">${count} tickets</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Orders Details Table -->
        <div class="bg-white p-6 rounded-lg shadow-md">
          <h3 class="text-lg font-bold mb-4">Confirmed Orders</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-100">
                <tr>
                  <th class="px-4 py-2 text-left">Order ID</th>
                  <th class="px-4 py-2 text-left">Phone</th>
                  <th class="px-4 py-2 text-left">Amount</th>
                  <th class="px-4 py-2 text-left">Tickets</th>
                  <th class="px-4 py-2 text-left">Receipt</th>
                  <th class="px-4 py-2 text-left">Confirmed At</th>
                </tr>
              </thead>
              <tbody>
                ${orders.CONFIRMED.map(order => `
                  <tr class="border-b hover:bg-gray-50">
                    <td class="px-4 py-2 font-mono text-xs">${order.order_id.slice(-8)}</td>
                    <td class="px-4 py-2">${order.phone}</td>
                    <td class="px-4 py-2">KES ${order.amount.toLocaleString()}</td>
                    <td class="px-4 py-2">${order.tickets_count} (${order.ticket_type})</td>
                    <td class="px-4 py-2 font-mono text-xs">${order.mpesa_receipt || 'N/A'}</td>
                    <td class="px-4 py-2 text-xs">${new Date(order.confirmed_at).toLocaleDateString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Pending Orders -->
        <div class="bg-white p-6 rounded-lg shadow-md">
          <h3 class="text-lg font-bold mb-4">Pending Orders</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-yellow-100">
                <tr>
                  <th class="px-4 py-2 text-left">Order ID</th>
                  <th class="px-4 py-2 text-left">Phone</th>
                  <th class="px-4 py-2 text-left">Amount</th>
                  <th class="px-4 py-2 text-left">Tickets</th>
                  <th class="px-4 py-2 text-left">Created</th>
                  <th class="px-4 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                ${orders.PENDING.map(order => `
                  <tr class="border-b hover:bg-yellow-50">
                    <td class="px-4 py-2 font-mono text-xs">${order.order_id.slice(-8)}</td>
                    <td class="px-4 py-2">${order.phone}</td>
                    <td class="px-4 py-2">KES ${order.amount.toLocaleString()}</td>
                    <td class="px-4 py-2">${order.tickets_count}</td>
                    <td class="px-4 py-2 text-xs">${new Date(order.created_at).toLocaleDateString()}</td>
                    <td class="px-4 py-2">
                      <button class="btn btn-outline text-xs py-1 px-2" onclick="alert('Resend payment link to: ${order.phone}')">
                        Resend
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Failed Orders -->
        ${orders.FAILED.length > 0 ? `
          <div class="bg-white p-6 rounded-lg shadow-md">
            <h3 class="text-lg font-bold mb-4">Failed Orders</h3>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-red-100">
                  <tr>
                    <th class="px-4 py-2 text-left">Order ID</th>
                    <th class="px-4 py-2 text-left">Phone</th>
                    <th class="px-4 py-2 text-left">Amount</th>
                    <th class="px-4 py-2 text-left">Failed At</th>
                  </tr>
                </thead>
                <tbody>
                  ${orders.FAILED.map(order => `
                    <tr class="border-b hover:bg-red-50">
                      <td class="px-4 py-2 font-mono text-xs">${order.order_id.slice(-8)}</td>
                      <td class="px-4 py-2">${order.phone}</td>
                      <td class="px-4 py-2">KES ${order.amount.toLocaleString()}</td>
                      <td class="px-4 py-2 text-xs">${new Date(order.failed_at).toLocaleDateString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    const analyticsContainer = document.getElementById('analyticsContainer');
    if (analyticsContainer) {
      analyticsContainer.innerHTML = html;
    }
  }

  showError(message) {
    const container = document.getElementById('analyticsContainer');
    if (container) {
      container.innerHTML = `<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">${message}</div>`;
    }
  }
}

// Initialize dashboard when page loads
const analyticsDashboard = new TicketAnalyticsDashboard();
