const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const PORT = process.env.PORT || 3000;

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// Store connected users: socketId -> { username, joinedAt }
const connectedUsers = new Map();

// In-Memory Message History (Maksimal 50 pesan terakhir)
const MAX_HISTORY_MESSAGES = 50;
const messageHistory = [];

// In-Memory Groups Store: code -> { code, name, createdBy, createdAt, members: Set, history: [] }
const groups = new Map();

/**
 * Menghasilkan kode grup acak 6 karakter unik (contoh: ZAN892)
 */
function generateGroupCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = 'ZAN';
    for (let i = 0; i < 3; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (groups.has(code));
  return code;
}

// Grace period jeda reconnect saat reload / putus sementara (default 3000ms / 3 detik)
const RECONNECT_GRACE_PERIOD_MS = parseInt(process.env.RECONNECT_GRACE_PERIOD_MS || '3000', 10);

// Map penampung disconnect sementara: usernameLower -> { timer, username, socketId, timestamp }
const pendingDisconnects = new Map();

/**
 * Returns formatted local time string (HH:MM)
 */
function getFormattedTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Returns sorted array of active users
 */
function getActiveUsersList() {
  const list = [];
  for (const [id, data] of connectedUsers.entries()) {
    list.push({
      id,
      username: data.username,
    });
  }
  return list.sort((a, b) => a.username.localeCompare(b.username));
}

