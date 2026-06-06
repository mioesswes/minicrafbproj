# GOYKARTA

Node.js + Express + SQLite проект для поиска клановых территорий Minecraft по `marks.json`.

## Что уже есть

- главная страница с Liquid Glass интерфейсом
- поиск по названию клана, тегу и нику главы
- страница карты `/map` с полигонами территорий
- капча-модалка с Telegram и cookie
- админка `/adminkqa` с Basic Auth
- SQLite таблицы `logs`, `settings`, `users`
- загрузка нового `marks.json` через админку

## Переменные окружения

Скопируйте `.env.example` в `.env` и задайте:

- `PORT`
- `ADMIN_LOGIN`
- `ADMIN_PASSWORD`
- `TELEGRAM_URL`

## Запуск

```bash
npm install
npm start
```

Сайт будет доступен на `http://localhost:3000`.

## Ассеты

В текущей сборке используются существующие файлы проекта:

- логотип: `llgo.webp`
- фон: `bgg.jpg`
- шрифт Minecraft: `fonts/minecraft_rus_regular.ttf`
- данные карты: `marks.json`

Если позже переименуете их в `logo.png` и `background.webp`, достаточно поправить пути в HTML/CSS.

## Примечание по карте

На странице `/map` Leaflet подключён через CDN.
