(function () {
  const { hostname, origin } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

  window.EC_CONFIG = {
    adminToken: 'enjoyment-admin-token',
    // Local dev hits the Node server; on Railway the app is same-origin so use /api
    apiBaseUrl: isLocal ? 'http://localhost:3000/api' : `${origin}/api`,
    storageKey: 'ec_content_items',
    eventsKey: 'ec_events',
    merchKey: 'ec_merchandise',
    purchasesKey: 'ec_purchases',
    cartKey: 'ec_ticket_cart',
    pendingCheckoutKey: 'ec_pending_checkout',
    analyticsKey: 'ec_analytics',
    defaultItems: [
      {
        id: 'audio-1',
        type: 'audio',
        title: 'DJ KennyBlacks Mix Vol. 1',
        description: 'High-energy electronic mix available for streaming and download.',
        source: 'DJ_KennyBlacks_Mix_Vol_1.mp3'
      },
      {
        id: 'video-1',
        type: 'video',
        title: 'Sunset Vibes Video Set',
        description: 'A curated video set for your next virtual event.',
        source: 'Sunset_Vibes_Video_Set.mp4'
      }
    ],
    defaultEvents: [
      {
        id: 'event-1',
        title: 'Urban Sunday',
        description: 'Join us for an unforgettable day of music, dance, and fun.',
        date: '2026-05-15',
        location: 'Los Angeles, CA',
        tickets: [
          { type: 'General', price: 1, available: 100 },
          { type: 'VIP', price: 50, available: 50 }
        ]
      }
    ],
    defaultMerch: [
      {
        id: 'merch-1',
        name: 'T-Shirt',
        description: 'Official EnjoymentClan T-Shirt',
        price: 700,
        image: 'pics/tshirt1.png',
        category: 'Apparel'
      },
      {
        id: 'merch-2',
        name: 'Premium Hoodie',
        description: 'Comfortable and stylish hoodie',
        price: 1200,
        image: 'pics/hoddie1.png',
        category: 'Apparel'
      }
    ]
  };
})();
