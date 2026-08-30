# Binance Futures AI Trade Bot — Google Cloud (Ücretsiz, Sabit IP)

Bu sürüm Netlify yerine **Google Cloud'un "Always Free" sunucusunda** çalışır.
Sebep: Binance, Futures işlem izni açık bir API anahtarına **sabit bir IP
kısıtlaması** koymanı şart koşuyor — Netlify'de bu ücretsiz mümkün değil, Google
Cloud'un ücretsiz sunucusunda mümkün.

Bu sürümde dashboard + bot motoru **tek bir sunucuda**, tek bir Node.js
sürecinde çalışıyor. Veriler (ayarlar, işlem geçmişi, geri bildirimler)
sunucunun diskinde basit dosyalar olarak tutuluyor.

## 1. Google Cloud hesabı ve sunucu oluştur

1. [console.cloud.google.com](https://console.cloud.google.com) adresine git,
   hesap oluştur (kredi kartı istenir, doğrulama içindir — Always Free
   sınırları içinde kaldığın sürece ücret kesilmez).
2. Sol üstten **Compute Engine → VM instances → Create Instance**.
3. Ayarlar:
   - **Name:** `binance-bot`
   - **Region:** `us-central1`, `us-west1` ya da `us-east1` (Always Free için uygun bölgeler)
   - **Machine type:** `e2-micro` (ücretsiz katman)
   - **Boot disk:** Ubuntu (en güncel LTS sürüm), 30GB'a kadar ücretsiz
4. **Create**'e bas, birkaç saniyede sunucu hazır olur.

## 2. Sabit IP ayarla

1. Sol menüden **VPC network → IP addresses**.
2. **Reserve external static address** → oluşturduğun `binance-bot` sunucusuna bağla.
3. Bu IP adresini bir yere not et (örn. `34.123.45.67`) — hem dashboard'a
   girmek hem Binance'e tanımlamak için lazım.

## 3. Dashboard'a erişim için firewall kuralı

1. **VPC network → Firewall → Create firewall rule**
2. Name: `allow-dashboard`, Targets: All instances, Source: `0.0.0.0/0`,
   Protocols: `tcp:3000` işaretle → Create.

## 4. Sunucuya bağlan ve kurulumu yap

1. Compute Engine → VM instances listesinde `binance-bot`'un yanındaki
   **SSH** butonuna bas — tarayıcıda bir terminal açılır, hiçbir şey
   bilgisayarına kurman gerekmiyor.
2. Açılan terminalde sırayla:

```
sudo apt update
sudo apt install -y nodejs npm git
node --version
```

(Node 18 ya da üzeri çıkmalı; çıkmazsa söyle, güncel sürümü kurmak için
ayrı bir komut vereyim.)

3. Kendi GitHub reposunu (daha önce Binance-AI-Bot'u yüklediğin repo) klonla —
   bu sefer bu VM koduyla değiştireceğiz. Eğer aynı repoyu kullanmak
   istersen, önce GitHub'daki repoya bu klasörün içeriğini yüklememiz
   gerekiyor (Codespaces ile aynı yöntemle, ya da bana söyle yeni bir repo
   için de aynı adımları tekrar çıkarayım).

```
git clone https://github.com/KULLANICI_ADIN/REPO_ADIN.git bot
cd bot
npm install
npm run build
```

4. Süreç yöneticisi kur (sunucu çökerse/VM yeniden başlarsa botu otomatik
   ayağa kaldırsın diye):

```
sudo npm install -g pm2
PORT=3000 pm2 start server/index.js --name bot
pm2 save
pm2 startup
```

Son komut sana kopyalayıp çalıştırman gereken bir satır daha verecek
(`sudo env PATH=...` ile başlayan) — onu da terminale yapıştır, Enter'a bas.

## 5. Dashboard'a gir

Tarayıcıda `http://SABIT_IP_ADRESIN:3000` adresine git (2. adımda not
ettiğin IP). Dashboard açılmalı.

## 6. Binance'te IP kısıtlaması ekle

1. Binance → API Management → oluşturduğun anahtarın yanındaki **Edit restrictions**
2. **"Restrict access to trusted IPs only"** seç
3. Sunucunun sabit IP'sini (`34.123.45.67` gibi) yapıştır, ekle
4. Şimdi **Enable Futures**'ı işaretleyebilirsin — artık silinme riski yok
5. Kaydet

## 7. Ayarları doldur, test et

Dashboard → **Ayarlar** → API anahtarlarını gir, bütçe/risk ayarlarını yap,
kaydet → **Kurallar & Geri Bildirim** → stratejini yaz → **Dashboard** →
**Şimdi Çalıştır** ile test et.

## Güvenlik notu

Dashboard şu an şifresiz, çıplak bir IP:port üzerinden herkese açık — bu,
gizli bir Netlify linkinden daha kolay bulunabilir (IP tarayan botlar
olabilir). İstersen tek satırlık bir ortam değişkeniyle şifre ekleyebiliriz:
`pm2 start server/index.js --name bot -- --env APP_PASSWORD=güçlübirşifre`
şeklinde, ya da `pm2 restart bot --update-env` ile sonradan da ekleyebiliriz.
Söylersen şimdi ekleyelim.

## Sunucuyu güncellemek istersen

Koda bir değişiklik yapıp yeniden yüklemek istediğinde:
```
cd ~/bot
git pull
npm install
npm run build
pm2 restart bot
```

## Bir şey yanlış giderse

```
pm2 logs bot
```
ile canlı hata loglarını görebilirsin. Hata mesajını bana yapıştır.
