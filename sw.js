// Service Worker для Still Stand Up PWA
// Версия 2.0 - Полная реализация

const APP_NAME = 'Still Stand Up';
const APP_VERSION = '2.0.0';
const CACHE_NAME = `stillstandup-cache-${APP_VERSION}`;
const OFFLINE_URL = '/stillstandup-pwa/offline.html';

// Файлы для предварительного кэширования
const PRECACHE_URLS = [
  '/stillstandup-pwa/',
  '/stillstandup-pwa/index.html',
  '/stillstandup-pwa/manifest.json',
  '/stillstandup-pwa/icon-192.png',
  '/stillstandup-pwa/icon-512.png',
  '/stillstandup-pwa/offline.html',
  '/stillstandup-pwa/404.html',
  '/stillstandup-pwa/sw.js'
];

// ========== УСТАНОВКА ==========
self.addEventListener('install', event => {
  console.log(`[Service Worker] ${APP_NAME} v${APP_VERSION} установка...`);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Кэширование основных файлов:', PRECACHE_URLS);
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('[Service Worker] Предварительное кэширование завершено');
        return self.skipWaiting(); // Активируем сразу
      })
      .catch(error => {
        console.error('[Service Worker] Ошибка при установке:', error);
      })
  );
});

// ========== АКТИВАЦИЯ ==========
self.addEventListener('activate', event => {
  console.log('[Service Worker] Активация...');
  
  // Удаляем старые кэши
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Удаление старого кэша:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('[Service Worker] Активация завершена');
      return self.clients.claim(); // Контролируем всех клиентов
    })
  );
});

// ========== ОБРАБОТКА ЗАПРОСОВ ==========
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Пропускаем неподдерживаемые запросы
  if (request.method !== 'GET') return;
  
  // Для запросов к сайту клуба - всегда сеть
  if (url.hostname.includes('stillstandup.com')) {
    event.respondWith(fetch(request));
    return;
  }
  
  // Для нашего PWA используем стратегию "Сеть, потом Кэш"
  event.respondWith(
    fetch(request)
      .then(response => {
        // Если запрос успешен, кэшируем
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(error => {
        console.log('[Service Worker] Сеть недоступна, пробуем кэш:', request.url);
        
        // Для навигационных запросов показываем offline.html
        if (request.mode === 'navigate') {
          return caches.match(OFFLINE_URL)
            .then(response => response || new Response('Страница недоступна офлайн', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            }));
        }
        
        // Для остальных запросов ищем в кэше
        return caches.match(request)
          .then(response => {
            if (response) {
              return response;
            }
            
            // Для изображений возвращаем иконку
            if (request.destination === 'image') {
              return caches.match('/stillstandup-pwa/icon-192.png');
            }
            
            // Для API запросов возвращаем пустой JSON
            if (request.url.includes('/api/')) {
              return new Response(JSON.stringify({ error: 'Офлайн режим' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
              });
            }
            
            return new Response('Ресурс недоступен в офлайн режиме', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
          });
      })
  );
});

// ========== PUSH УВЕДОМЛЕНИЯ ==========
self.addEventListener('push', event => {
  console.log('[Service Worker] Получено push уведомление');
  
  let notificationData = {
    title: APP_NAME,
    body: 'Новое событие в клубе!',
    icon: '/stillstandup-pwa/icon-192.png',
    badge: '/stillstandup-pwa/icon-192.png',
    data: {
      url: 'https://stillstandup.com',
      timestamp: Date.now()
    }
  };
  
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = { ...notificationData, ...data };
    } catch (error) {
      notificationData.body = event.data.text() || notificationData.body;
    }
  }
  
  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    data: notificationData.data,
    vibrate: [200, 100, 200],
    tag: 'stillstandup-notification',
    renotify: true,
    requireInteraction: true,
    actions: [
      {
        action: 'open',
        title: 'Открыть'
      },
      {
        action: 'close',
        title: 'Закрыть'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

// ========== КЛИК ПО УВЕДОМЛЕНИЮ ==========
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Клик по уведомлению:', event.notification.tag);
  
  event.notification.close();
  
  const urlToOpen = event.notification.data.url || 'https://stillstandup.com';
  
  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow(urlToOpen)
    );
  } else {
    // Клик по самому уведомлению
    event.waitUntil(
      clients.openWindow(urlToOpen)
    );
  }
});

// ========== СИНХРОНИЗАЦИЯ В ФОНЕ ==========
self.addEventListener('sync', event => {
  console.log('[Service Worker] Фоновая синхронизация:', event.tag);
  
  if (event.tag === 'sync-content') {
    event.waitUntil(syncContent());
  }
});

async function syncContent() {
  try {
    const cache = await caches.open(CACHE_NAME);
    
    // Обновляем главную страницу
    const response = await fetch('/stillstandup-pwa/');
    if (response.ok) {
      await cache.put('/', response);
    }
    
    // Сообщаем об обновлении
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'CONTENT_UPDATED',
        timestamp: Date.now(),
        version: APP_VERSION
      });
    });
    
    console.log('[Service Worker] Контент синхронизирован');
  } catch (error) {
    console.error('[Service Worker] Ошибка синхронизации:', error);
  }
}

// ========== СООБЩЕНИЯ ОТ КЛИЕНТА ==========
self.addEventListener('message', event => {
  console.log('[Service Worker] Получено сообщение:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_CACHE_INFO') {
    event.ports[0].postMessage({
      cacheName: CACHE_NAME,
      version: APP_VERSION
    });
  }
});

// ========== ПЕРИОДИЧЕСКАЯ СИНХРОНИЗАЦИЯ ==========
self.addEventListener('periodicsync', event => {
  if (event.tag === 'update-check') {
    event.waitUntil(checkForUpdates());
  }
});

async function checkForUpdates() {
  console.log('[Service Worker] Проверка обновлений...');
  
  try {
    const response = await fetch('/stillstandup-pwa/manifest.json', {
      cache: 'no-store'
    });
    
    if (response.ok) {
      const manifest = await response.json();
      
      // Здесь можно проверять версии и обновлять при необходимости
      console.log('[Service Worker] Актуальная версия:', manifest.version);
    }
  } catch (error) {
    console.error('[Service Worker] Ошибка проверки обновлений:', error);
  }
}

// ========== ОБРАБОТКА ОШИБОК ==========
self.addEventListener('error', event => {
  console.error('[Service Worker] Ошибка:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('[Service Worker] Необработанный rejection:', event.reason);
});

console.log('[Service Worker] Загружен и готов к работе');