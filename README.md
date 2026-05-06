# WU Odoo Mobile Client

Aplikasi Android WebView untuk Odoo 13, dibangun dengan Apache Cordova.

## Fitur
- Input alamat server Odoo (IP/hostname + port)
- Pilih protokol HTTP / HTTPS
- Daftar database otomatis dari server
- Input database manual jika list tidak tersedia
- WebView penuh untuk akses Odoo
- Side menu: ganti server, ganti database, reload, logout
- Simpan server terakhir (maks 5)
- Kompatibel dengan HTTP (cleartext) untuk jaringan lokal

## Build via GitHub Actions

Push ke branch `main` atau `master` akan otomatis trigger build.

Hasil APK tersedia di tab **Actions → Artifacts**:
- `wu-odoo-debug-apk` — untuk testing langsung
- `wu-odoo-release-unsigned-apk` — release tanpa tanda tangan
- `wu-odoo-release-signed-apk` — release bertanda tangan (butuh secrets)

## Setup Signing (Opsional)

Untuk APK yang bisa diinstall tanpa "Unknown Sources", tambahkan secrets di GitHub:

| Secret | Isi |
|--------|-----|
| `KEYSTORE_BASE64` | Keystore di-encode base64 |
| `KEYSTORE_PASSWORD` | Password keystore |
| `KEY_ALIAS` | Alias key |
| `KEY_PASSWORD` | Password key |

Generate keystore:
```bash
keytool -genkey -v -keystore wu_odoo.keystore \
  -alias wu_odoo -keyalg RSA -keysize 2048 -validity 10000

# Encode ke base64
base64 wu_odoo.keystore
```

## Build Lokal

```bash
npm install
npm install -g cordova
cordova platform add android
cordova build android --debug
```

APK output: `platforms/android/app/build/outputs/apk/debug/app-debug.apk`
