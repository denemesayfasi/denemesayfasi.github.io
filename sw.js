const CACHE_NAME = 'coumadin-v3';
const ASSETS = [
  'coumadin.html',
  'manifest.json',
  'https://cdn-icons-png.flaticon.com/512/822/822143.png'
];

let alarmTime = null;
let lastNotified = null;

// Helper to get/set from IndexedDB
const dbPromise = new Promise((resolve) => {
  const request = indexedDB.open('coumadin_sw_db', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('settings');
  request.onsuccess = () => resolve(request.result);
});

async function getSetting(key) {
  const db = await dbPromise;
  return new Promise((resolve) => {
    const transaction = db.transaction('settings', 'readonly');
    const request = transaction.objectStore('settings').get(key);
    request.onsuccess = () => resolve(request.result);
  });
}

async function setSetting(key, value) {
  const db = await dbPromise;
  return new Promise((resolve) => {
    const transaction = db.transaction('settings', 'readwrite');
    transaction.objectStore('settings').put(value, key);
    transaction.oncomplete = () => resolve();
  });
}

// Load initial settings
getSetting('alarmTime').then(val => { if(val) alarmTime = val; });

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_ALARM') {
    alarmTime = event.data.time;
    setSetting('alarmTime', alarmTime);
    console.log('SW: Alarm set to', alarmTime);
  }
});

// Background check logic
async function checkAlarm() {
  const alarmTime = await getSetting('alarmTime');
  if (!alarmTime) return;

  const now = new Date();
  const currentStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  
  const lastNotified = await getSetting('lastNotified');
  
  if (currentStr === alarmTime && lastNotified !== currentStr) {
    await setSetting('lastNotified', currentStr);
    
    await self.registration.showNotification('CoumadinTakip', {
      body: 'İlacınızı içme vaktiniz geldi!',
      icon: 'https://cdn-icons-png.flaticon.com/512/822/822143.png',
      badge: 'https://cdn-icons-png.flaticon.com/512/822/822143.png',
      vibrate: [500, 110, 500, 110, 450, 110, 200, 110, 170, 40],
      tag: 'coumadin-alarm',
      renotify: true,
      requireInteraction: true
    });
  }
}

// Periodic check
setInterval(checkAlarm, 30000);

self.addEventListener('sync', (event) => {
  if (event.tag === 'check-alarm') {
    event.waitUntil(checkAlarm());
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-alarm') {
    event.waitUntil(checkAlarm());
  }
});

self.addEventListener('fetch', (event) => {
  checkAlarm(); // Check on every fetch too
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      return clients.openWindow('coumadin.html');
    })
  );
});
