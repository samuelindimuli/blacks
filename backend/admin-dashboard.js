// Admin Dashboard - Ticket Analysis Component
// Add this to your admin.html file in the Analytics tab
// This file is assumed to be loaded after config.js

class TicketAnalyticsDashboard {
  constructor() {
    this.apiBase = window.EC_CONFIG?.apiBaseUrl || 'http://localhost:3000/api';
    this.adminToken = window.EC_CONFIG?.adminToken || 'enjoyment-admin-token';
    this.currentEventId = null;
    this.backendAvailable = false;
    this.inquiries = []; // Store inquiries
    this.checkBackendAvailability();
  }

  // Check if backend is running
  async checkBackendAvailability() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // Increased timeout
      
      const response = await fetch(`${this.apiBase}/mpesa/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      this.backendAvailable = response.ok;
      console.log('Backend status:', this.backendAvailable ? '✅ Online' : '❌ Offline');
    } catch (error) {
      this.backendAvailable = false; // Backend is offline or unreachable
      console.warn('Backend not available. Using demo mode.');
    }
  }

  // Render analytics for selected event
  async renderEventAnalytics(eventId) {
    this.currentEventId = eventId;
    
    try {
      let analytics;
      if (this.backendAvailable) {
        analytics = await this.fetchEventAnalytics(eventId);
      } else {
        analytics = this.getDemoAnalytics(eventId); // Use demo data if backend is offline
      }
      this.displayAnalytics(analytics);
    } catch (error) {
      console.error('Error rendering analytics:', error);
      this.showError(`Failed to load real-time analytics: ${error.message}. Please check if the backend is running.`);
    }
  }

  // Fetch analytics data from backend
  async fetchEventAnalytics(eventId) {
    const response = await fetch(`${this.apiBase}/mpesa/reports/event/${eventId}`, {
      headers: { 'x-admin-token': this.adminToken }
    });
    if (!response.ok) throw new Error('Failed to fetch analytics');
    return await response.json();
  }

  // Generate demo/mock analytics data
  getDemoAnalytics(eventId) {
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

    return demoData;
  }

  // Display analytics on dashboard
  displayAnalytics(data, isDemo = false) {
    const {event, revenue, tickets, orders} = data;

    let html = `
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

        <!-- Danger Zone -->
        <div class="bg-red-50 p-6 rounded-lg border border-red-200 mt-8">
          <h3 class="text-lg font-bold text-red-800 mb-2">Danger Zone</h3>
          <p class="text-sm text-red-600 mb-4">Warning: This will permanently delete all orders, tickets, and M-Pesa logs from the database. This action cannot be undone.</p>
          <button onclick="analyticsDashboard.resetDatabase()" class="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded font-semibold transition">Reset Database & Analytics</button>
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

  // --- Inquiry Management ---
  async fetchInquiries() {
    if (!this.backendAvailable) {
      console.warn('Backend is offline, cannot fetch real inquiries. Displaying demo inquiries.');
      this.inquiries = this.getDemoInquiries();
      this.renderInquiries();
      return;
    }
    try {
      const response = await fetch(`${this.apiBase}/inquiries`, {
        headers: { 'x-admin-token': this.adminToken }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch inquiries: ${response.statusText}`);
      }
      const data = await response.json();
      this.inquiries = data.inquiries;
      this.renderInquiries();
    } catch (error) {
      console.error('Error fetching inquiries:', error);
      this.showErrorInquiry('Failed to load inquiries. Please check if the backend is running.');
    }
  }

  getDemoInquiries() {
    return [
      {
        id: 1, event_type: 'Wedding', event_date: '2024-12-25', location: 'Nairobi, Safari Park Hotel',
        guests: 300, requirements: 'Full sound system, DJ, lighting, MC', duration: 8, budget: '250,000 - 500,000',
        contact_name: 'Jane Doe', contact_email: 'jane.doe@example.com', status: 'NEW', created_at: '2024-05-10T10:00:00Z'
      },
      {
        id: 2, event_type: 'Corporate Event', event_date: '2024-11-15', location: 'Mombasa, Sarova Whitesands',
        guests: 150, requirements: 'Background music, projector, wireless mics', duration: 4, budget: '100,000 - 250,000',
        contact_name: 'John Smith', contact_email: 'john.smith@example.com', status: 'REVIEWED', created_at: '2024-05-08T14:30:00Z'
      }
    ];
  }

  renderInquiries() {
    const inquiriesListEl = document.getElementById('inquiriesList');
    if (!inquiriesListEl) return;

    if (this.inquiries.length === 0) {
      inquiriesListEl.innerHTML = '<p class="text-gray-500">No inquiries available yet.</p>';
      return;
    }

    inquiriesListEl.innerHTML = this.inquiries.map(inquiry => `
      <div class="border border-gray-200 rounded-custom p-5 bg-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs uppercase tracking-widest text-primary font-semibold">${inquiry.event_type}</span>
            <span class="text-xs text-gray-500">${new Date(inquiry.created_at).toLocaleDateString()}</span>
          </div>
          <h3 class="text-xl font-bold mb-1">${inquiry.contact_name} - ${inquiry.event_date}</h3>
          <p class="text-gray-700 mb-2">${inquiry.location} (${inquiry.guests} guests)</p>
          <p class="text-sm text-gray-600">Budget: ${inquiry.budget}</p>
          <p class="text-sm text-gray-600 mt-1">Email: <a href="mailto:${inquiry.contact_email}" class="text-blue-600 hover:underline">${inquiry.contact_email}</a></p>
          ${inquiry.requirements ? `<p class="text-sm text-gray-600 mt-2">Needs: ${inquiry.requirements}</p>` : ''}
        </div>
        <div class="flex flex-col gap-2 items-end">
          <span class="px-3 py-1 rounded-full text-xs font-semibold ${inquiry.status === 'NEW' ? 'bg-yellow-100 text-yellow-800' : inquiry.status === 'REVIEWED' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
            ${inquiry.status}
          </span>
          <button class="btn btn-outline btn-small mt-2" onclick="analyticsDashboard.markInquiryStatus(${inquiry.id}, 'REVIEWED')">Mark Reviewed</button>
          <button class="btn btn-primary btn-small" onclick="analyticsDashboard.markInquiryStatus(${inquiry.id}, 'CONTACTED')">Mark Contacted</button>
          <button class="btn btn-outline btn-small bg-red-50 text-red-600 border-red-400 hover:bg-red-600 hover:text-white" onclick="analyticsDashboard.deleteInquiry(${inquiry.id})">Delete</button>
        </div>
      </div>
    `).join('');
  }

  async markInquiryStatus(id, status) {
    if (!this.backendAvailable) {
      alert('Backend is offline. Cannot update inquiry status.');
      return;
    }
    try {
      const response = await fetch(`${this.apiBase}/inquiries/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': this.adminToken },
        body: JSON.stringify({ status })
      });
      if (!response.ok) throw new Error('Failed to update status');
      alert(`Inquiry ${id} marked as ${status}.`);
      this.fetchInquiries(); // Refresh list
    } catch (error) {
      console.error('Error updating inquiry status:', error);
      alert('Failed to update inquiry status.');
    }
  }

  async deleteInquiry(id) {
    if (!confirm(`Are you sure you want to delete inquiry ${id}?`)) return;
    if (!this.backendAvailable) {
      alert('Backend is offline. Cannot delete inquiry.');
      return;
    }
    try {
      const response = await fetch(`${this.apiBase}/inquiries/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': this.adminToken }
      });
      if (!response.ok) throw new Error('Failed to delete inquiry');
      alert(`Inquiry ${id} deleted.`);
      this.fetchInquiries(); // Refresh list
    } catch (error) {
      console.error('Error deleting inquiry:', error);
      alert('Failed to delete inquiry.');
    }
  }

  showError(message) {
    const container = document.getElementById('analyticsContainer');
    if (container) {
      container.innerHTML = `<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">${message}</div>`;
    }
  }

  showErrorInquiry(message) {
    const container = document.getElementById('inquiriesList');
    if (container) {
      container.innerHTML = `<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">${message}</div>`;
    }
  }

  // Reset the database (Danger Zone)
  async resetDatabase() {
    const password = prompt('🚨 IMPORTANT: This will permanently delete ALL sales data, tickets, and logs. Please enter the reset password to proceed:');
    if (!password) return;

    try {
      const response = await fetch(`${this.apiBase}/mpesa/reports/reset-all`, {
        method: 'POST',
        headers: { 
          'x-admin-token': this.adminToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ resetPassword: password })
      });

      const result = await response.json();
      if (response.ok) {
        alert('✅ ' + result.message);
        location.reload();
      } else {
        throw new Error(result.error || 'Failed to reset database');
      }
    } catch (error) {
      alert('❌ Error: ' + error.message);
    }
  }
}

// Initialize dashboard when page loads
const analyticsDashboard = new TicketAnalyticsDashboard();
