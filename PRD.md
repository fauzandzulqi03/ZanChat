# Product Requirement Document (PRD)
## ZanChat: Real-Time Web Chat Application
**Mata Kuliah:** Sistem Paralel dan Terdistribusi  
**Proyek:** Tugas Sesi 5 - Implementasi Pemrograman Socket pada Web  

---

## 1. Ringkasan Eksekutif (Executive Summary)
ZanChat adalah aplikasi web komunikasi *real-time* berbasis *socket* yang dirancang untuk memenuhi penugasan mata kuliah Sistem Paralel dan Terdistribusi. Aplikasi ini mengimplementasikan protokol komunikasi dua arah (*full-duplex*) menggunakan Node.js dan Socket.IO. Berbeda dengan aplikasi konvensional berbasis HTTP *request-response*, ZanChat mempertahankan koneksi persisten (*persistent connection*) antara *client* dan *server* untuk memastikan penyampaian pesan, pembaruan status pengguna, dan notifikasi sistem terjadi secara instan tanpa perlu memuat ulang (*refresh*) halaman web.

Desain antarmuka ZanChat mengusung filosofi *clean, minimalist, and professional*, menghindari elemen visual yang berlebihan seperti warna neon, efek transparansi kaca (*glassmorphism*) yang rumit, atau grafik 3D/emoji AI. Fokus utama produk adalah pengalaman pengguna (*User Experience*) yang intuitif, fungsional, dan stabil.

---

## 2. Tujuan Produk & Pembelajaran (Objectives)
* **Memahami Konsep Socket:** Mengaplikasikan teori pemrograman *socket* dan jaringan komputer dalam skenario nyata pengembangan web.
* **Komunikasi Client-Server:** Mengimplementasikan arsitektur *event-driven* menggunakan WebSocket melalui pustaka Socket.IO.
* **Antarmuka Pengguna Fungsional:** Menyediakan antarmuka web modern yang responsif, bersih, dan mudah digunakan.
* **Manajemen Sesi Dinamis:** Mengelola status kehadiran (*online/offline*) pengguna secara otomatis berdasarkan siklus hidup koneksi *socket*.

---

## 3. Arsitektur Teknis (Technical Architecture)
Aplikasi dibangun menggunakan model arsitektur *Client-Server* terpusat (*Centralized Architecture*), di mana server bertindak sebagai pengelola lalu lintas data (*traffic controller*).

```text
[ Browser Client A ]  <-- (WebSocket / TCP) -->  [ Node.js + Express + Socket.IO Server ]
[ Browser Client B ]  <-- (WebSocket / TCP) -->  [ (Pusat Logika & Broadcast)            ]
```

### **Tech Stack:**
* **Backend:** Node.js, Express.js, Socket.IO
* **Frontend:** HTML5, CSS3 (Modern Flexbox/Grid), Vanilla JavaScript
* **Protokol Jaringan:** TCP / WebSocket

---

## 4. Spesifikasi Fitur (Feature Specifications)

### **A. Halaman Masuk / Landing Page (Split-Screen)**
* **Layout:** Membagi layar menjadi dua sisi (model *split-screen* solid tanpa efek transparan atau elemen neon).
* **Sisi Kiri (Branding):** Menampilkan identitas aplikasi dengan nama **ZanChat**, logo minimalis, dan deskripsi singkat mengenai platform.
* **Sisi Kanan (Form Masuk):** 
  * Kolom input tunggal (*text input*) untuk memasukkan nama pengguna (*Username*).
  * Tombol aksi solid berlabel **MASUK**.
  * Validasi sederhana: Tombol tidak dapat diproses jika kolom nama kosong.
* **Transisi:** Saat tombol **MASUK** ditekan, layar login memudar dengan mulus (*fade out*) dan beralih ke halaman *dashboard* utama aplikasi.

### **B. Dashboard Chat Utama**
* **Sidebar Kiri (Online Users):**
  * Menampilkan daftar nama seluruh pengguna yang sedang aktif/terhubung ke server secara *real-time*.
  * Pembaruan daftar terjadi otomatis ketika ada pengguna baru yang bergabung atau keluar.
* **Area Obrolan Tengah (Main Chat Panel):**
  * Ruang obrolan publik (*Public Room*).
  * Menampilkan gelembung pesan (*chat bubbles*) yang membedakan pesan milik sendiri (*me*) dan pesan dari pengguna lain (*other*).
  * Setiap pesan dilengkapi dengan informasi nama pengirim dan waktu pengiriman (*timestamp*).
  * Notifikasi sistem (*system notification*) di tengah layar saat ada pengguna yang bergabung atau meninggalkan ruang obrolan.
* **Panel Input Pesan & Interaksi:**
  * Kolom pengetikan teks dengan tombol kirim instan.
  * Fitur *Typing Indicator* (*"... [Username] is typing"*) yang muncul secara *real-time* saat pengguna lain sedang mengetik pesan.

---

## 5. Kriteria Penerimaan (Acceptance Criteria)

| ID Fitur | Deskripsi Kriteria Pengujian | Status / Harapan |
| :--- | :--- | :--- |
| **AC-01** | Pengguna dapat mengakses halaman utama ZanChat dan melihat desain *split-screen* tanpa gangguan visual neon/AI. | **Lolos** |
| **AC-02** | Pengguna dapat memasukkan nama pada form dan menekan tombol **MASUK** untuk masuk ke ruang obrolan. | **Lolos** |
| **AC-03** | Server mencatat koneksi *socket* baru dan memperbarui daftar *Online Users* di sidebar semua client terhubung. | **Lolos** |
| **AC-04** | Pesan yang dikirimkan oleh Client A muncul seketika di layar Client B dan Client C tanpa *refresh* halaman. | **Lolos** |
| **AC-05** | Indikator mengetik (*typing indicator*) berfungsi ketika salah satu pengguna mulai mengetik di kolom input. | **Lolos** |
| **AC-06** | Saat salah satu client menutup tab browser, server otomatis memutuskan koneksi dan memperbarui daftar user. | **Lolos** |

---

## 6. Matriks Pengujian Sistem (Testing Matrix)

| No. | Skenario Pengujian | Langkah Pengujian | Hasil yang Diharapkan |
| :---: | :--- | :--- | :--- |
| 1 | **Akses & Login** | Buka `http://localhost:3000`, masukkan nama, klik **MASUK**. | Halaman beralih mulus ke *dashboard* chat utama. |
| 2 | **Multi-Client Sync** | Buka 3 tab browser berbeda dengan nama (Fauzan, Ratu, Ankit). | Ketiga nama muncul di sidebar masing-masing tab secara bersamaan. |
| 3 | **Pengiriman Pesan** | Fauzan mengetik dan mengirim pesan "Halo". | Pesan langsung muncul di tab Ratu dan Ankit dengan latensi minimal. |
| 4 | **Disconnect Handling** | Tutup salah satu tab browser (misal: Ankit). | Nama Ankit hilang dari daftar sidebar dan muncul notifikasi keluar. |