<?php
/**
 * index.php для Still Stand Up PWA
 * 
 * Этот файл служит для:
 * 1. Перенаправления всех запросов на index.html (SPA роутинг)
 * 2. Заглушки для будущего развертывания на PHP-хостинге
 * 3. Обработки специальных API эндпоинтов в будущем
 */

header('Content-Type: text/html; charset=utf-8');

// Логика для GitHub Pages (статический хостинг)
if (file_exists(__DIR__ . '/index.html')) {
    // Перенаправляем на главную страницу PWA
    include __DIR__ . '/index.html';
    exit;
} else {
    // Если index.html не найден
    http_response_code(404);
    echo '<!DOCTYPE html>
    <html>
    <head>
        <title>Still Stand Up - Ошибка</title>
        <style>
            body { font-family: sans-serif; padding: 20px; text-align: center; }
            h1 { color: #ff3366; }
        </style>
    </head>
    <body>
        <h1>Still Stand Up PWA</h1>
        <p>Основной файл index.html не найден.</p>
        <p>Сайт: <a href="https://stillstandup.com">stillstandup.com</a></p>
    </body>
    </html>';
}
?>