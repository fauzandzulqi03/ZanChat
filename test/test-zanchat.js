/**
 * Automated Verification & Testing Suite for ZanChat
 * Tests all Acceptance Criteria (AC-01 through AC-06) and Testing Matrix Scenarios
 */

// Set grace period lebih ringkas untuk lingkungan pengujian otomatis (300ms)
process.env.RECONNECT_GRACE_PERIOD_MS = '300';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { io: Client } = require('socket.io-client');
const { server } = require('../server');

async function runTests() {
  // Start server on an ephemeral port
  const port = await new Promise((resolve) => {
    const s = server.listen(0, '127.0.0.1', () => {
      resolve(s.address().port);
    });
  });

  const SERVER_URL = `http://127.0.0.1:${port}`;
  console.log(`[Test Setup] ZanChat test server berjalan di ${SERVER_URL}`);

  console.log('====================================================');
  console.log('   ZanChat Automated Acceptance Criteria Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, detail = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${detail}`);
      failed++;
    }
  }

  try {
    // 1. Test HTTP Serving of Static Assets
    console.log('--- Tahap 1: Verifikasi HTTP Endpoint & Static Files ---');
    await new Promise((resolve) => {
      http.get(SERVER_URL, (res) => {
        assert(res.statusCode === 200, 'AC-01: HTTP GET / merespons 200 OK');
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          assert(data.includes('ZanChat'), 'AC-01: HTML memuat judul branding ZanChat');
          assert(data.includes('hero-section'), 'AC-01: Desain hero-section hadir');
          assert(data.includes('login-modal'), 'AC-01: Modal input login hadir');
          assert(data.includes('username-input'), 'AC-02: Form input username hadir');
          assert(data.includes('btn-login'), 'AC-02: Tombol MASUK hadir');
          assert(!data.includes('—') && !data.includes('–'), 'SKILL: Bebas dari karakter em-dash/en-dash');
          resolve();
        });
      }).on('error', (err) => {
        assert(false, 'AC-01: Server dapat diakses via HTTP', err.message);
        resolve();
      });
    });

    // Helper function to create socket client
    function createClient() {
      return new Promise((resolve, reject) => {
        const socket = Client(SERVER_URL, {
          transports: ['websocket'],
          forceNew: true,
        });

        socket.on('connect', () => {
          resolve(socket);
        });

        socket.on('connect_error', (err) => {
          reject(err);
        });
      });
    }

    console.log('\n--- Tahap 2: Skenario Multi-Client Sync (AC-02 & AC-03) ---');
    // Client 1: Fauzan
    const clientFauzan = await createClient();
    let fauzanUsersList = [];
    clientFauzan.on('users:update', (users) => {
      fauzanUsersList = users;
    });

    // Client 2: Ratu
    const clientRatu = await createClient();
    let ratuUsersList = [];
    clientRatu.on('users:update', (users) => {
      ratuUsersList = users;
    });

    // Client 3: Ankit
    const clientAnkit = await createClient();
    let ankitUsersList = [];
    clientAnkit.on('users:update', (users) => {
      ankitUsersList = users;
    });

    // Join Fauzan
    await new Promise((resolve) => {
      clientFauzan.emit('user:join', { username: 'Fauzan' }, (res) => {
        assert(res.success === true, 'AC-02: Client Fauzan berhasil login');
        assert(res.user.username === 'Fauzan', 'AC-02: Data user Fauzan valid');
        resolve();
      });
    });

    // Join Ratu
    await new Promise((resolve) => {
      clientRatu.emit('user:join', { username: 'Ratu' }, (res) => {
        assert(res.success === true, 'AC-02: Client Ratu berhasil login');
        resolve();
      });
    });

    // Join Ankit
    await new Promise((resolve) => {
      clientAnkit.emit('user:join', { username: 'Ankit' }, (res) => {
        assert(res.success === true, 'AC-02: Client Ankit berhasil login');
        resolve();
      });
    });

    // Give socket events a moment to broadcast
    await new Promise(r => setTimeout(r, 200));

    assert(
      fauzanUsersList.length === 3 &&
      fauzanUsersList.some(u => u.username === 'Fauzan') &&
      fauzanUsersList.some(u => u.username === 'Ratu') &&
      fauzanUsersList.some(u => u.username === 'Ankit'),
      'AC-03: Sidebar Fauzan tersinkronisasi 3 pengguna (Fauzan, Ratu, Ankit)'
    );

    assert(
      ratuUsersList.length === 3 &&
      ratuUsersList.some(u => u.username === 'Fauzan') &&
      ratuUsersList.some(u => u.username === 'Ratu') &&
      ratuUsersList.some(u => u.username === 'Ankit'),
      'AC-03: Sidebar Ratu tersinkronisasi 3 pengguna secara real-time'
    );

    assert(
      ankitUsersList.length === 3 &&
      ankitUsersList.some(u => u.username === 'Fauzan') &&
      ankitUsersList.some(u => u.username === 'Ratu') &&
      ankitUsersList.some(u => u.username === 'Ankit'),
      'AC-03: Sidebar Ankit tersinkronisasi 3 pengguna secara real-time'
    );

    console.log('\n--- Tahap 3: Pengiriman Pesan Multi-Client (AC-04) ---');
    let ratuReceivedMessage = null;
    let ankitReceivedMessage = null;

    clientRatu.on('chat:message', (msg) => {
      ratuReceivedMessage = msg;
    });

    clientAnkit.on('chat:message', (msg) => {
      ankitReceivedMessage = msg;
    });

    // Fauzan sends a message: "Halo kawan-kawan!"
    const testMessage = 'Halo kawan-kawan, ini pengujian Socket.IO!';
    clientFauzan.emit('chat:message', { text: testMessage });

    await new Promise(r => setTimeout(r, 200));

    assert(
      ratuReceivedMessage !== null &&
      ratuReceivedMessage.sender === 'Fauzan' &&
      ratuReceivedMessage.text === testMessage,
      'AC-04: Pesan Fauzan diterima seketika oleh Client Ratu'
    );

    assert(
      ankitReceivedMessage !== null &&
      ankitReceivedMessage.sender === 'Fauzan' &&
      ankitReceivedMessage.text === testMessage,
      'AC-04: Pesan Fauzan diterima seketika oleh Client Ankit'
    );

    console.log('\n--- Tahap 4: Indikator Mengetik (Typing Indicator) (AC-05) ---');
    let ratuReceivedTyping = null;
    let ankitReceivedTyping = null;

    clientRatu.on('typing:update', (data) => {
      ratuReceivedTyping = data;
    });

    clientAnkit.on('typing:update', (data) => {
      ankitReceivedTyping = data;
    });

    // Fauzan starts typing
    clientFauzan.emit('typing:start');
    await new Promise(r => setTimeout(r, 150));

    assert(
      ratuReceivedTyping !== null &&
      ratuReceivedTyping.username === 'Fauzan' &&
      ratuReceivedTyping.isTyping === true,
      'AC-05: Indikator mengetik Fauzan muncul di client Ratu'
    );

    assert(
      ankitReceivedTyping !== null &&
      ankitReceivedTyping.username === 'Fauzan' &&
      ankitReceivedTyping.isTyping === true,
      'AC-05: Indikator mengetik Fauzan muncul di client Ankit'
    );

    // Fauzan stops typing
    clientFauzan.emit('typing:stop');
    await new Promise(r => setTimeout(r, 150));

    assert(
      ratuReceivedTyping !== null &&
      ratuReceivedTyping.isTyping === false,
      'AC-05: Indikator mengetik berhenti ketika typing:stop dikirimkan'
    );

    console.log('\n--- Tahap 5: Disconnect Handling & Notifikasi Keluar (AC-06) ---');
    let ratuReceivedSystemNotification = null;
    clientRatu.on('system:notification', (notif) => {
      if (notif.type === 'leave') {
        ratuReceivedSystemNotification = notif;
      }
    });

    // Ankit closes browser tab / disconnects permanen
    clientAnkit.disconnect();
    await new Promise(r => setTimeout(r, 450));

    assert(
      ratuUsersList.length === 2 &&
      !ratuUsersList.some(u => u.username === 'Ankit'),
      'AC-06: Nama Ankit otomatis hilang dari daftar sidebar setelah disconnect'
    );

    assert(
      fauzanUsersList.length === 2 &&
      !fauzanUsersList.some(u => u.username === 'Ankit'),
      'AC-06: Nama Ankit otomatis hilang dari daftar sidebar Fauzan'
    );

    assert(
      ratuReceivedSystemNotification !== null &&
      ratuReceivedSystemNotification.username === 'Ankit' &&
      ratuReceivedSystemNotification.text.includes('Ankit meninggalkan'),
      'AC-06: Notifikasi sistem "Ankit meninggalkan ruang obrolan" diterima pengguna lain'
    );

    // --- Tahap 6: Persistensi Sesi & Event Join Alias ---
    console.log('\n--- Tahap 6: Verifikasi Persistensi Sesi & Socket Join ---');
    const clientPersist = await createClient();
    await new Promise((resolve) => {
      clientPersist.emit('join', { username: 'BudiSesi' }, (res) => {
        assert(res.success === true, 'Sesi: Socket server merespons event join alias');
        assert(res.user.username === 'BudiSesi', 'Sesi: Data user sesi valid');
        resolve();
      });
    });

    const appJsContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
    assert(appJsContent.includes("'zanchat_username'"), 'Sesi: Kunci sessionStorage zanchat_username hadir di app.js');
    assert(appJsContent.includes('sessionStorage.setItem'), 'Sesi: Logika sessionStorage.setItem hadir di app.js');
    assert(appJsContent.includes('sessionStorage.getItem'), 'Sesi: Logika sessionStorage.getItem hadir di app.js');
    assert(appJsContent.includes('sessionStorage.removeItem'), 'Sesi: Logika sessionStorage.removeItem hadir di app.js');
    assert(appJsContent.includes('isJoined'), 'Sesi: Flag isJoined hadir untuk mencegah double emit');
    assert(appJsContent.includes('renderChatHistory'), 'History: Fungsi renderChatHistory hadir di app.js');
    assert(appJsContent.includes("'user:logout'"), 'Logout: Event user:logout hadir di app.js');

    // --- Tahap 7: Retensi Chat History & Pencegahan Notifikasi saat Reload ---
    console.log('\n--- Tahap 7: Verifikasi Retensi Chat History & Cegah Notifikasi Reload ---');
    
    // Kirim pesan dari clientPersist untuk mengisi messageHistory
    await new Promise((resolve) => {
      clientPersist.emit('chat:message', { text: 'Pesan untuk uji riwayat chat!' });
      setTimeout(resolve, 150);
    });

    // Verifikasi Privasi Pengguna Baru: login pertama kali TIDAK menerima pesan lama
    const clientUserBaru = await createClient();
    await new Promise((resolve) => {
      clientUserBaru.emit('user:join', { username: 'UserBaruBersih', isAutoLogin: false }, (res) => {
        assert(res.success === true, 'Privasi: Pengguna baru berhasil login');
        assert(Array.isArray(res.history) && res.history.length === 0, 'Privasi: Pengguna baru TIDAK menerima riwayat pesan lama');
        resolve();
      });
    });
    clientUserBaru.disconnect();

    // Pasang listener notifikasi di clientFauzan untuk menguji apakah ada notifikasi saat reload
    let fauzanReceivedNotifDuringReload = false;
    const testReloadNotifHandler = (notif) => {
      if (notif.username === 'BudiSesi') {
        fauzanReceivedNotifDuringReload = true;
      }
    };
    clientFauzan.on('system:notification', testReloadNotifHandler);

    // Simulasi Page Reload:
    // 1. clientPersist disconnect (memicu grace period di server)
    clientPersist.disconnect();

    // 2. Dalam jeda grace period (100ms < 300ms), tab baru terbuka dan reconnect dengan username yang sama
    await new Promise(r => setTimeout(r, 100));
    const clientReloaded = await createClient();
    let reloadedReceivedHistory = [];
    await new Promise((resolve) => {
      clientReloaded.emit('user:join', { username: 'BudiSesi', isAutoLogin: true }, (res) => {
        assert(res.success === true, 'Reload: Client berhasil re-join dengan sesi');
        assert(Array.isArray(res.history), 'Reload: Server mengembalikan array history');
        assert(res.history.length > 0, 'Reload: Riwayat pesan tidak kosong');
        assert(res.history.some(m => m.text === 'Pesan untuk uji riwayat chat!'), 'Reload: Pesan sebelumnya ada di history');
        reloadedReceivedHistory = res.history;
        resolve();
      });
    });

    // 3. Beri jeda lebih lama dari grace period (400ms > 300ms) untuk memastikan notifikasi leave/join TIDAK disiarkan
    await new Promise(resolve => setTimeout(resolve, 400));
    assert(!fauzanReceivedNotifDuringReload, 'Reload: Server SAMA SEKALI TIDAK menyiarkan notifikasi leave atau join saat reload');

    clientFauzan.off('system:notification', testReloadNotifHandler);

    // --- Tahap 8: Verifikasi Logout Manual Eksplisit ---
    console.log('\n--- Tahap 8: Verifikasi Logout Manual Eksplisit ---');
    let ratuReceivedLogoutNotif = false;
    const testLogoutNotifHandler = (notif) => {
      if (notif.type === 'leave' && notif.username === 'BudiSesi') {
        ratuReceivedLogoutNotif = true;
      }
    };
    clientRatu.on('system:notification', testLogoutNotifHandler);

    // clientReloaded memanggil event user:logout
    clientReloaded.emit('user:logout');
    await new Promise(r => setTimeout(r, 100));

    assert(ratuReceivedLogoutNotif === true, 'Logout: Server langsung menyiarkan notifikasi leave saat user:logout tanpa menunggu jeda');
    clientRatu.off('system:notification', testLogoutNotifHandler);

    clientReloaded.disconnect();

    // --- Tahap 9: Verifikasi Pembersihan Fitur (Refactoring & Posisi Waktu Bubble) ---
    console.log('\n--- Tahap 9: Verifikasi Pembersihan Fitur (Refactoring & Posisi Waktu Bubble) ---');

    // 1. Verifikasi Komponen HTML & CSS
    const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    const styleCss = fs.readFileSync(path.join(__dirname, '../public/css/style.css'), 'utf8');
    const appJs = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

    let appJsSyntaxValid = false;
    try {
      new Function(appJs);
      appJsSyntaxValid = true;
    } catch (e) {
      appJsSyntaxValid = false;
    }
    assert(appJsSyntaxValid, 'Syntax: Berkas public/js/app.js valid 100% dan bebas dari SyntaxError');

    // Verifikasi fitur yang disederhanakan hadir
    assert(indexHtml.includes('btn-start-chat'), 'Feature: Tombol Mulai Obrolan (btn-start-chat) hadir di HTML');
    assert(indexHtml.includes('landing-page'), 'Feature: Elemen Landing Page (landing-page) hadir di HTML');
    assert(indexHtml.includes('chat-app'), 'Feature: Elemen Chat App (chat-app) hadir di HTML');
    assert(indexHtml.includes('username-input'), 'Feature: Form input nama hadir di HTML');
    assert(indexHtml.includes('btn-login'), 'Feature: Tombol MASUK hadir di HTML');

    // Verifikasi fitur yang dihapus sudah bersih
    assert(!indexHtml.includes('tab-btn-email') && !indexHtml.includes('btn-auth-google'), 'Cleanup: Multi-metode login dihapus dari HTML');
    assert(!indexHtml.includes('gender-male') && !indexHtml.includes('gender-female'), 'Cleanup: Pilihan gender dihapus dari HTML');
    assert(!indexHtml.includes('btn-toggle-sound'), 'Cleanup: Toggle suara notifikasi dihapus dari HTML');
    assert(!indexHtml.includes('emoji-popover'), 'Cleanup: Popover emoji dihapus dari HTML');
    assert(!indexHtml.includes('welcome-box') && !indexHtml.includes('Selamat Datang di ZanChat') && !indexHtml.includes('chat-welcome-notice'), 'Cleanup: Banner selamat datang dihapus total dari HTML');

    // Verifikasi CSS struktur waktu bubble baru
    assert(styleCss.includes('.message-bubble'), 'CSS: Style message-bubble hadir');
    assert(styleCss.includes('.message-text'), 'CSS: Style message-text hadir');
    assert(styleCss.includes('.message-time'), 'CSS: Style message-time hadir');
    assert(!styleCss.includes('.message-status.status-delivered'), 'Cleanup: Status centang dihapus dari CSS');
    assert(!styleCss.includes('.emoji-popover'), 'Cleanup: Emoji popover dihapus dari CSS');

    // Verifikasi JS bersih
    assert(appJs.includes('handleStartChatClick'), 'JS: Handler klik tombol Mulai Obrolan hadir');
    assert(appJs.includes('appendChatMessage'), 'JS: Fungsi appendChatMessage hadir');
    assert(appJs.includes('zanchat_join_time'), 'Privacy: Kunci zanchat_join_time hadir di app.js');
    assert(!appJs.includes('playNotificationSound'), 'Cleanup: Logika Web Audio dihapus dari app.js');
    assert(!appJs.includes('getCheckmarkHtml'), 'Cleanup: Logika centang status dihapus dari app.js');
    assert(!appJs.includes('toggleEmojiPopover'), 'Cleanup: Logika emoji dihapus dari app.js');
    assert(!appJs.includes('Selamat Datang di ZanChat'), 'Cleanup: Logika banner selamat datang dihapus dari app.js');

    // 2. Verifikasi Socket: Login Sederhana & Broadcast Pesan Baru
    const clientCleanTest = await createClient();
    let cleanJoinRes = null;
    await new Promise((resolve) => {
      clientCleanTest.emit('join', {
        username: 'DewiRefactor',
        isAutoLogin: false,
        isInitialLogin: true,
      }, (res) => {
        cleanJoinRes = res;
        resolve();
      });
    });

    assert(cleanJoinRes && cleanJoinRes.success, 'Feature: Login dengan nama berhasil');
    assert(cleanJoinRes.user && cleanJoinRes.user.username === 'DewiRefactor', 'Feature: Server menyimpan nama pengguna');

    // Uji Pengiriman Pesan Sederhana
    let messageBroadcastData = null;
    clientFauzan.once('chat:message', (data) => {
      messageBroadcastData = data;
    });

    clientCleanTest.emit('chat:message', {
      text: 'Halo dari pesan obrolan yang bersih dan simpel!',
    });

    // Tunggu broadcast sampai
    await new Promise(r => setTimeout(r, 100));
    assert(messageBroadcastData && messageBroadcastData.sender === 'DewiRefactor', 'Feature: Pesan broadcast diterima pengguna lain');
    assert(messageBroadcastData && messageBroadcastData.text === 'Halo dari pesan obrolan yang bersih dan simpel!', 'Feature: Teks pesan obrolan valid');

    // --- Tahap 10: Verifikasi Strict Join Time Scope untuk Riwayat Obrolan saat Reload ---
    console.log('\n--- Tahap 10: Verifikasi Strict Join Time Scope Riwayat Obrolan saat Reload ---');

    // 1. DewiRefactor kirim pesan lama sebelum pengguna berikutnya masuk
    await new Promise((resolve) => {
      clientCleanTest.emit('chat:message', { text: 'Pesan rahasia sebelum LateUser bergabung' }, resolve);
    });
    await new Promise(r => setTimeout(r, 100));

    // 2. LateUser bergabung pertama kali setelah pesan di atas sudah terkirim
    const lateJoinTime = Date.now();
    const clientLate = await createClient();
    await new Promise((resolve) => {
      clientLate.emit('join', {
        username: 'LateUser',
        isAutoLogin: false,
        isInitialLogin: true,
        joinTime: lateJoinTime,
      }, (res) => {
        assert(res.success === true, 'Strict Scope: LateUser berhasil masuk');
        assert(Array.isArray(res.history) && res.history.length === 0, 'Strict Scope: LateUser tidak menerima riwayat lama saat join pertama');
        resolve();
      });
    });

    // 3. LateUser mengirimkan pesan baru setelah dia bergabung
    await new Promise((resolve) => {
      clientLate.emit('chat:message', { text: 'Halo saya LateUser baru bergabung!' }, resolve);
    });
    await new Promise(r => setTimeout(r, 100));

    // 4. Simulasi reload oleh LateUser (disconnect lalu reconnect dengan isAutoLogin: true & joinTime sama)
    clientLate.disconnect();
    await new Promise(r => setTimeout(r, 100));

    const clientLateReloaded = await createClient();
    let lateReloadHistory = null;
    await new Promise((resolve) => {
      clientLateReloaded.emit('join', {
        username: 'LateUser',
        isAutoLogin: true,
        joinTime: lateJoinTime,
      }, (res) => {
        assert(res.success === true, 'Strict Scope: LateUser berhasil reload dengan sesi');
        lateReloadHistory = res.history;
        resolve();
      });
    });

    assert(Array.isArray(lateReloadHistory), 'Strict Scope: Server mengirim array riwayat untuk user yang reload');
    assert(lateReloadHistory.some(m => m.text === 'Halo saya LateUser baru bergabung!'), 'Strict Scope: Pesan yang dikirim setelah LateUser join hadir di riwayat');
    assert(!lateReloadHistory.some(m => m.text === 'Pesan rahasia sebelum LateUser bergabung'), 'Strict Scope: Pesan lama sebelum LateUser bergabung TIDAK BOLEH muncul di riwayat');

    clientLateReloaded.disconnect();
    clientCleanTest.disconnect();

    // Clean up remaining clients
    clientFauzan.disconnect();
    clientRatu.disconnect();

  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log(` HASIL PENGUJIAN: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
