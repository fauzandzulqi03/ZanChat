# ZanChat: Real-Time Web Chat Application

Aplikasi web obrolan real-time berbasis koneksi socket dua arah (*full-duplex*) yang dibangun dengan **Node.js**, **Express**, dan **Socket.IO**. Dirancang untuk memenuhi penugasan mata kuliah Sistem Paralel dan Terdistribusi (Sesi 5 - Implementasi Pemrograman Socket pada Web).

---

## 1. Fitur Utama

- **Split-Screen Landing Page**: Desain masuk solid 50/50 dengan identitas platform di sisi kiri dan formulir masuk pengguna di sisi kanan.
- **Transisi Halus (*Smooth Transition*)**: Transisi *fade-out* dari layar login langsung menuju *dashboard* tanpa memuat ulang (*refresh*) halaman.
- **Sinkronisasi Pengguna Aktif (*Real-Time Online Users*)**: Sidebar menampilkan daftar seluruh pengguna yang sedang aktif secara otomatis.
- **Obrolan Publik Instan**: Pesan yang dikirimkan langsung tersiar ke seluruh klien dengan latensi minimal.
- **Pembedaan Gelembung Pesan (*Chat Bubbles*)**: Membedakan pesan milik sendiri (*me*) dan pesan pengguna lain (*other*), dilengkapi nama pengirim dan stempel waktu (*timestamp*).
- **Indikator Mengetik Real-Time (*Typing Indicator*)**: Menampilkan status ketika pengguna lain sedang mengetik pesan secara langsung.
- **Notifikasi Sistem Otomatis**: Pesan sistem di tengah layar ketika ada pengguna yang bergabung atau meninggalkan ruang obrolan.
- **Desain Bersih & Solid (Anti-Slop)**: Mematuhi panduan antarmuka profesional tanpa efek neon, tanpa efek kaca transparan (*glassmorphism*) berlebihan, dan dengan kontras tinggi berstandar WCAG AA.

---

## 2. Struktur Proyek

```text
ChatRealtime/
├── package.json          # Konfigurasi dependensi dan skrip proyek
├── server.js             # Server Node.js + Express + Socket.IO
├── test/
│   └── test-zanchat.js   # Pengujian otomatis Acceptance Criteria (AC-01 s/d AC-06)
├── public/               # File frontend statis
│   ├── index.html        # Struktur HTML5 (Landing Page & Dashboard)
│   ├── css/
│   │   └── style.css     # Tata letak modern, CSS Grid/Flexbox, palet solid slate
│   └── js/
│       └── app.js        # Logika antarmuka klien dan penanganan event Socket.IO
├── PRD.md                # Dokumen Spesifikasi Kebutuhan Produk
└── README.md             # Dokumentasi petunjuk penggunaan
```

---

## 3. Prasyarat Sistem

- **Node.js** versi 18 ke atas (disarankan Node.js LTS).
- **npm** versi 9 ke atas.

---

## 4. Cara Menjalankan Aplikasi

1. **Instalasi Dependensi** (jika belum diinstal):
   ```bash
   npm install
   ```

2. **Menjalankan Server**:
   ```bash
   npm start
   ```
   Server akan aktif di: `http://localhost:3000`

3. **Membuka di Browser**:
   Buka peramban web dan arahkan ke alamat:
   ```
   http://localhost:3000
   ```

4. **Uji Coba Multi-Pengguna**:
   Buka beberapa tab atau jendela browser yang berbeda (misalnya: Fauzan, Ratu, dan Ankit) untuk melihat sinkronisasi daftar online, pengiriman pesan, dan indikator mengetik secara real-time.

---

## 5. Menjalankan Pengujian Otomatis

Aplikasi ini dilengkapi pengujian otomatis yang memverifikasi seluruh kriteria penerimaan (**Acceptance Criteria AC-01 sampai AC-06**):

```bash
npm test
```

### Hasil yang Diharapkan:
- **AC-01**: HTTP Endpoint & File Statis (Landing page split-screen & branding)
- **AC-02**: Login & Inisialisasi Sesi Pengguna
- **AC-03**: Sinkronisasi Daftar Pengguna Online di Seluruh Klien
- **AC-04**: Pengiriman Pesan Instan Antar-Klien
- **AC-05**: Indikator Mengetik Real-Time (*Typing Indicator*)
- **AC-06**: Penanganan Disconnect & Notifikasi Keluar Otomatis

---

## 6. Protokol Komunikasi Socket.IO

| Event | Arah | Keterangan |
| :--- | :--- | :--- |
| `user:join` | Client -> Server | Mengirimkan nama pengguna untuk masuk |
| `users:update` | Server -> All Clients | Memperbarui daftar seluruh pengguna yang aktif |
| `system:notification` | Server -> All Clients | Notifikasi pengguna baru bergabung atau keluar |
| `chat:message` | Bidirectional | Mengirim dan menyiarkan pesan obrolan |
| `typing:start` | Client -> Server | Memberitahu bahwa pengguna mulai mengetik |
| `typing:stop` | Client -> Server | Memberitahu bahwa pengguna berhenti mengetik |
| `typing:update` | Server -> Other Clients | Menyiarkan status mengetik ke pengguna lain |
| `disconnect` | Socket Lifecycle | Membersihkan sesi dan menyiarkan status keluar |

---

## 7. Lisensi

Proyek ini dibuat untuk keperluan akademik tugas Sesi 5 Sistem Paralel dan Terdistribusi.