io.on('connection', (socket) => {
  console.log(`[Socket] Klien terhubung: ${socket.id}`);

  // Handle user joining the chat (supports user:join and join alias)
  const handleUserJoin = (payload, callback) => {
    const rawName = typeof payload === 'object' && payload !== null ? payload.username : payload;
    const username = typeof rawName === 'string' ? rawName.trim() : '';

    if (!username || username.length < 1 || username.length > 30) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Nama pengguna harus antara 1 sampai 30 karakter.' });
      }
      return;
    }

    const usernameKey = username.toLowerCase();
    const isAutoLogin = typeof payload === 'object' && payload !== null && payload.isAutoLogin === true;
    let userJoinTime = payload && payload.joinTime ? parseInt(payload.joinTime, 10) : null;

    // 1. Periksa apakah socket ini sudah terdaftar dengan username yang sama (cegah double handling)
    const existingSameSocket = connectedUsers.get(socket.id);
    if (existingSameSocket && existingSameSocket.username === username) {
      socket.join(existingSameSocket.currentRoom || 'public');
      if (!userJoinTime && existingSameSocket.joinedAt) {
        userJoinTime = existingSameSocket.joinedAt;
      }
      const activeUsers = getActiveUsersList();
      const shouldSendHistory = isAutoLogin;
      const historyToSend = shouldSendHistory
        ? messageHistory.filter((msg) => {
            const msgTime = msg.timestamp || parseInt(msg.id, 10);
            return isNaN(msgTime) || !userJoinTime || msgTime >= userJoinTime;
          })
        : [];
      if (typeof callback === 'function') {
        callback({
          success: true,
          user: { id: socket.id, username, joinedAt: userJoinTime || existingSameSocket.joinedAt },
          users: activeUsers,
          history: historyToSend,
        });
      }
      if (shouldSendHistory) {
        socket.emit('chat:history', historyToSend);
      }
      return;
    }

    // 2. Periksa apakah pengguna berada dalam status pending disconnect (sedang reload dalam grace period)
    const pending = pendingDisconnects.get(usernameKey);
    let isReconnecting = false;

    if (pending) {
      // Batalkan siaran notifikasi leave karena user berhasil reconnect sebelum jeda habis!
      clearTimeout(pending.timer);
      pendingDisconnects.delete(usernameKey);
      connectedUsers.delete(pending.socketId);
      isReconnecting = true;
      if (pending.joinedAt) {
        userJoinTime = pending.joinedAt;
      }
      console.log(`[Grace Period Reconnect] ${username} reconnect sebelum jeda habis. Siaran leave & join dibatalkan.`);
    } else {
      // Periksa apakah ada socket lama dengan username sama yang masih tercatat di connectedUsers
      for (const [oldId, oldData] of connectedUsers.entries()) {
        if (oldData.username.toLowerCase() === usernameKey) {
          isReconnecting = true;
          if (oldData.joinedAt) {
            userJoinTime = oldData.joinedAt;
          }
          if (oldId !== socket.id) {
            connectedUsers.delete(oldId);
          }
          break;
        }
      }
    }

    if (!userJoinTime || isNaN(userJoinTime)) {
      userJoinTime = Date.now();
    }

    // Default room adalah ruang publik
    socket.join('public');

    // Simpan user data baru
    connectedUsers.set(socket.id, {
      username,
      joinedAt: userJoinTime,
      currentRoom: 'public',
    });

    const activeUsers = getActiveUsersList();
    const timestamp = getFormattedTime();

    console.log(`[User Join] ${username} (${socket.id}) ${isReconnecting ? 'reconnected/reloaded' : 'bergabung baru'}.`);

    // Tentukan pengiriman riwayat obrolan:
    // HANYA untuk pengguna sesi aktif yang me-reload halaman (isAutoLogin / isReconnecting).
    // Pengguna baru pertama kali masuk (isAutoLogin: false) TIDAK diberikan riwayat chat lama.
    // Privasi: Filter riwayat obrolan hanya untuk pesan yang dikirim sejak pengguna tersebut bergabung.
    const shouldSendHistory = isAutoLogin || isReconnecting;
    const historyToSend = shouldSendHistory
      ? messageHistory.filter((msg) => {
          const msgTime = msg.timestamp || parseInt(msg.id, 10);
          return isNaN(msgTime) || !userJoinTime || msgTime >= userJoinTime;
        })
      : [];

    // Acknowledge to the sender
    if (typeof callback === 'function') {
      callback({
        success: true,
        user: { id: socket.id, username, joinedAt: userJoinTime },
        users: activeUsers,
        history: historyToSend,
      });
    }

    // Kirimkan riwayat obrolan HANYA jika pengguna me-reload sesi aktif
    if (shouldSendHistory) {
      socket.emit('chat:history', historyToSend);
    }

    // ATURAN NOTIFIKASI BERGABUNG:
    // HANYA disiarkan jika:
    // 1. Bukan reconnecting / reload
    // 2. Dan BUKAN auto-login (hanya saat user pertama kali tekan tombol MASUK)
    if (!isReconnecting && !isAutoLogin) {
      socket.broadcast.emit('system:notification', {
        type: 'join',
        username,
        text: `${username} telah bergabung ke ruang obrolan`,
        time: timestamp,
      });
    }

    // Broadcast updated user list to all connected clients
    io.emit('users:update', activeUsers);
  };

  socket.on('user:join', handleUserJoin);
  socket.on('join', handleUserJoin);

  // Handle manual logout from sidebar
  socket.on('user:logout', () => {
    const currentUser = connectedUsers.get(socket.id);
    if (!currentUser) return;

    const username = currentUser.username;
    const usernameKey = username.toLowerCase();
    const timestamp = getFormattedTime();

    // Hapus pending disconnect jika ada
    if (pendingDisconnects.has(usernameKey)) {
      clearTimeout(pendingDisconnects.get(usernameKey).timer);
      pendingDisconnects.delete(usernameKey);
    }

    connectedUsers.delete(socket.id);

    console.log(`[User Logout] ${username} (${socket.id}) keluar secara manual.`);

    // Hentikan status mengetik
    socket.broadcast.emit('typing:update', {
      id: socket.id,
      username,
      isTyping: false,
    });

    // Langsung siarkan notifikasi leave tanpa jeda saat logout manual
    socket.broadcast.emit('system:notification', {
      type: 'leave',
      username,
      text: `${username} meninggalkan ruang obrolan`,
      time: timestamp,
    });

    // Update daftar online users seketika
    io.emit('users:update', getActiveUsersList());
  });

  // Handle sending chat messages
  socket.on('chat:message', (payload, callback) => {
    const currentUser = connectedUsers.get(socket.id);
    if (!currentUser) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Silakan masuk terlebih dahulu.' });
      }
      socket.emit('error:unauthorized', { message: 'Silakan masuk terlebih dahulu.' });
      return;
    }

    const rawText = typeof payload === 'object' && payload !== null ? payload.text : payload;
    const text = typeof rawText === 'string' ? rawText.trim() : '';

    if (!text || text.length === 0 || text.length > 2000) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Pesan tidak boleh kosong.' });
      }
      return;
    }

    const messageData = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender: currentUser.username,
      senderId: socket.id,
      text,
      time: getFormattedTime(),
      timestamp: Date.now(),
    };

    const currentRoom = currentUser.currentRoom || 'public';

    // Simpan pesan ke in-memory history yang sesuai (publik atau grup tertentu)
    if (currentRoom === 'public') {
      messageHistory.push(messageData);
      if (messageHistory.length > MAX_HISTORY_MESSAGES) {
        messageHistory.shift();
      }
    } else {
      const group = groups.get(currentRoom);
      if (group) {
        group.history.push(messageData);
        if (group.history.length > MAX_HISTORY_MESSAGES) {
          group.history.shift();
        }
      }
    }

    console.log(`[Chat][${currentRoom}] ${currentUser.username}: ${text.substring(0, 50)}`);

    // Acknowledge to sender
    if (typeof callback === 'function') {
      callback({
        success: true,
        messageId: messageData.id,
        tempId: payload && payload.tempId ? payload.tempId : null,
        time: messageData.time,
      });
    }

    // Broadcast message HANYA ke anggota room/grup yang sama
    io.to(currentRoom).emit('chat:message', messageData);
  });

  // Handle typing indicator (hanya ke room/grup yang sama)
  socket.on('typing:start', () => {
    const currentUser = connectedUsers.get(socket.id);
    if (!currentUser) return;
    const currentRoom = currentUser.currentRoom || 'public';
    socket.to(currentRoom).emit('typing:update', {
      id: socket.id,
      username: currentUser.username,
      isTyping: true,
    });
  });

  socket.on('typing:stop', () => {
    const currentUser = connectedUsers.get(socket.id);
    if (!currentUser) return;
    const currentRoom = currentUser.currentRoom || 'public';
    socket.to(currentRoom).emit('typing:update', {
      id: socket.id,
      username: currentUser.username,
      isTyping: false,
    });
  });

  // Handle pembuatan grup baru
  socket.on('group:create', (payload, callback) => {
    const currentUser = connectedUsers.get(socket.id);
    if (!currentUser) {
      if (typeof callback === 'function') callback({ success: false, error: 'Silakan masuk terlebih dahulu.' });
      return;
    }

    const rawName = typeof payload === 'object' && payload !== null ? (payload.groupName || payload.name) : payload;
    const groupName = typeof rawName === 'string' ? rawName.trim() : '';

    if (!groupName || groupName.length < 2 || groupName.length > 50) {
      if (typeof callback === 'function') callback({ success: false, error: 'Nama grup harus antara 2 sampai 50 karakter.' });
      return;
    }

    const code = generateGroupCode();
    const groupData = {
      code,
      name: groupName,
      createdBy: currentUser.username,
      createdAt: Date.now(),
      members: new Set([currentUser.username]),
      history: [],
    };
    groups.set(code, groupData);

    const oldRoom = currentUser.currentRoom || 'public';
    socket.leave(oldRoom);
    socket.join(code);
    currentUser.currentRoom = code;

    console.log(`[Group Created] ${currentUser.username} membuat grup "${groupName}" (${code})`);

    if (typeof callback === 'function') {
      callback({
        success: true,
        group: {
          code: groupData.code,
          name: groupData.name,
          createdBy: groupData.createdBy,
        },
        history: [],
      });
    }

    // Beritahu pembuat grup tentang kode grup melalui notifikasi sistem
    socket.emit('system:notification', {
      type: 'info',
      username: 'Sistem',
      text: `Grup "${groupName}" berhasil dibuat. Kode akses: ${code}`,
      time: getFormattedTime(),
    });
  });

  // Handle bergabung ke grup via kode
  socket.on('group:join', (payload, callback) => {
    const currentUser = connectedUsers.get(socket.id);
    if (!currentUser) {
      if (typeof callback === 'function') callback({ success: false, error: 'Silakan masuk terlebih dahulu.' });
      return;
    }

    const rawCode = typeof payload === 'object' && payload !== null ? (payload.groupCode || payload.code) : payload;
    const groupCode = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
    const isAutoJoin = typeof payload === 'object' && payload !== null && payload.isAutoJoin === true;

    if (!groupCode) {
      if (typeof callback === 'function') callback({ success: false, error: 'Kode grup tidak boleh kosong.' });
      return;
    }

    const group = groups.get(groupCode);
    if (!group) {
      if (typeof callback === 'function') callback({ success: false, error: `Grup dengan kode "${groupCode}" tidak ditemukan.` });
      return;
    }

    const oldRoom = currentUser.currentRoom || 'public';
    if (oldRoom !== groupCode) {
      socket.leave(oldRoom);
      socket.join(groupCode);
      currentUser.currentRoom = groupCode;
      group.members.add(currentUser.username);

      // Siarkan notifikasi ke anggota grup lain HANYA jika bukan auto-join (bukan reload)
      if (!isAutoJoin) {
        socket.to(groupCode).emit('system:notification', {
          type: 'join',
          username: currentUser.username,
          text: `${currentUser.username} telah bergabung ke grup`,
          time: getFormattedTime(),
        });
      }
    }

    console.log(`[Group Join] ${currentUser.username} bergabung ke grup "${group.name}" (${groupCode})`);

    if (typeof callback === 'function') {
      callback({
        success: true,
        group: {
          code: group.code,
          name: group.name,
          createdBy: group.createdBy,
        },
        history: group.history,
      });
    }
  });

  // Handle meninggalkan grup dan kembali ke ruang publik
  socket.on('group:leave', (payload, callback) => {
    // Dukung parameter callback sebagai argumen pertama atau kedua
    const cb = typeof payload === 'function' ? payload : callback;
    const specifiedCode = typeof payload === 'object' && payload !== null ? (payload.groupCode || payload.code) : null;
    const isExplicitLeave = typeof payload === 'object' && payload !== null && payload.isExplicitLeave === true;

    const currentUser = connectedUsers.get(socket.id);
    if (!currentUser) {
      if (typeof cb === 'function') cb({ success: false });
      return;
    }

    const targetRoom = specifiedCode || currentUser.currentRoom;
    if (targetRoom && targetRoom !== 'public') {
      const group = groups.get(targetRoom);
      if (group) {
        // HANYA hapus member dan kirim notifikasi leave jika pemanggilan eksplisit via tombol Tinggalkan Grup
        if (isExplicitLeave) {
          group.members.delete(currentUser.username);
          socket.to(targetRoom).emit('system:notification', {
            type: 'leave',
            username: currentUser.username,
            text: `${currentUser.username} meninggalkan grup`,
            time: getFormattedTime(),
          });
        }
      }
      socket.leave(targetRoom);
      socket.join('public');
      currentUser.currentRoom = 'public';
    }

    console.log(`[Group Leave] ${currentUser.username} kembali ke ruang publik.`);

    if (typeof cb === 'function') {
      cb({
        success: true,
        history: messageHistory,
      });
    }
  });

  // Handle disconnection (Grace period untuk reload / temporary network drops)
  socket.on('disconnect', (reason) => {
    const currentUser = connectedUsers.get(socket.id);

    if (currentUser) {
      const username = currentUser.username;
      const usernameKey = username.toLowerCase();
      const timestamp = getFormattedTime();

      console.log(`[Socket Disconnect] ${username} (${socket.id}) terputus. Alasan: ${reason}. Memulai grace period ${RECONNECT_GRACE_PERIOD_MS}ms...`);

      // Stop typing state segera
      socket.broadcast.emit('typing:update', {
        id: socket.id,
        username,
        isTyping: false,
      });

      // Bersihkan timer pending sebelumnya jika ada
      if (pendingDisconnects.has(usernameKey)) {
        clearTimeout(pendingDisconnects.get(usernameKey).timer);
      }

      // Mulai jeda reconnect / grace period
      const timer = setTimeout(() => {
        pendingDisconnects.delete(usernameKey);
        connectedUsers.delete(socket.id);

        console.log(`[Grace Period Expired] ${username} tidak terhubung kembali dalam jeda. Menyiarkan notifikasi leave.`);

        // Broadcast leave notification setelah jeda habis (user benar-benar menutup tab/browser)
        socket.broadcast.emit('system:notification', {
          type: 'leave',
          username,
          text: `${username} meninggalkan ruang obrolan`,
          time: timestamp,
        });

        // Update online user list untuk remaining clients
        io.emit('users:update', getActiveUsersList());
      }, RECONNECT_GRACE_PERIOD_MS);

      pendingDisconnects.set(usernameKey, {
        timer,
        username,
        socketId: socket.id,
        timestamp,
        joinedAt: currentUser.joinedAt,
      });
    } else {
      console.log(`[Socket] Klien terputus tanpa login: ${socket.id}`);
    }
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(` ZanChat Server berjalan pada port ${PORT}`);
    console.log(` URL Lokal: http://localhost:${PORT}`);
    console.log(` Sistem Paralel dan Terdistribusi - Sesi 5`);
    console.log(`===============================================`);
  });
}

module.exports = { app, server, io, messageHistory, pendingDisconnects, groups, RECONNECT_GRACE_PERIOD_MS };
