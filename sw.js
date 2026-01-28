// Конфигурация
const CACHE_NAME = 'stillstandup-v2.0';
const APP_NAME = 'Still Stand Up';
const PRIMARY_URL = 'https://stillstandup.com';

// Файлы для предварительного кэширования
const PRE_CACHE = [
  '/',                    // index.html или index.php
  '/index.html',         // Основная страница
  '/index.php',          // PHP роутер
  '/manifest.json',      // Манифест PWA
  '/icon-192.png',       // Иконки
  '/icon-512.png',
  '/offline.html',       // Офлайн страница
  '/404.html'           // Страница 404
];

// Установка Service Worker
self.addEventListener('install', event => {
  console.log('⚙️ Still Stand Up PWA: Установка...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Кэширование основных ресурсов');
        return cache.addAll(PRE_CACHE);
      })
      .then(() => self.skipWaiting())
      .catch(error => {
        console.error('❌ Ошибка кэширования:', error);
      })
  );
});

// Активация - очистка старых кэшей
self.addEventListener('activate', event => {
  console.log('🚀 Still Stand Up PWA: Активация...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log(`🗑️ Удаление старого кэша: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('✅ Кэш очищен');
      return self.clients.claim();
    })
  );
});

// Обработка fetch запросов
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Пропускаем запросы к внешним ресурсам (сайт клуба)
  if (url.hostname.includes('stillstandup.com')) {
    return;
  }
  
  // Пропускаем аналитику и другие внешние ресурсы
  if (url.hostname !== self.location.hostname) {
    return;
  }
  
  // Для навигационных запросов используем стратегию "Сеть, потом Кэш"
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Клонируем и кэшируем успешные ответы
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Если сеть недоступна, пробуем кэш
          return caches.match(request)
            .then(response => {
              if (response) {
                return response;
              }
              // Если в кэше нет, показываем offline.html
              return caches.match('/offline.html');
            });
        })
    );
    return;
  }
  
  // Для статических ресурсов используем стратегию "Кэш, потом Сеть"
  event.respondWith(
    caches.match(request)
      .then(response => {
        if (response) {
          return response;
        }
        
        return fetch(request)
          .then(response => {
            // Кэшируем только успешные ответы
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseClone);
              });
            }
            return response;
          })
          .catch(() => {
            // Для CSS/JS возвращаем пустые ответы
            if (request.url.match(/\.(css|js)$/)) {
              return new Response('', {
                status: 200,
                headers: { 'Content-Type': 'text/css' }
              });
            }
            
            // Для изображений показываем fallback
            if (request.url.match(/\.(png|jpg|jpeg|gif|svg)$/)) {
              return caches.match('/icon-192.png');
            }
            
            return new Response('Ресурс недоступен офлайн', {
              status: 503
            });
          });
      })
  );
});

// PUSH УВЕДОМЛЕНИЯ
self.addEventListener('push', event => {
  console.log('🔔 Получено push-уведомление');
  
  let notificationData = {
    title: APP_NAME,
    body: 'Новое событие в клубе!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: {
      url: PRIMARY_URL,
      timestamp: Date.now()
    }
  };
  
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = { ...notificationData, ...data };
    } catch (e) {
      notificationData.body = event.data.text() || notificationData.body;
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      data: notificationData.data,
      vibrate: [200, 100, 200],
      tag: 'stillstandup-event',
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
    })
  );
});

// Обработка кликов по уведомлениям
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'open' || event.action === '') {
    const url = event.notification.data.url || PRIMARY_URL;
    event.waitUntil(
      clients.openWindow(url)
    );
  }
});

// Синхронизация в фоне
self.addEventListener('sync', event => {
  if (event.tag === 'update-content') {
    event.waitUntil(updateContent());
  }
});

async function updateContent() {
  console.log('🔄 Фоновая синхронизация контента');
  
  try {
    // Обновляем кэш главной страницы
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch('/');
    if (response.ok) {
      await cache.put('/', response);
    }
    
    // Отправляем сообщение об обновлении
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'CONTENT_UPDATED',
        timestamp: Date.now()
      });
    });
    
  } catch (error) {
    console.error('❌ Ошибка синхронизации:', error);
  }
}

// Периодическая синхронизация
self.addEventListener('periodicsync', event => {
  if (event.tag === 'refresh-cache') {
    event.waitUntil(refreshCache());
  }
});

async function refreshCache() {
  console.log('🔄 Периодическое обновление кэша');
  // Можно реализовать обновление кэша по расписанию
}