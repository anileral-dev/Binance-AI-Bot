# Binance Futures AI Trade Bot — Web Dashboard (Netlify)

Bu sürüm önceki koddan daha az dosyayla aynı işi yapıyor — GitHub'a yüklerken
sorun yaşamayasın diye tüm backend mantığı 3 dosyada, tüm arayüz 1 dosyada
toplandı.

## Klasördeki dosyalar (toplam 10 dosya)

```
package.json          → bağımlılıklar
netlify.toml           → build ve zamanlama ayarları
vite.config.js          → derleme ayarı
index.html              → sayfa iskeleti
src/main.jsx             → React başlangıç noktası
src/App.jsx               → TÜM arayüz (Dashboard + Ayarlar + Kurallar + Geri Bildirim, tek dosya)
src/styles.css             → görünüm
netlify/functions/_shared.js → TÜM backend mantığı (Binance, göstergeler, Claude, depolama, karar motoru)
netlify/functions/api.js      → dashboard'un konuştuğu tek API ucu (?action=... ile yönlenir)
netlify/functions/bot-engine.js → zamanlanmış otomatik çalışma
```

Önceki sürümde `netlify/functions` altında 8 ayrı dosya, `src/pages` altında 3
ayrı dosya vardı. Şimdi ikisi de birer dosyada birleşti, GitHub'a
sürüklerken kaybolma/eksik kalma riski çok azaldı.

## Deploy adımları — aynı, değişmedi

### 1. GitHub'a yükle
En sorunsuz yol **GitHub Desktop**:
1. desktop.github.com'dan indir, kur, hesabınla giriş yap
2. File → Add local repository → bu klasörü (`bot-web` ya da nasıl adlandırdıysan) seç
3. Sol tarafta 10 dosyanın hepsi işaretli görünecek, "Commit to main" de
4. Üstten "Publish repository" de, isim ver, Publish'e bas

(İstersen GitHub.com'un web yükleyicisiyle de olur — dosya sayısı azaldığı için
bu sefer sorunsuz gitmesi lazım — ama GitHub Desktop daha garanti.)

### 2. Netlify'da bağla
1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**
2. GitHub'ı seç, repoyu seç
3. Build ayarları `netlify.toml`'da hazır, hiçbir şey değiştirme
4. **Deploy site**

### 3. Siteyi doldur
Deploy bitince linke gir:
1. **Ayarlar** sekmesi → Binance API Key/Secret, Anthropic API Key, testnet/gerçek
   para, semboller, kaldıraç, risk/bütçe ayarları → Kaydet
2. **Kurallar & Geri Bildirim** sekmesi → strateji kurallarını yaz → Kaydet
3. **Dashboard** sekmesi → **Şimdi Çalıştır** ile test et

Bundan sonra bot, site yayında olduğu sürece her 5 dakikada bir arka planda
otomatik tetiklenir, seçtiğin zaman dilimine göre gerçek karar alıp
almayacağına kendisi karar verir.

## Güvenlik notu (değişmedi)

Şifre koruması istemediğini söylemiştin. Linki kimseyle paylaşma — link'i
bilen herkes API anahtarlarını görüp ayarları değiştirebilir. Fikrini
değiştirirsen Netlify Site Settings → Visitor Access → Password protection
ile tek satırlık bir ayarla ekleyebiliriz.

## Bir şey yanlış giderse

Netlify'da **Functions** sekmesinden `api` ve `bot-engine` fonksiyonlarının
loglarını görebilirsin. Hata mesajını bana yapıştır, birlikte bakarız.
