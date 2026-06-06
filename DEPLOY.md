# GOYKARTA Deploy

Ниже минимальный рабочий сценарий:

1. С Windows отправить проект в GitHub.
2. На Ubuntu-сервере скачать проект через `git clone`.
3. Установить Node.js, Nginx и зависимости.
4. Настроить `.env`, `systemd`, Nginx и SSL.

## 1. Windows CMD -> GitHub

```cmd
cd /d C:\Users\79613\Desktop\goy
git init
git branch -M main
git add .
git commit -m "Initial GOYKARTA deploy"
git remote add origin https://github.com/YOUR_GITHUB/YOUR_REPO.git
git push -u origin main
```

Если репозиторий уже создан и `remote` уже есть:

```cmd
cd /d C:\Users\79613\Desktop\goy
git add .
git commit -m "Update GOYKARTA"
git push
```

## 2. Ubuntu server

```bash
ssh root@151.243.18.144
apt update
apt install -y git curl nginx
```

## 3. Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v
```

## 4. Скачать проект

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/YOUR_GITHUB/YOUR_REPO.git goykarta
cd /var/www/goykarta
cp .env.example .env
nano .env
```

Заполни:

```env
PORT=3000
ADMIN_LOGIN=admin
ADMIN_PASSWORD=CHANGE_ME_NOW
TELEGRAM_URL=https://t.me/YOUR_CHANNEL
```

## 5. Установить зависимости

```bash
cd /var/www/goykarta
npm install
```

## 6. Права

```bash
chown -R www-data:www-data /var/www/goykarta
```

## 7. Systemd

```bash
cp /var/www/goykarta/deploy/goykarta.service /etc/systemd/system/goykarta.service
systemctl daemon-reload
systemctl enable --now goykarta
systemctl status goykarta
```

## 8. Nginx

```bash
cp /var/www/goykarta/deploy/goykarta.top.nginx /etc/nginx/sites-available/goykarta.top
ln -sf /etc/nginx/sites-available/goykarta.top /etc/nginx/sites-enabled/goykarta.top
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

## 9. Firewall

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
ufw status
```

## 10. SSL

```bash
apt remove -y certbot || true
apt install -y snapd
snap install core
snap refresh core
snap install --classic certbot
ln -sf /snap/bin/certbot /usr/local/bin/certbot
certbot --nginx -d goykarta.top -d www.goykarta.top
certbot renew --dry-run
```

Если `www.goykarta.top` не привязан в DNS, используй:

```bash
certbot --nginx -d goykarta.top
```

## 11. Проверка

```bash
curl -I http://goykarta.top
curl -I https://goykarta.top
systemctl status goykarta
systemctl status nginx
journalctl -u goykarta -n 100 --no-pager
```

## 12. Обновление после изменений

На Windows:

```cmd
cd /d C:\Users\79613\Desktop\goy
git add .
git commit -m "Update GOYKARTA"
git push
```

На сервере:

```bash
cd /var/www/goykarta
git pull
npm install
systemctl restart goykarta
systemctl status goykarta
```
