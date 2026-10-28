/**
 * ZanChat - Client Application Logic
 * Sistem Paralel dan Terdistribusi - Sesi 5
 * Clean Vanilla JavaScript Implementation
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    socket: null,
    currentUser: null,
    activeUsers: [],
    typingUsers: new Map(), // socketId -> username
    typingTimeout: null,
    isTypingSent: false,
    isJoined: false,        // Flag status apakah client sudah berhasil join
    isJoining: false,       // Flag status apakah proses join sedang berjalan
    renderedMessageIds: new Set(), // Set id pesan agar tidak terjadi duplikasi di DOM
    currentGroup: null,            // Grup aktif { code, name } atau null (publik)
    userGroups: [],                // Array grup pengguna [{ code, name }, ...]
  };

  // Sesi Storage Key
  const STORAGE_KEY = 'zanchat_username';
  const STORAGE_JOIN_TIME = 'zanchat_join_time';
  const STORAGE_GROUP = 'zanchat_active_group';
  const STORAGE_USER_GROUPS = 'zanchat_user_groups';

  // DOM Elements - Views
  const landingPage = document.getElementById('landing-page') || document.getElementById('login-view') || document.querySelector('.landing-view');
  const chatApp = document.getElementById('chat-app') || document.getElementById('chat-dashboard') || document.getElementById('chat-view') || document.querySelector('.chat-view');
  const loginView = landingPage;
  const chatView = chatApp;

  // DOM Elements - Login & Modal
  const loginModal = document.getElementById('login-modal');
  const loginModalBackdrop = document.getElementById('login-modal-backdrop');
  const btnStartChat = document.getElementById('btn-start-chat') || document.getElementById('btn-start') || document.getElementById('btn-open-login');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalSubtitle = document.getElementById('modal-subtitle');
  const loginForm = document.getElementById('login-form');
  const usernameInput = document.getElementById('username-input');
  const btnLogin = document.getElementById('btn-login');
  const loginError = document.getElementById('login-error');

  // DOM Elements - Chat Dashboard
  const dashboardLayout = document.getElementById('dashboard-layout');
  const sidebarUsers = document.getElementById('sidebar-users');
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const btnCloseSidebar = document.getElementById('btn-close-sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const currentUserName = document.getElementById('current-user-name');
  const currentUserInitial = document.getElementById('current-user-initial');
  const activeUsersCount = document.getElementById('active-users-count');
  const usersList = document.getElementById('users-list');
  const btnLogout = document.getElementById('btn-logout');

  // DOM Elements - Group Features
  const btnOpenCreateGroup = document.getElementById('btn-open-create-group');
  const btnOpenJoinGroup = document.getElementById('btn-open-join-group');
  const modalCreateGroup = document.getElementById('modal-create-group');
  const backdropCreateGroup = document.getElementById('backdrop-create-group');
  const btnCloseCreateGroup = document.getElementById('btn-close-create-group');
  const formCreateGroup = document.getElementById('form-create-group');
  const inputGroupName = document.getElementById('input-group-name');
  const errorCreateGroup = document.getElementById('error-create-group');
  const btnSubmitCreateGroup = document.getElementById('btn-submit-create-group');

  const modalJoinGroup = document.getElementById('modal-join-group');
  const backdropJoinGroup = document.getElementById('backdrop-join-group');
  const btnCloseJoinGroup = document.getElementById('btn-close-join-group');
  const formJoinGroup = document.getElementById('form-join-group');
  const inputGroupCode = document.getElementById('input-group-code');
  const errorJoinGroup = document.getElementById('error-join-group');
  const btnSubmitJoinGroup = document.getElementById('btn-submit-join-group');

  const modalGroupCreated = document.getElementById('modal-group-created');
  const backdropGroupCreated = document.getElementById('backdrop-group-created');
  const btnCloseGroupCreated = document.getElementById('btn-close-group-created');
  const createdGroupNameDisplay = document.getElementById('created-group-name-display');
  const createdGroupCodeDisplay = document.getElementById('created-group-code-display');
  const btnAckGroupCreated = document.getElementById('btn-ack-group-created');

  const roomTitle = document.getElementById('room-title');
  const roomBadge = document.getElementById('room-badge');
  const roomDesc = document.getElementById('room-desc');
  const btnLeaveGroup = document.getElementById('btn-leave-group');

  // DOM Elements - Sidebar Room Nav & Copy Features
  const roomsNavList = document.getElementById('rooms-nav-list');
  const navRoomPublic = document.getElementById('nav-room-public');
  const navRoomGroup = document.getElementById('nav-room-group');
  const navGroupName = document.getElementById('nav-group-name');
  const btnCopyCreatedCode = document.getElementById('btn-copy-created-code');
  const copyFeedbackMsg = document.getElementById('copy-feedback-msg');

  // DOM Elements - Chat Area
  const connStatusDot = document.getElementById('conn-status-dot');
  const connStatusText = document.getElementById('conn-status-text');
  const messagesContainer = document.getElementById('messages-container');
  const messageForm = document.getElementById('message-form');
  const messageInput = document.getElementById('message-input');
  const btnSend = document.getElementById('btn-send');
  const typingIndicatorBar = document.getElementById('typing-indicator-bar');
  const typingText = document.getElementById('typing-text');

  // Initialize Socket.IO connection
  const socket = io({
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });
  state.socket = socket;

  // --------------------------------------------------------------------------
  // Socket Connection Status Listeners
  // --------------------------------------------------------------------------
  socket.on('connect', () => {
    console.log('[ZanChat] Socket terhubung:', socket.id);
    updateConnectionUI(true);

    // Reconnect Handling: HANYA jika socket reconnect setelah sebelumnya pernah join
    // Mencegah double emit join saat inisialisasi awal reload
    if (state.isJoined && state.currentUser && state.currentUser.id !== socket.id && !state.isJoining) {
      state.isJoining = true;
      let storedJoinTime = null;
      try {
        const raw = sessionStorage.getItem(STORAGE_JOIN_TIME);
        if (raw) storedJoinTime = parseInt(raw, 10);
      } catch (e) {}

      socket.emit('join', {
        username: state.currentUser.username,
        isAutoLogin: true,
        joinTime: storedJoinTime || state.currentUser.joinedAt || Date.now(),
      }, (response) => {
        state.isJoining = false;
        if (response && response.success) {
          state.currentUser = response.user;
          renderCurrentUser(response.user.username);
          if (Array.isArray(response.users)) {
            renderUsersList(response.users);
          }
          if (Array.isArray(response.history)) {
            renderChatHistory(response.history);
          }
        }
      });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('[ZanChat] Socket terputus:', reason);
    updateConnectionUI(false);
  });

  socket.on('connect_error', (error) => {
    console.error('[ZanChat] Kesalahan koneksi:', error);
    updateConnectionUI(false);
  });

  function updateConnectionUI(isConnected) {
    if (connStatusDot && connStatusText) {
      if (isConnected) {
        connStatusDot.className = 'status-indicator-dot online';
        connStatusText.textContent = 'Terhubung';
      } else {
        connStatusDot.className = 'status-indicator-dot offline';
        connStatusText.textContent = 'Terputus';
      }
    }
  }

  // --------------------------------------------------------------------------
  // Modal Masuk & Form Nama Pengguna
  // --------------------------------------------------------------------------
  function handleStartChatClick() {
    try {
      const savedUser = sessionStorage.getItem(STORAGE_KEY);
      if (savedUser && savedUser.trim()) {
        performJoin(savedUser.trim(), true);
      } else {
        openLoginModal();
      }
    } catch (e) {
      openLoginModal();
    }
  }

  function openLoginModal() {
    if (loginModal) {
      loginModal.classList.remove('hidden');
      loginModal.setAttribute('aria-hidden', 'false');
    }
    if (loginError) {
      loginError.textContent = '';
    }
    if (usernameInput) {
      let savedUser = '';
      try {
        savedUser = sessionStorage.getItem(STORAGE_KEY) || '';
      } catch (e) {}
      if (savedUser && savedUser.trim()) {
        usernameInput.value = savedUser.trim();
      }
      setTimeout(() => {
        if (usernameInput) usernameInput.focus();
      }, 100);
    }
  }

  function closeLoginModal() {
    if (loginModal) {
      loginModal.classList.add('hidden');
      loginModal.setAttribute('aria-hidden', 'true');
      if (loginError) {
        loginError.textContent = '';
      }
    }
  }

  // Pasang Event Listener Tombol "Mulai Obrolan"
  const startButtons = document.querySelectorAll('#btn-start-chat, #btn-start, #btn-open-login, .btn-cta');
  startButtons.forEach((btn) => {
    btn.addEventListener('click', handleStartChatClick);
  });

  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', closeLoginModal);
  }

  if (loginModalBackdrop) {
    loginModalBackdrop.addEventListener('click', closeLoginModal);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && loginModal && !loginModal.classList.contains('hidden')) {
      closeLoginModal();
    }
  });

  // --------------------------------------------------------------------------
  // Login & Session Flow
  // --------------------------------------------------------------------------
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLogin();
    });
  }

  if (usernameInput) {
    usernameInput.addEventListener('input', () => {
      if (loginError && loginError.textContent) {
        loginError.textContent = '';
      }
    });
  }

  function handleLogin() {
    if (!usernameInput) return;
    const rawName = usernameInput.value;
    const trimmed = rawName ? rawName.trim() : '';

    if (!trimmed) {
      showLoginError('Nama pengguna tidak boleh kosong.');
      usernameInput.focus();
      return;
    }

    if (trimmed.length > 30) {
      showLoginError('Nama pengguna maksimal 30 karakter.');
      usernameInput.focus();
      return;
    }

    performJoin(trimmed, false);
  }

  function performJoin(username, isAutoLogin = false) {
    const trimmed = typeof username === 'string' ? username.trim() : '';

    if (!trimmed) {
      if (!isAutoLogin) {
        showLoginError('Nama pengguna tidak boleh kosong.');
        if (usernameInput) usernameInput.focus();
      }
      return;
    }

    if (trimmed.length > 30) {
      if (!isAutoLogin) {
        showLoginError('Nama pengguna maksimal 30 karakter.');
        if (usernameInput) usernameInput.focus();
      }
      return;
    }

    // Cegah double emit join jika sedang dalam proses join atau sudah berhasil join
    if (state.isJoining || (state.isJoined && state.currentUser && state.currentUser.username === trimmed && socket.connected)) {
      return;
    }

    state.isJoining = true;

    if (!isAutoLogin) {
      if (btnLogin) {
        btnLogin.disabled = true;
        btnLogin.textContent = 'Menghubungkan...';
      }
      try {
        sessionStorage.setItem(STORAGE_JOIN_TIME, Date.now().toString());
      } catch (e) {}
    } else {
      // Langsung siapkan nama pengguna dan tampilkan dashboard chat
      renderCurrentUser(trimmed);
      showChatDashboard(true);
    }

    function emitJoinEvent() {
      let storedJoinTime = null;
      try {
        const raw = sessionStorage.getItem(STORAGE_JOIN_TIME);
        if (raw) storedJoinTime = parseInt(raw, 10);
      } catch (e) {}

      if (!storedJoinTime || isNaN(storedJoinTime)) {
        storedJoinTime = Date.now();
        try {
          sessionStorage.setItem(STORAGE_JOIN_TIME, storedJoinTime.toString());
        } catch (e) {}
      }

      const joinPayload = {
        username: trimmed,
        isAutoLogin,
        isInitialLogin: !isAutoLogin,
        joinTime: storedJoinTime,
      };

      // Emit event join ke server membawa data nama
      socket.emit('join', joinPayload, (response) => {
        state.isJoining = false;
        if (response && response.success) {
          state.isJoined = true;
          state.currentUser = response.user;
          renderCurrentUser(response.user.username);
          if (Array.isArray(response.users)) {
            renderUsersList(response.users);
          }

          // Bersihkan kontainer obrolan saat masuk baru dari Landing Page
          if (!isAutoLogin) {
            const chatContainer = messagesContainer || document.getElementById('chat-messages');
            if (chatContainer) {
              chatContainer.innerHTML = '';
            }
            state.renderedMessageIds.clear();
          }

          if (Array.isArray(response.history)) {
            renderChatHistory(response.history);
          }

          // Simpan sesi nama ke sessionStorage
          try {
            sessionStorage.setItem(STORAGE_KEY, response.user.username);
            if (response.user.joinedAt) {
              sessionStorage.setItem(STORAGE_JOIN_TIME, response.user.joinedAt.toString());
            }
          } catch (e) {
            console.warn('[ZanChat] Gagal menyimpan ke sessionStorage:', e);
          }

          if (!isAutoLogin) {
            loadUserGroups();
            transitionToDashboard();
            updateRoomHeader({ isGroup: false });
          } else {
            loadUserGroups();
            // Cek apakah ada grup yang tersimpan saat reload
            try {
              const savedGroupStr = sessionStorage.getItem(STORAGE_GROUP);
              if (savedGroupStr) {
                const savedGroup = JSON.parse(savedGroupStr);
                if (savedGroup && savedGroup.code) {
                  socket.emit('group:join', { groupCode: savedGroup.code, code: savedGroup.code, isAutoJoin: true }, (groupResp) => {
                    if (groupResp && groupResp.success) {
                      const group = groupResp.group || savedGroup;
                      state.currentGroup = group;
                      addOrUpdateUserGroup(group);
                      updateRoomHeader({
                        title: group.name,
                        badge: 'GRUP',
                        groupCode: group.code,
                        isGroup: true,
                      });
                      const chatContainer = messagesContainer || document.getElementById('chat-messages');
                      if (chatContainer) chatContainer.innerHTML = '';
                      state.renderedMessageIds.clear();
                      if (Array.isArray(groupResp.history)) {
                        groupResp.history.forEach((msg) => appendChatMessage(msg));
                      }
                    } else {
                      sessionStorage.removeItem(STORAGE_GROUP);
                      updateRoomHeader({ isGroup: false });
                    }
                  });
                } else {
                  updateRoomHeader({ isGroup: false });
                }
              } else {
                updateRoomHeader({ isGroup: false });
              }
            } catch (err) {
              updateRoomHeader({ isGroup: false });
            }
          }
        } else {
          state.isJoined = false;
          const errorMsg = response && response.error ? response.error : 'Gagal masuk ke obrolan.';
          if (isAutoLogin) {
            try {
              sessionStorage.removeItem(STORAGE_KEY);
              sessionStorage.removeItem(STORAGE_JOIN_TIME);
            } catch (e) {}
            returnToLandingPage();
          } else {
            showLoginError(errorMsg);
            if (btnLogin) {
              btnLogin.disabled = false;
              btnLogin.textContent = 'MASUK';
            }
          }
        }
      });
    }

    if (socket.connected) {
      emitJoinEvent();
    } else {
      socket.once('connect', emitJoinEvent);
    }
  }

  function showLoginError(msg) {
    if (loginError) {
      loginError.textContent = msg;
    }
  }

  function transitionToDashboard() {
    const landingViews = document.querySelectorAll('#landing-page, #login-view, .landing-view');
    landingViews.forEach((view) => {
      view.classList.add('fade-out');
    });

    setTimeout(() => {
      showChatDashboard(true);
    }, 250);
  }

  function showChatDashboard(immediate = false) {
    if (loginModal) {
      loginModal.classList.add('hidden');
      loginModal.setAttribute('aria-hidden', 'true');
    }

    const landingViews = document.querySelectorAll('#landing-page, #login-view, .landing-view');
    landingViews.forEach((view) => {
      view.classList.add('hidden');
      view.classList.remove('fade-out');
      view.setAttribute('aria-hidden', 'true');
    });

    const chatViews = document.querySelectorAll('#chat-app, #chat-dashboard, #chat-view, .chat-view');
    chatViews.forEach((view) => {
      view.classList.remove('hidden');
      view.setAttribute('aria-hidden', 'false');
    });

    scrollToBottom();
  }

  function returnToLandingPage() {
    const chatViews = document.querySelectorAll('#chat-app, #chat-dashboard, #chat-view, .chat-view');
    chatViews.forEach((view) => {
      view.classList.add('hidden');
      view.setAttribute('aria-hidden', 'true');
    });

    const landingViews = document.querySelectorAll('#landing-page, #login-view, .landing-view');
    landingViews.forEach((view) => {
      view.classList.remove('hidden', 'fade-out');
      view.setAttribute('aria-hidden', 'false');
    });

    closeLoginModal();

    if (usernameInput) {
      usernameInput.value = '';
    }
    if (btnLogin) {
      btnLogin.disabled = false;
      btnLogin.textContent = 'MASUK';
    }
    if (loginError) {
      loginError.textContent = '';
    }

    // Reset state pengguna (jangan bersihkan chat di sini agar reload tidak mereset)
    state.currentUser = null;
    state.activeUsers = [];
    state.isJoined = false;
    state.isJoining = false;
    if (usersList) usersList.innerHTML = '';
    if (activeUsersCount) activeUsersCount.textContent = '0';
    if (currentUserName) currentUserName.textContent = 'Pengguna';
    if (currentUserInitial) currentUserInitial.textContent = 'U';
  }

  function renderCurrentUser(name) {
    if (currentUserName) currentUserName.textContent = name;
    if (currentUserInitial) {
      currentUserInitial.textContent = name ? name.charAt(0).toUpperCase() : 'U';
    }
  }

  // --------------------------------------------------------------------------
  // Real-Time Online Users Handling
  // --------------------------------------------------------------------------
  socket.on('users:update', (users) => {
    if (Array.isArray(users)) {
      state.activeUsers = users;
      renderUsersList(users);
    }
  });

  function renderUsersList(users) {
    if (activeUsersCount) activeUsersCount.textContent = users.length;
    if (!usersList) return;
    usersList.innerHTML = '';

    users.forEach((u) => {
      const isMe = state.currentUser && (u.id === socket.id || u.id === state.currentUser.id || u.username === state.currentUser.username);

      const li = document.createElement('li');
      li.className = isMe ? 'user-item is-me' : 'user-item';

      const dot = document.createElement('span');
      dot.className = 'status-indicator-dot online';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'user-item-name';
      nameSpan.textContent = u.username;

      li.appendChild(dot);
      li.appendChild(nameSpan);

      if (isMe) {
        const badge = document.createElement('span');
        badge.className = 'user-item-badge';
        badge.textContent = 'Anda';
        li.appendChild(badge);
      }

      usersList.appendChild(li);
    });
  }

  // --------------------------------------------------------------------------
  // Helpers Waktu
  // --------------------------------------------------------------------------
  function getFormattedCurrentTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // --------------------------------------------------------------------------
  // Real-Time Messaging Flow
  // --------------------------------------------------------------------------
  if (messageForm) {
    messageForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage();
    });
  }

  if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Saat kolom input diklik/fokus di HP, sesuaikan scroll ke pesan paling bawah
    messageInput.addEventListener('focus', () => {
      setTimeout(scrollToBottom, 250);
    });
  }

  function sendMessage() {
    if (!messageInput) return;
    const rawText = messageInput.value;
    const text = rawText ? rawText.trim() : '';

    if (!text) {
      return;
    }

    // Hentikan status mengetik segera saat mengirim pesan
    stopTyping();

    // Kirim ke server
    socket.emit('chat:message', { text });

    // Reset input teks
    messageInput.value = '';
    messageInput.focus();
  }

  // Incoming Chat Message History
  socket.on('chat:history', (history) => {
    if (Array.isArray(history)) {
      renderChatHistory(history);
    }
  });

  function renderChatHistory(history) {
    if (!Array.isArray(history) || history.length === 0) return;
    let userJoinTime = 0;
    try {
      const raw = sessionStorage.getItem(STORAGE_JOIN_TIME);
      if (raw) userJoinTime = parseInt(raw, 10);
    } catch (e) {}

    if (!userJoinTime && state.currentUser && state.currentUser.joinedAt) {
      userJoinTime = state.currentUser.joinedAt;
    }

    history.forEach((msg) => {
      // Privasi: Filter riwayat obrolan agar HANYA menampilkan pesan yang dikirimkan
      // setelah atau sama dengan waktu pertama kali pengguna bergabung.
      const msgTime = msg.timestamp || parseInt(msg.id, 10);
      if (userJoinTime && !isNaN(msgTime) && msgTime < userJoinTime) {
        return;
      }
      appendChatMessage(msg);
    });
  }

  // Incoming Chat Message
  socket.on('chat:message', (data) => {
    if (!data) return;
    appendChatMessage(data);
  });

  function appendChatMessage(data) {
    if (!data) return;

    // Deduplikasi pesan menggunakan ID unik
    const msgId = data.id || `${data.sender}-${data.time}-${data.text}`;
    if (state.renderedMessageIds.has(msgId)) {
      return;
    }
    state.renderedMessageIds.add(msgId);

    const isMe = state.currentUser && (data.senderId === socket.id || (data.sender === state.currentUser.username));

    const row = document.createElement('div');
    row.className = isMe ? 'message-row is-me' : 'message-row is-other';
    row.setAttribute('data-message-id', msgId);

    const sender = document.createElement('span');
    sender.className = 'message-sender';
    sender.textContent = isMe ? 'Anda' : data.sender;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    const text = document.createElement('div');
    text.className = 'message-text';
    text.textContent = data.text; // Text content prevents XSS

    const time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = data.time || getFormattedCurrentTime();

    bubble.appendChild(text);
    bubble.appendChild(time);

    row.appendChild(sender);
    row.appendChild(bubble);

    const chatContainer = messagesContainer || document.getElementById('chat-messages');
    if (chatContainer) {
      chatContainer.appendChild(row);
    }
    scrollToBottom();
  }

  // System Notifications (Join / Leave)
  socket.on('system:notification', (data) => {
    appendSystemNotification(data);
  });

  function appendSystemNotification(data) {
    if (!messagesContainer) return;
    const pill = document.createElement('div');
    pill.className = 'system-notification';

    const textSpan = document.createElement('span');
    textSpan.textContent = data.text;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'system-notification-time';
    timeSpan.textContent = data.time;

    pill.appendChild(textSpan);
    pill.appendChild(timeSpan);

    messagesContainer.appendChild(pill);
    scrollToBottom();
  }

  function scrollToBottom() {
    if (!messagesContainer) return;
    requestAnimationFrame(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
  }

  // --------------------------------------------------------------------------
  // Real-Time Typing Indicator
  // --------------------------------------------------------------------------
  if (messageInput) {
    messageInput.addEventListener('input', () => {
      const hasText = messageInput.value.trim().length > 0;

      if (hasText) {
        if (!state.isTypingSent) {
          socket.emit('typing:start');
          state.isTypingSent = true;
        }

        // Reset debounce timer
        clearTimeout(state.typingTimeout);
        state.typingTimeout = setTimeout(() => {
          stopTyping();
        }, 1500);
      } else {
        stopTyping();
      }
    });
  }

  function stopTyping() {
    clearTimeout(state.typingTimeout);
    if (state.isTypingSent) {
      socket.emit('typing:stop');
      state.isTypingSent = false;
    }
  }

  // Listen to typing updates from other clients
  socket.on('typing:update', (data) => {
    // Ignore updates from oneself
    if (data.id === socket.id) return;

    if (data.isTyping) {
      state.typingUsers.set(data.id, data.username);
    } else {
      state.typingUsers.delete(data.id);
    }

    renderTypingIndicator();
  });

  function renderTypingIndicator() {
    if (!typingIndicatorBar || !typingText) return;
    const users = Array.from(state.typingUsers.values());

    if (users.length === 0) {
      typingIndicatorBar.classList.remove('active');
    } else {
      let text = '';
      if (users.length === 1) {
        text = `${users[0]} sedang mengetik...`;
      } else if (users.length === 2) {
        text = `${users[0]} dan ${users[1]} sedang mengetik...`;
      } else {
        text = 'Beberapa pengguna sedang mengetik...';
      }

      typingText.textContent = text;
      typingIndicatorBar.classList.add('active');
    }
  }

  // --------------------------------------------------------------------------
  // Multi-Group Management Helpers
  // --------------------------------------------------------------------------
  function loadUserGroups() {
    try {
      const raw = sessionStorage.getItem(STORAGE_USER_GROUPS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          state.userGroups = parsed;
          return;
        }
      }
      // Fallback ke STORAGE_GROUP tunggal jika ada
      const singleRaw = sessionStorage.getItem(STORAGE_GROUP);
      if (singleRaw) {
        const single = JSON.parse(singleRaw);
        if (single && single.code) {
          state.userGroups = [single];
          saveUserGroups();
        }
      }
    } catch (e) {
      state.userGroups = [];
    }
  }

  function saveUserGroups() {
    try {
      sessionStorage.setItem(STORAGE_USER_GROUPS, JSON.stringify(state.userGroups));
    } catch (e) {}
  }

  function addOrUpdateUserGroup(group) {
    if (!group || !group.code) return;
    const existingIndex = state.userGroups.findIndex((g) => g.code === group.code);
    if (existingIndex >= 0) {
      state.userGroups[existingIndex] = group;
    } else {
      state.userGroups.push(group);
    }
    saveUserGroups();
    renderRoomsNav();
  }

  function removeUserGroup(groupCode) {
    if (!groupCode) return;
    state.userGroups = state.userGroups.filter((g) => g.code !== groupCode);
    saveUserGroups();
    renderRoomsNav();
  }

  function renderRoomsNav() {
    if (!roomsNavList) return;
    // Bersihkan semua item kecuali item Obrolan Umum
    const dynamicItems = roomsNavList.querySelectorAll('.room-nav-item[data-room="group"]');
    dynamicItems.forEach((el) => el.remove());

    const isPublicActive = !state.currentGroup;
    if (navRoomPublic) {
      navRoomPublic.classList.toggle('active', isPublicActive);
    }

    state.userGroups.forEach((grp) => {
      const isGroupActive = state.currentGroup && state.currentGroup.code === grp.code;

      const li = document.createElement('li');
      li.className = isGroupActive ? 'room-nav-item active' : 'room-nav-item';
      li.setAttribute('data-room', 'group');
      li.setAttribute('data-group-code', grp.code);

      const icon = document.createElement('span');
      icon.className = 'room-nav-icon';
      icon.textContent = '👥';

      const name = document.createElement('span');
      name.className = 'room-nav-name';
      name.textContent = grp.name;

      const badge = document.createElement('span');
      badge.className = 'room-nav-badge is-group';
      badge.textContent = 'GRUP';

      li.appendChild(icon);
      li.appendChild(name);
      li.appendChild(badge);

      li.addEventListener('click', () => {
        switchToGroup(grp);
      });

      roomsNavList.appendChild(li);
    });
  }

  function switchToPublic() {
    if (socket && socket.connected) {
      socket.emit('group:leave', (response) => {
        state.currentGroup = null;
        try {
          sessionStorage.removeItem(STORAGE_GROUP);
        } catch (e) {}

        updateRoomHeader({
          title: 'Ruang Obrolan Publik',
          badge: 'UMUM',
          desc: 'Saluran publik untuk seluruh pengguna yang terhubung di jaringan.',
          isGroup: false,
        });

        const chatContainer = messagesContainer || document.getElementById('chat-messages');
        if (chatContainer) chatContainer.innerHTML = '';
        state.renderedMessageIds.clear();

        if (response && Array.isArray(response.history)) {
          renderChatHistory(response.history);
        }
        renderRoomsNav();
      });
    }
  }

  function switchToGroup(grp) {
    if (!grp || !grp.code || !socket || !socket.connected) return;
    if (state.currentGroup && state.currentGroup.code === grp.code) return;

    socket.emit('group:join', { groupCode: grp.code, code: grp.code, isAutoJoin: true }, (response) => {
      if (response && response.success) {
        state.currentGroup = grp;
        try {
          sessionStorage.setItem(STORAGE_GROUP, JSON.stringify(grp));
        } catch (e) {}

        updateRoomHeader({
          title: grp.name,
          badge: 'GRUP',
          groupCode: grp.code,
          isGroup: true,
        });

        const chatContainer = messagesContainer || document.getElementById('chat-messages');
        if (chatContainer) chatContainer.innerHTML = '';
        state.renderedMessageIds.clear();

        if (Array.isArray(response.history)) {
          response.history.forEach((msg) => appendChatMessage(msg));
        }
        renderRoomsNav();
      }
    });
  }

  // --------------------------------------------------------------------------
  // Room Header & Sidebar Navigation Helper
  // --------------------------------------------------------------------------
  function updateRoomHeader({ title, badge, desc, isGroup, groupCode }) {
    if (roomTitle) roomTitle.textContent = title || 'Ruang Obrolan Publik';
    if (roomBadge) {
      roomBadge.textContent = isGroup ? 'GRUP' : 'UMUM';
      roomBadge.classList.toggle('is-group', !!isGroup);
    }
    if (roomDesc) {
      if (isGroup && groupCode) {
        roomDesc.innerHTML = `Saluran privat grup ${title || ''} | Kode Akses: <strong style="font-family: monospace; letter-spacing: 0.05em;">${groupCode}</strong> <button type="button" id="btn-copy-header-code" class="btn-copy-inline" title="Salin Kode Akses" aria-label="Salin Kode Akses"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>`;
        const copyBtn = document.getElementById('btn-copy-header-code');
        if (copyBtn) {
          copyBtn.onclick = (e) => {
            e.stopPropagation();
            copyToClipboard(groupCode, copyBtn);
          };
        }
      } else {
        roomDesc.textContent = desc || 'Saluran publik untuk seluruh pengguna yang terhubung di jaringan.';
      }
    }

    if (btnLeaveGroup) {
      if (isGroup) {
        btnLeaveGroup.classList.remove('hidden');
        btnLeaveGroup.style.display = 'inline-flex';
      } else {
        btnLeaveGroup.classList.add('hidden');
        btnLeaveGroup.style.display = 'none';
      }
    }

    renderRoomsNav();
  }

  function copyToClipboard(text, targetBtn) {
    if (!navigator.clipboard) {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {}
      document.body.removeChild(textArea);
    } else {
      navigator.clipboard.writeText(text).catch(() => {});
    }

    if (targetBtn) {
      targetBtn.classList.add('copied');
      setTimeout(() => {
        targetBtn.classList.remove('copied');
      }, 1800);
    }
  }

  // Event listener tombol salin di modal konfirmasi grup
  if (btnCopyCreatedCode) {
    btnCopyCreatedCode.addEventListener('click', () => {
      if (createdGroupCodeDisplay) {
        const code = createdGroupCodeDisplay.textContent.trim();
        copyToClipboard(code, btnCopyCreatedCode);
        if (copyFeedbackMsg) {
          copyFeedbackMsg.textContent = 'Kode akses berhasil disalin ke papan klip!';
          setTimeout(() => {
            copyFeedbackMsg.textContent = '';
          }, 2500);
        }
      }
    });
  }

  // Interaktivitas Navigasi Obrolan di Sidebar (Pindah ke Umum)
  if (navRoomPublic) {
    navRoomPublic.addEventListener('click', () => {
      if (state.currentGroup) {
        switchToPublic();
      }
    });
  }

  // --------------------------------------------------------------------------
  // Group Management Flow (Create, Join, Leave)
  // --------------------------------------------------------------------------
  // Modal Buat Grup: Buka
  if (btnOpenCreateGroup) {
    btnOpenCreateGroup.addEventListener('click', () => {
      if (modalCreateGroup) {
        modalCreateGroup.classList.remove('hidden');
        modalCreateGroup.style.display = 'flex';
        modalCreateGroup.style.zIndex = '9999';
        modalCreateGroup.setAttribute('aria-hidden', 'false');
      }
      if (backdropCreateGroup) {
        backdropCreateGroup.classList.add('active');
      }
      if (inputGroupName) {
        inputGroupName.value = '';
        setTimeout(() => inputGroupName.focus(), 100);
      }
      if (errorCreateGroup) errorCreateGroup.textContent = '';
    });
  }

  // Modal Buat Grup: Tutup
  function closeModalCreateGroup() {
    if (modalCreateGroup) {
      modalCreateGroup.classList.add('hidden');
      modalCreateGroup.style.display = 'none';
      modalCreateGroup.setAttribute('aria-hidden', 'true');
    }
    if (backdropCreateGroup) {
      backdropCreateGroup.classList.remove('active');
    }
    if (errorCreateGroup) errorCreateGroup.textContent = '';
  }

  if (btnCloseCreateGroup) {
    btnCloseCreateGroup.addEventListener('click', closeModalCreateGroup);
  }
  if (backdropCreateGroup) {
    backdropCreateGroup.addEventListener('click', closeModalCreateGroup);
  }

  // Modal Gabung Grup: Buka
  if (btnOpenJoinGroup) {
    btnOpenJoinGroup.addEventListener('click', () => {
      if (modalJoinGroup) {
        modalJoinGroup.classList.remove('hidden');
        modalJoinGroup.style.display = 'flex';
        modalJoinGroup.style.zIndex = '9999';
        modalJoinGroup.setAttribute('aria-hidden', 'false');
      }
      if (backdropJoinGroup) {
        backdropJoinGroup.classList.add('active');
      }
      if (inputGroupCode) {
        inputGroupCode.value = '';
        setTimeout(() => inputGroupCode.focus(), 100);
      }
      if (errorJoinGroup) errorJoinGroup.textContent = '';
    });
  }

  // Modal Gabung Grup: Tutup
  function closeModalJoinGroup() {
    if (modalJoinGroup) {
      modalJoinGroup.classList.add('hidden');
      modalJoinGroup.style.display = 'none';
      modalJoinGroup.setAttribute('aria-hidden', 'true');
    }
    if (backdropJoinGroup) {
      backdropJoinGroup.classList.remove('active');
    }
    if (errorJoinGroup) errorJoinGroup.textContent = '';
  }

  if (btnCloseJoinGroup) {
    btnCloseJoinGroup.addEventListener('click', closeModalJoinGroup);
  }
  if (backdropJoinGroup) {
    backdropJoinGroup.addEventListener('click', closeModalJoinGroup);
  }

  // Modal Grup Berhasil Dibuat: Tutup
  function closeModalGroupCreated() {
    if (modalGroupCreated) {
      modalGroupCreated.classList.add('hidden');
      modalGroupCreated.style.display = 'none';
      modalGroupCreated.setAttribute('aria-hidden', 'true');
    }
    if (backdropGroupCreated) {
      backdropGroupCreated.classList.remove('active');
    }
  }

  if (btnCloseGroupCreated) {
    btnCloseGroupCreated.addEventListener('click', closeModalGroupCreated);
  }
  if (backdropGroupCreated) {
    backdropGroupCreated.addEventListener('click', closeModalGroupCreated);
  }
  if (btnAckGroupCreated) {
    btnAckGroupCreated.addEventListener('click', closeModalGroupCreated);
  }

  // Submit Buat Grup
  if (formCreateGroup) {
    formCreateGroup.addEventListener('submit', (e) => {
      e.preventDefault();
      const rawName = inputGroupName ? inputGroupName.value : '';
      const name = rawName ? rawName.trim() : '';

      if (!name || name.length < 2 || name.length > 50) {
        if (errorCreateGroup) errorCreateGroup.textContent = 'Nama grup harus antara 2 sampai 50 karakter.';
        return;
      }

      if (btnSubmitCreateGroup) {
        btnSubmitCreateGroup.disabled = true;
        btnSubmitCreateGroup.textContent = 'Membuat...';
      }

      socket.emit('group:create', { groupName: name, name }, (response) => {
        if (btnSubmitCreateGroup) {
          btnSubmitCreateGroup.disabled = false;
          btnSubmitCreateGroup.textContent = 'Buat Grup';
        }

        if (response && response.success) {
          const group = response.group || { code: response.code, name: response.name };
          state.currentGroup = group;
          addOrUpdateUserGroup(group);
          try {
            sessionStorage.setItem(STORAGE_GROUP, JSON.stringify(group));
          } catch (err) {}

          closeModalCreateGroup();

          // Bersihkan chat untuk ruang grup baru
          const chatContainer = messagesContainer || document.getElementById('chat-messages');
          if (chatContainer) chatContainer.innerHTML = '';
          state.renderedMessageIds.clear();

          // Update header ruangan
          updateRoomHeader({
            title: group.name,
            badge: 'GRUP',
            groupCode: group.code,
            isGroup: true,
          });

          // Tampilkan modal info kode yang dibuat
          if (createdGroupNameDisplay) createdGroupNameDisplay.textContent = group.name;
          if (createdGroupCodeDisplay) createdGroupCodeDisplay.textContent = group.code;
          if (modalGroupCreated) {
            modalGroupCreated.classList.remove('hidden');
            modalGroupCreated.style.display = 'flex';
            modalGroupCreated.style.zIndex = '9999';
            modalGroupCreated.setAttribute('aria-hidden', 'false');
          }
          if (backdropGroupCreated) backdropGroupCreated.classList.add('active');
        } else {
          const errMsg = response && response.error ? response.error : 'Gagal membuat grup.';
          if (errorCreateGroup) errorCreateGroup.textContent = errMsg;
        }
      });
    });
  }

  // Submit Gabung Grup
  if (formJoinGroup) {
    formJoinGroup.addEventListener('submit', (e) => {
      e.preventDefault();
      const rawCode = inputGroupCode ? inputGroupCode.value : '';
      const code = rawCode ? rawCode.trim().toUpperCase() : '';

      if (!code) {
        if (errorJoinGroup) errorJoinGroup.textContent = 'Kode grup tidak boleh kosong.';
        return;
      }

      if (btnSubmitJoinGroup) {
        btnSubmitJoinGroup.disabled = true;
        btnSubmitJoinGroup.textContent = 'Menghubungkan...';
      }

      socket.emit('group:join', { groupCode: code, code }, (response) => {
        if (btnSubmitJoinGroup) {
          btnSubmitJoinGroup.disabled = false;
          btnSubmitJoinGroup.textContent = 'Gabung Grup';
        }

        if (response && response.success) {
          const group = response.group || { code: response.code, name: response.name };
          state.currentGroup = group;
          addOrUpdateUserGroup(group);
          try {
            sessionStorage.setItem(STORAGE_GROUP, JSON.stringify(group));
          } catch (err) {}

          closeModalJoinGroup();

          // Bersihkan chat untuk ruang grup baru
          const chatContainer = messagesContainer || document.getElementById('chat-messages');
          if (chatContainer) chatContainer.innerHTML = '';
          state.renderedMessageIds.clear();

          // Update header ruangan
          updateRoomHeader({
            title: group.name,
            badge: 'GRUP',
            groupCode: group.code,
            isGroup: true,
          });

          // Render riwayat pesan grup
          if (Array.isArray(response.history)) {
            response.history.forEach((msg) => appendChatMessage(msg));
          }
        } else {
          const errMsg = response && response.error ? response.error : 'Kode grup tidak valid.';
          if (errorJoinGroup) errorJoinGroup.textContent = errMsg;
        }
      });
    });
  }

  // Tinggalkan Grup (#btn-leave-group)
  if (btnLeaveGroup) {
    btnLeaveGroup.addEventListener('click', () => {
      if (confirm('Tinggalkan grup ini dan kembali ke Ruang Obrolan Publik?')) {
        const leavingGroupCode = state.currentGroup ? state.currentGroup.code : null;
        socket.emit('group:leave', { groupCode: leavingGroupCode, isExplicitLeave: true }, (response) => {
          if (leavingGroupCode) {
            removeUserGroup(leavingGroupCode);
          }
          state.currentGroup = null;
          try {
            sessionStorage.removeItem(STORAGE_GROUP);
          } catch (err) {}

          updateRoomHeader({
            title: 'Ruang Obrolan Publik',
            badge: 'Umum',
            desc: 'Saluran publik untuk seluruh pengguna yang terhubung di jaringan.',
            isGroup: false,
          });

          // Bersihkan kontainer chat
          const chatContainer = messagesContainer || document.getElementById('chat-messages');
          if (chatContainer) chatContainer.innerHTML = '';
          state.renderedMessageIds.clear();

          // Render kembali riwayat obrolan publik jika ada
          if (response && Array.isArray(response.history)) {
            renderChatHistory(response.history);
          }
          renderRoomsNav();
        });
      }
    });
  }

  // --------------------------------------------------------------------------
  // Sidebar Toggle / Collapse / Drawer Management
  // --------------------------------------------------------------------------
  function isMobileView() {
    return window.innerWidth <= 768;
  }

  function toggleSidebar() {
    if (isMobileView()) {
      if (sidebarUsers && sidebarUsers.classList.contains('mobile-open')) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
    } else if (dashboardLayout) {
      dashboardLayout.classList.toggle('sidebar-collapsed');
    }
  }

  function openMobileSidebar() {
    if (sidebarUsers) sidebarUsers.classList.add('mobile-open');
    if (sidebarBackdrop) {
      sidebarBackdrop.classList.add('active');
      sidebarBackdrop.setAttribute('aria-hidden', 'false');
    }
  }

  function closeMobileSidebar() {
    if (sidebarUsers) sidebarUsers.classList.remove('mobile-open');
    if (sidebarBackdrop) {
      sidebarBackdrop.classList.remove('active');
      sidebarBackdrop.setAttribute('aria-hidden', 'true');
    }
  }

  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', toggleSidebar);
  }

  if (btnCloseSidebar) {
    btnCloseSidebar.addEventListener('click', closeMobileSidebar);
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', closeMobileSidebar);
  }

  // Tutup drawer mobile saat ukuran layar diperbesar ke desktop
  window.addEventListener('resize', () => {
    if (!isMobileView()) {
      closeMobileSidebar();
    }
  });

  // --------------------------------------------------------------------------
  // Logout / Keluar
  // --------------------------------------------------------------------------
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      if (confirm('Apakah Anda yakin ingin keluar dari ruang obrolan?')) {
        // 1. Hapus data sesi dari sessionStorage
        try {
          sessionStorage.removeItem(STORAGE_KEY);
          sessionStorage.removeItem(STORAGE_JOIN_TIME);
          sessionStorage.removeItem(STORAGE_GROUP);
          sessionStorage.removeItem(STORAGE_USER_GROUPS);
        } catch (err) {
          console.warn('[ZanChat] Gagal menghapus sesi sessionStorage:', err);
        }

        // 2. Kirim event user:logout ke server agar server langsung menyiarkan notifikasi keluar tanpa jeda
        if (socket && socket.connected) {
          socket.emit('user:logout');
        }

        // 3. Putus koneksi socket saat ini
        setTimeout(() => {
          socket.disconnect();
          socket.connect();
        }, 50);

        // 4. Bersihkan elemen obrolan di DOM secara manual saat logout
        const chatContainer = messagesContainer || document.getElementById('chat-messages');
        if (chatContainer) {
          chatContainer.innerHTML = '';
        }
        state.renderedMessageIds.clear();
        state.isJoined = false;
        state.isJoining = false;

        // 5. Kembalikan tampilan web ke Landing Page
        closeMobileSidebar();
        returnToLandingPage();
      }
    });
  }

  // --------------------------------------------------------------------------
  // Auto-Login Check saat Halaman Dimuat / Direload
  // --------------------------------------------------------------------------
  try {
    const savedUsername = sessionStorage.getItem(STORAGE_KEY);
    if (savedUsername && savedUsername.trim()) {
      performJoin(savedUsername.trim(), true);
    }
  } catch (err) {
    console.warn('[ZanChat] Gagal memeriksa session di sessionStorage:', err);
  }
});
