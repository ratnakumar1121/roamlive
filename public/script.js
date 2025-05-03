// --- START OF public/script.js ---
console.log("script.js: Loading...");
const MAX_CHAT_MESSAGES = 30;

// --- Global State Variables ---
let map;
let meetpointMarker = null;
let currentlyMeetingWithId = null;
let userLocation = { latitude: null, longitude: null };
let ghostModeOn = false;
let locationActive = false;
let socket = null;
let currentChatTarget = null;
let onlineUsersMap = new Map();
let conversationsMap = new Map();
let unreadSenders = new Map();
let currentChatType = 'private'; // 'private' or 'group'
let currentGroupId = null;
let messageReactions = new Map();
let pinnedMessages = new Set();
let ghostMarker = null;
let readMessages = new Set();
let domElements; // <-- Make domElements global

// === UTILITY ===
const getMyUserId = () => parseInt(localStorage.getItem('loggedInUserId') || '-1');

// === PRIMARY INITIALIZATION on DOM Load ===
document.addEventListener('DOMContentLoaded', () => {
    console.log("script.js: DOMContentLoaded event fired.");

    // --- Cache DOM Elements FIRST ---
    domElements = { // <-- assign to global
        mapContainer: document.getElementById('map'),
        signupFormEl: document.querySelector('#signup-form form'), // <-- Check if this is found
        loginFormEl: document.querySelector('#login-form form'),   // <-- Check if this is found
        signupMessageEl: document.getElementById('signup-message'),
        loginMessageEl: document.getElementById('login-message'),
        signupContainer: document.getElementById('signup-form'),
        loginContainer: document.getElementById('login-form'),
        userStatusEl: document.getElementById('user-status'),
        loggedInUsernameEl: document.getElementById('logged-in-username'),
        logoutButton: document.getElementById('logout-button'),
        authContainer: document.getElementById('auth-container'),
        chatWindow: document.getElementById('chat-window'),
        chatHeaderUsername: document.getElementById('chat-with-username'),
        closeChatBtn: document.getElementById('close-chat-btn'),
        chatMessagesDiv: document.getElementById('chat-messages'),
        chatMessageInput: document.getElementById('chat-message-input'),
        sendChatBtn: document.getElementById('send-chat-btn'),
        emojiBtn: document.getElementById('emoji-btn'),
        emojiPicker: document.getElementById('emoji-picker'),
        globalChatToggle: document.getElementById('global-chat-toggle'),
        conversationsPanel: document.getElementById('conversations-panel'),
        conversationsList: document.getElementById('conversations-list'),
        closeConversationsBtn: document.getElementById('close-conversations-btn'),
        chatBackBtn: document.getElementById('chat-back-btn'),
        ghostModeCheckbox: document.getElementById('ghost-mode'),
        ghostModeStatus: document.getElementById('ghost-mode-status'),
        nicknameInput: document.getElementById('nickname'),
        myLocationButton: document.getElementById('my-location-button'),
        myLocationStatus: document.getElementById('my-location-status'),
        modeSelector: document.getElementById('mode'),
        chatUnreadBadge: document.getElementById('chat-unread-badge'),
        toggleToLoginLink: document.getElementById('toggle-to-login'),       // <-- Check if this is found
        toggleToSignupLink: document.getElementById('toggle-to-signup'),     // <-- Check if this is found
        mapLayerSelector: document.getElementById('map-layer'),
        addParticipantBtn: document.getElementById('add-participant-btn'),
        closeParticipantsModal: document.getElementById('close-participants-modal'),
        fileUploadBtn: document.getElementById('file-upload-btn'),
        closeFileModal: document.getElementById('close-file-modal'),
        uploadFileBtn: document.getElementById('upload-file-btn'),
        themeToggleBtn: document.getElementById('theme-toggle-btn'),
        pinnedMessagesList: document.getElementById('pinned-messages-list'),
        messageSearchInput: document.getElementById('message-search')
    };

    // --- DEBUG: Log found elements ---
    console.log("Cached DOM Elements:", {
        mapContainer: !!domElements.mapContainer,
        signupFormEl: !!domElements.signupFormEl,
        loginFormEl: !!domElements.loginFormEl,
        toggleToLoginLink: !!domElements.toggleToLoginLink,
        toggleToSignupLink: !!domElements.toggleToSignupLink,
        mapLayerSelector: !!domElements.mapLayerSelector,
        // Add others if needed
    });

    if (!domElements.mapContainer) { console.error("CRITICAL ERROR: Map container #map not found!"); alert("Error: Map container not found in HTML!"); return; }
    if (!domElements.authContainer) console.warn("Auth container #auth-container not found!");

    // Hide chat window and chat icon by default on page load
    if (domElements.chatWindow) domElements.chatWindow.style.display = 'none';
    if (domElements.globalChatToggle) domElements.globalChatToggle.style.display = 'none';

    // === FUNCTION DEFINITIONS ===

    // --- AUTH FUNCTIONS ---
        // --- AUTH FUNCTIONS ---
        // --- AUTH FUNCTIONS ---
        function toggleForms() {
            console.log("toggleForms function called");
            if (!domElements.signupContainer || !domElements.loginContainer) {
                 console.error("ToggleForms: Signup or Login container not found!");
                 return;
             }
    
            // Check the CURRENT display style of the signup form
            const isSignupHidden = domElements.signupContainer.style.display === 'none';
            console.log("Current signup display:", domElements.signupContainer.style.display, "Is signup hidden?", isSignupHidden);
    
            // --- CORRECTED LOGIC ---
            // If signup is currently hidden, show it and hide login.
            // Otherwise (if signup is visible), hide it and show login.
            if (isSignupHidden) {
                domElements.signupContainer.style.display = 'block';
                domElements.loginContainer.style.display = 'none';
            } else {
                domElements.signupContainer.style.display = 'none';
                domElements.loginContainer.style.display = 'block';
            }
            // --- END CORRECTED LOGIC ---
    
            console.log("New signup display:", domElements.signupContainer.style.display);
            console.log("New login display:", domElements.loginContainer.style.display);
            if (domElements.signupMessageEl) domElements.signupMessageEl.textContent = '';
            if (domElements.loginMessageEl) domElements.loginMessageEl.textContent = '';
        }

    function updateLoginState() { console.log("[Auth] Updating login state UI..."); const token = localStorage.getItem('authToken'); const username = localStorage.getItem('loggedInUser'); const userId = localStorage.getItem('loggedInUserId'); const isLoggedIn = token && username && userId && userId !== '-1'; if (domElements.authContainer) domElements.authContainer.style.display = isLoggedIn ? 'none' : 'block'; if (domElements.userStatusEl) domElements.userStatusEl.style.display = isLoggedIn ? 'block' : 'none'; if (domElements.globalChatToggle) domElements.globalChatToggle.style.display = isLoggedIn ? 'block' : 'none'; if (domElements.loggedInUsernameEl && isLoggedIn) domElements.loggedInUsernameEl.textContent = username; if (domElements.nicknameInput && isLoggedIn) domElements.nicknameInput.value = username; if (isLoggedIn) { if (!socket?.connected) connectWebSocket(token); socket.emit('request conversations'); } else { if(domElements.signupContainer) domElements.signupContainer.style.display = 'none'; if(domElements.loginContainer) domElements.loginContainer.style.display = 'block'; disconnectWebSocket(); closeChatWindow(); hideConversationsPanel(); clearAllUserMarkers(); unreadSenders.clear(); updateUnreadBadge(); onlineUsersMap.clear(); conversationsMap.clear(); if (map) clearMeetpoint(); } if (domElements.signupMessageEl) domElements.signupMessageEl.textContent = ''; if (domElements.loginMessageEl) domElements.loginMessageEl.textContent = ''; }

    async function handleAuthFormSubmit(event, url) {
        event.preventDefault();
        console.log("--- handleAuthFormSubmit Fired --- URL:", url); // <-- DEBUG LOG inside handler
        const form = event.target;
        const isLogin = url.includes('login');
        const messageEl = isLogin ? domElements.loginMessageEl : domElements.signupMessageEl;
        const usernameInput = form.querySelector(isLogin ? '#login-username' : '#signup-username');
        const passwordInput = form.querySelector(isLogin ? '#login-password' : '#signup-password');
        if (!usernameInput || !passwordInput) { console.error("Auth form elements missing inside handler"); if (messageEl) messageEl.textContent = 'Error: Form fields missing.'; return; }
        const username = usernameInput.value; const password = passwordInput.value;
        if (messageEl) messageEl.textContent = isLogin ? 'Logging in...' : 'Signing up...';
        console.log(`Attempting ${isLogin ? 'Login' : 'Signup'} for:`, username);
        try {
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
            console.log("Auth Fetch Response Status:", response.status); const data = await response.json();
            if (!response.ok) { console.error("Auth Fetch Error Response Data:", data); throw new Error(data.message || `HTTP error! status: ${response.status}`); }
            if (isLogin) { console.log("Login successful response data:", data); if (messageEl) messageEl.textContent = 'Login successful!'; form.reset(); localStorage.setItem('authToken', data.token); localStorage.setItem('loggedInUser', data.user.username); localStorage.setItem('loggedInUserId', data.user.id); updateLoginState(); fetchUserDetails(); }
            else { console.log("Signup successful response data:", data); if (messageEl) messageEl.textContent = `Signup successful! Please log in.`; form.reset(); setTimeout(toggleForms, 1500); }
        } catch (error) { console.error(`${isLogin ? 'Login' : 'Signup'} Catch Block Error:`, error); if (messageEl) messageEl.textContent = `Error: ${error.message}`; if (isLogin) { localStorage.clear(); updateLoginState(); } }
    }
    async function fetchUserDetails() { /* ... as before ... */ }
    async function fetchUserDetails() { const token = localStorage.getItem('authToken'); if (!token) return; console.log("[Auth] Verifying token..."); try { const response = await fetch('/api/auth/me', { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } }); const data = await response.json(); if (!response.ok) { if (response.status === 401 || response.status === 403) { console.warn("[Auth] Token invalid/expired."); domElements.logoutButton?.click(); } throw new Error(data.message || `HTTP error! status: ${response.status}`); } console.log("[Auth] Token verified for:", data.user?.username); } catch (error) { console.error("[Auth] Error verifying token:", error.message); } }


    // --- WEBSOCKET / CHAT FUNCTIONS ---
    // ... (keep connectWebSocket, disconnectWebSocket, openChatWindow, closeChatWindow, displayChatMessage, addSystemMessageToChat, sendChatMessage, updateUnreadBadge, showConversationsPanel, hideConversationsPanel, toggleConversationsPanel, renderConversationsList, handleChatBackButtonClick as they were) ...
    function connectWebSocket(token) { if (socket?.connected) return; console.log("[WS] Attempting connection..."); unreadSenders.clear(); updateUnreadBadge(); conversationsMap.clear(); socket = io({ auth: { token } }); socket.on('connect', () => { console.log(`[WS] Connected: ${socket.id}`); const myUserId = getMyUserId(); const myUsername = localStorage.getItem('loggedInUser'); const currentMode = domElements.modeSelector?.value || 'person'; if (myUserId > 0 && myUsername) { onlineUsersMap.set(myUserId, { userId: myUserId, username: myUsername, mode: currentMode, latitude: userLocation.latitude, longitude: userLocation.longitude, marker: null, isOnline: true }); addUserToMap(onlineUsersMap.get(myUserId)); if (locationActive && userLocation.latitude != null) socket.emit('update location', { latitude: userLocation.latitude, longitude: userLocation.longitude }); socket.emit('update mode', { mode: currentMode }); socket.emit('request conversations'); } }); socket.on('disconnect', (reason) => { console.log(`[WS] Disconnected: ${reason}`); clearAllUserMarkers(); onlineUsersMap.clear(); conversationsMap.clear(); unreadSenders.clear(); updateUnreadBadge(); renderConversationsList(); if (reason === 'io server disconnect') { alert("Auth error. Disconnected."); domElements.logoutButton?.click(); } else { socket = null; updateLoginState(); } }); socket.on('connect_error', (error) => { console.error(`[WS] Connect Error: ${error.message}`); if (error.message.includes("Authentication")) { alert("WebSocket Auth Failed."); domElements.logoutButton?.click(); } else { console.error(`Cannot connect to server: ${error.message}`); } }); socket.on('conversation list response', (partners) => { console.log('[WS] Rcvd conversation list:', partners); const newConversationsMap = new Map(); partners.forEach(p => { newConversationsMap.set(p.userId, { ...p, isOnline: onlineUsersMap.has(p.userId) && onlineUsersMap.get(p.userId).isOnline }); }); conversationsMap.forEach((clientData, userId) => { if (!newConversationsMap.has(userId)) { newConversationsMap.set(userId, clientData); } }); conversationsMap = newConversationsMap; renderConversationsList(); }); socket.on('user connected', (userData) => { console.log('[WS] Rcvd user connected:', userData.username); onlineUsersMap.set(userData.userId, { ...userData, isOnline: true, marker: onlineUsersMap.get(userData.userId)?.marker }); addUserToMap(onlineUsersMap.get(userData.userId)); if (conversationsMap.has(userData.userId)) { conversationsMap.get(userData.userId).isOnline = true; renderConversationsList(); } }); socket.on('user disconnected', ({ userId }) => { console.log('[WS] Rcvd user disconnected:', userId); if (onlineUsersMap.has(userId)) onlineUsersMap.get(userId).isOnline = false; removeUserFromMap(userId); if (conversationsMap.has(userId)) { conversationsMap.get(userId).isOnline = false; renderConversationsList(); } if (currentChatTarget?.userId === userId) { addSystemMessageToChat(`${currentChatTarget.username} went offline.`); if(domElements.chatHeaderUsername) domElements.chatHeaderUsername.textContent = `Chat with ${currentChatTarget.username} (Offline)`; } }); socket.on('location updated', ({ userId, latitude, longitude }) => { updateUserLocationOnMap(userId, latitude, longitude); }); socket.on('mode updated', ({ userId, mode }) => { updateUserModeOnMap(userId, mode); }); socket.on('private message', ({ sender, message }) => { console.log('[WS] Rcvd private message from', sender.username); const isChatOpen = domElements.chatWindow?.style.display === 'flex' && currentChatTarget?.userId === sender.userId; if (isChatOpen) { displayChatMessage(sender, message, false); } else if (sender.userId !== getMyUserId()) { const count = unreadSenders.get(sender.userId) || 0; unreadSenders.set(sender.userId, count + 1); updateUnreadBadge(); if (!conversationsMap.has(sender.userId)) conversationsMap.set(sender.userId, { userId: sender.userId, username: sender.username, isOnline: onlineUsersMap.has(sender.userId) && onlineUsersMap.get(sender.userId).isOnline }); renderConversationsList(); } }); socket.on('recipient offline', ({ recipientUserId }) => { if (currentChatTarget?.userId === recipientUserId) addSystemMessageToChat(`${currentChatTarget.username} is offline.`); }); socket.on('chat history response', ({ otherUserId, messages }) => { console.log(`[WS] Rcvd history for ${otherUserId}`); if (currentChatTarget?.userId === otherUserId && domElements.chatMessagesDiv) { const loading = domElements.chatMessagesDiv.querySelector('.system-message'); loading?.remove(); if (messages?.length > 0) messages.forEach(msg => displayChatMessage(msg.sender, msg.message, msg.sender.userId === getMyUserId())); else addSystemMessageToChat("No message history."); domElements.chatMessagesDiv.scrollTop = domElements.chatMessagesDiv.scrollHeight; } }); socket.on('history error', ({ otherUserId, error }) => { if (currentChatTarget?.userId === otherUserId) addSystemMessageToChat(`Error loading history: ${error}`); }); socket.on('conversation error', ({error}) => { console.error("Conversation list error:", error); alert("Could not load conversations."); }); }
    function disconnectWebSocket() { if (socket) { console.log("[WS] Disconnecting..."); socket.disconnect(); socket = null; } }
    function openChatWindow(targetUser, isGroup = false) {
        if (!domElements.chatWindow || !socket) return;
        console.log("Opening chat with:", targetUser);
        
        if (unreadSenders.has(targetUser.userId)) {
            unreadSenders.delete(targetUser.userId);
            updateUnreadBadge();
            renderConversationsList();
        }
        
        hideConversationsPanel();
        currentChatTarget = targetUser;
        currentChatType = isGroup ? 'group' : 'private';
        currentGroupId = isGroup ? targetUser.groupId : null;
        
        const isOnline = onlineUsersMap.has(targetUser.userId) && onlineUsersMap.get(targetUser.userId).isOnline;
        domElements.chatHeaderUsername.textContent = isGroup ? `Group: ${targetUser.groupName}` : `Chat with ${targetUser.username} (${isOnline ? 'Online' : 'Offline'})`;
        
        domElements.chatMessagesDiv.innerHTML = '';
        addSystemMessageToChat("Loading history...");
        
        if (isGroup) {
            socket.emit('request group chat history', { groupId: targetUser.groupId });
        } else {
            socket.emit('request chat history', { otherUserId: targetUser.userId });
        }
        
        domElements.chatWindow.style.display = 'flex';
        domElements.chatMessageInput?.focus();
        // Always scroll to bottom when opening chat
        domElements.chatMessagesDiv.scrollTop = domElements.chatMessagesDiv.scrollHeight;
        // After a short delay, mark all messages as read
        setTimeout(() => {
            const unreadMsgIds = Array.from(domElements.chatMessagesDiv.querySelectorAll('.message[data-message-id]'))
                .filter(div => {
                    const sender = div.querySelector('b')?.textContent?.replace(':', '').trim();
                    return sender === targetUser.username && !readMessages.has(div.dataset.messageId);
                })
                .map(div => div.dataset.messageId);
            if (unreadMsgIds.length > 0 && socket) {
                socket.emit('messages read', { messageIds: unreadMsgIds, fromUserId: getMyUserId(), toUserId: targetUser.userId });
                unreadMsgIds.forEach(id => readMessages.add(id));
            }
        }, 500);
        if (domElements.conversationsPanel) domElements.conversationsPanel.style.display = 'none';
        showChatIconIfAllClosed();
    }
    function closeChatWindow() { if (domElements.chatWindow) domElements.chatWindow.style.display = 'none'; currentChatTarget = null; domElements.emojiPicker?.classList.remove('show'); }
    function displayChatMessage(sender, message, isSentByMe, messageId = null) {
        if (!domElements.chatMessagesDiv) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message' + (isSentByMe ? ' sent-message' : ' received-message');
        if (messageId) {
            msgDiv.dataset.messageId = messageId;
        }
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        let statusHtml = '';
        if (isSentByMe) {
            statusHtml = '<span class="message-status delivered">✓</span>';
        }
        msgDiv.innerHTML = `
            <div class="message-content" style="padding:0;">
                <div class="message-body" style="padding:0;">
                    <div class="message-header" style="margin-bottom:0;">
                        <span class="message-sender">${sender.username}</span>
                        <span class="message-time">${timestamp}</span>
                    </div>
                    <div class="message-text">${message}</div>
                    <div class="message-reactions"></div>
                </div>
                ${statusHtml}
            </div>
        `;
        msgDiv.oncontextmenu = (e) => showMessageContextMenu(e, messageId);
        domElements.chatMessagesDiv.appendChild(msgDiv);
        domElements.chatMessagesDiv.scrollTop = domElements.chatMessagesDiv.scrollHeight;
        if (messageId) {
            updateMessageReactions(messageId);
        }
    }
    function addSystemMessageToChat(message) {
        if (!domElements.chatMessagesDiv) return;
        const msgDiv = document.createElement('div');
        msgDiv.textContent = message;
        msgDiv.classList.add('system-message');
        msgDiv.style.fontStyle = 'italic';
        msgDiv.style.color = '#aaa';
        msgDiv.style.textAlign = 'center';
        msgDiv.style.fontSize = '0.8em';
        msgDiv.style.margin = '5px 0';
        domElements.chatMessagesDiv.appendChild(msgDiv);
        // Always scroll to bottom after adding a system message
        domElements.chatMessagesDiv.scrollTop = domElements.chatMessagesDiv.scrollHeight;
    }
    function sendChatMessage() { if (!socket?.connected || !currentChatTarget || !domElements.chatMessageInput) return; const message = domElements.chatMessageInput.value.trim(); if (!message) return; socket.emit('private message', { recipientUserId: currentChatTarget.userId, message: message }); displayChatMessage({ userId: getMyUserId(), username: localStorage.getItem('loggedInUser') }, message, true); domElements.chatMessageInput.value = ''; domElements.chatMessageInput.focus(); }
    function updateUnreadBadge() { if (!domElements.chatUnreadBadge) return; let total = 0; unreadSenders.forEach(c => total += c); if (total > 0) { domElements.chatUnreadBadge.textContent = total > 9 ? '9+' : total; domElements.chatUnreadBadge.style.display = 'flex'; domElements.chatUnreadBadge.style.alignItems = 'center'; domElements.chatUnreadBadge.style.justifyContent = 'center'; } else { domElements.chatUnreadBadge.style.display = 'none'; } }
    function showConversationsPanel() { if (domElements.conversationsPanel && socket?.connected) { domElements.conversationsPanel.style.display = 'flex'; renderConversationsList(); } }
    function hideConversationsPanel() { if (domElements.conversationsPanel) domElements.conversationsPanel.style.display = 'none'; }
    function toggleConversationsPanel() { if (domElements.conversationsPanel) { if (domElements.conversationsPanel.style.display === 'flex') hideConversationsPanel(); else showConversationsPanel(); } }
    function renderConversationsList() {
        const list = document.getElementById('conversations-list');
        if (!list) return;
        list.innerHTML = '';
        const myUserId = getMyUserId();
        const sortedUsers = Array.from(conversationsMap.values()).sort((a, b) => {
            if (a.isOnline && !b.isOnline) return -1;
            if (!a.isOnline && b.isOnline) return 1;
            return a.username.localeCompare(b.username);
        });
        if (sortedUsers.length === 0) {
            const noConvMsg = document.createElement('li');
            noConvMsg.textContent = "No conversations yet.";
            noConvMsg.style.cssText = "padding: 10px; text-align: center; color: #aaa; font-size: 0.9em;";
            list.appendChild(noConvMsg);
            return;
        }
        sortedUsers.forEach(convData => {
            if (convData.userId === myUserId) return;
            const listItem = document.createElement('li');
            listItem.className = 'conversation-item';
            listItem.dataset.userId = convData.userId;
            // Avatar
            const avatarSeed = convData.username || convData.userId || 'user';
            const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(avatarSeed)}`;
            const avatarImg = document.createElement('img');
            avatarImg.className = 'conversation-avatar';
            avatarImg.src = avatarUrl;
            avatarImg.alt = 'avatar';
            // Name
            const nameSpan = document.createElement('span');
            nameSpan.className = 'conversation-name';
            nameSpan.textContent = convData.username;
            // Unread badge
            const unreadCount = unreadSenders.get(convData.userId) || 0;
            if (unreadCount > 0) {
                const unreadBadge = document.createElement('span');
                unreadBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                unreadBadge.style.cssText = "background-color: red; color: white; border-radius: 50%; padding: 1px 7px; font-size: 0.9em; margin-left: 8px; font-weight: bold;";
                nameSpan.appendChild(unreadBadge);
            }
            // Online status
            const statusIndicator = document.createElement('span');
            statusIndicator.className = `online-status-indicator ${convData.isOnline ? 'online' : ''}`;
            // Click event
            listItem.append(avatarImg, nameSpan, statusIndicator);
            listItem.addEventListener('click', () => openChatWindow({ userId: convData.userId, username: convData.username }));
            list.appendChild(listItem);
        });
    }
    function handleChatBackButtonClick() { 
        closeChatWindow(); 
        showConversationsPanel(); 
        setTimeout(showChatIconIfAllClosed, 0); // Ensure DOM updates before checking
    }

    // --- MAP FUNCTIONS ---
    // ... (keep initializeMapAndMarkers, getIconForMode, addUserToMap, removeUserFromMap, updateUserLocationOnMap, updateUserModeOnMap, clearAllUserMarkers, updateMarkerPopup, setupSidebarListeners, clearMeetpoint, handleMeetptSelect, calculateDistance, deg2rad, calculateMeetPoint, getPlaceNameFromCoords as they were) ...
    function initializeMapAndMarkers() { 
        if (map || !domElements.mapContainer) return; 
        console.log("Initializing map...");
        // Define tile layers
        const streetsLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        });
        const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles © Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        });
        const satelliteHybridLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles © Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        });

        // Store layers for switching
        map = L.map(domElements.mapContainer, {
            center: [16.30697, 80.43635],
            zoom: 10,
            layers: [streetsLayer]
        });
        map._customLayers = { 
            streets: streetsLayer, 
            satellite: satelliteLayer,
            'satellite-hybrid': satelliteHybridLayer
        };
        map.on('popupopen', (e) => { 
            const meetptButton = e.popup?._contentNode?.querySelector('.select-button'); 
            if (meetptButton) { 
                meetptButton.onclick = () => { 
                    const id = parseInt(meetptButton.dataset.userId); 
                    if(id) handleMeetptSelect(id); 
                    map.closePopup(); 
                }; 
            } 
            const chatButton = e.popup?._contentNode?.querySelector('.chat-button'); 
            if (chatButton) { 
                chatButton.onclick = () => { 
                    const id = parseInt(chatButton.dataset.chatUserid); 
                    const name = chatButton.dataset.chatUsername; 
                    if (id && name) { 
                        openChatWindow({ userId: id, username: name }); 
                        map.closePopup(); 
                    } 
                }; 
            } 
        }); 
        setupSidebarListeners(); 
    }
    function getIconForMode(mode) { switch (mode) { case 'person': return L.divIcon({ className: 'traveler-icon', html: '👤' }); case 'motorcycle': return L.divIcon({ className: 'traveler-icon', html: '🛵' }); case 'car': return L.divIcon({ className: 'traveler-icon', html: '🚗' }); default: return L.divIcon({ className: 'traveler-icon', html: '❓' }); } }
    function addUserToMap(userData) { if (!map) return; const myUserId = getMyUserId(); const isSelf = userData.userId === myUserId; let existingData = onlineUsersMap.get(userData.userId); if (!existingData) { onlineUsersMap.set(userData.userId, { ...userData, marker: null, isOnline: true }); existingData = onlineUsersMap.get(userData.userId); } else { Object.assign(existingData, userData, {isOnline: true}); } const shouldShowMarker = !(isSelf && ghostModeOn); const hasLocation = existingData.latitude != null && existingData.longitude != null; if (shouldShowMarker && hasLocation) { const latLng = L.latLng(existingData.latitude, existingData.longitude); const icon = getIconForMode(existingData.mode); if (existingData.marker) { existingData.marker.setLatLng(latLng).setIcon(icon); updateMarkerPopup(existingData.marker, existingData); } else { existingData.marker = L.marker(latLng, { icon: icon }).addTo(map); updateMarkerPopup(existingData.marker, existingData); } } else if (existingData.marker) { map.removeLayer(existingData.marker); existingData.marker = null; } }
    function removeUserFromMap(userId) { if (onlineUsersMap.has(userId)) { const data = onlineUsersMap.get(userId); if (data.marker) map.removeLayer(data.marker); if(data) data.marker = null; data.isOnline = false; console.log(`Removed marker for ${userId}.`); if (userId === currentlyMeetingWithId) clearMeetpoint(); } }
    function updateUserLocationOnMap(userId, latitude, longitude) { if (onlineUsersMap.has(userId)) { const data = onlineUsersMap.get(userId); data.latitude = latitude; data.longitude = longitude; addUserToMap(data); } }
    function updateUserModeOnMap(userId, mode) { if (onlineUsersMap.has(userId)) { const data = onlineUsersMap.get(userId); data.mode = mode; addUserToMap(data); } }
    function clearAllUserMarkers() { if(map) onlineUsersMap.forEach(d => { if (d.marker) map.removeLayer(d.marker); }); onlineUsersMap.clear(); console.log("Cleared markers & user map state."); }
    function updateMarkerPopup(marker, userData) { if (!marker || !userData) return; const myUserId = getMyUserId(); const isSelf = userData.userId === myUserId; let baseContent = `<b>${userData.username}${isSelf ? ' (You)' : ''}</b>`; let buttonsHtml = ''; const isLoggedIn = !!localStorage.getItem('authToken'); const targetIsOnline = onlineUsersMap.has(userData.userId) && onlineUsersMap.get(userData.userId).isOnline; if (!isSelf && isLoggedIn) { if (locationActive && userData.latitude != null && userLocation.latitude != null) buttonsHtml += `<button class="select-button" data-user-id="${userData.userId}" title="Meetpoint">Meetpt</button>`; buttonsHtml += `<button class="chat-button" data-chat-userid="${userData.userId}" data-chat-username="${userData.username}" title="${targetIsOnline ? 'Chat':'Offline'}" ${!targetIsOnline ? 'disabled':''}>Chat</button>`; } let finalContent = baseContent + (buttonsHtml ? `<br>${buttonsHtml}` : ''); if (currentlyMeetingWithId && (isSelf || userData.userId === currentlyMeetingWithId) && meetpointMarker?.getPopup()) finalContent += `<br>${meetpointMarker.getPopup().getContent()}`; marker.bindPopup(finalContent).update(); }
    function setupSidebarListeners() {
        if (domElements.ghostModeCheckbox) {
            domElements.ghostModeCheckbox.addEventListener('change', function() {
                ghostModeOn = this.checked;
                domElements.ghostModeStatus.textContent = ghostModeOn ? 'On' : 'Off';
                const myId = getMyUserId();
                if (ghostModeOn) {
                    // Stop sending location, send null to server
                    locationActive = false;
                    if (socket?.connected) socket.emit('update location', { latitude: null, longitude: null });
                    updateUserLocationOnMap(myId, null, null);
                    clearMeetpoint();
                    // Show ghost marker for yourself if you have a last known location
                    if (userLocation.latitude && userLocation.longitude && map) {
                        if (ghostMarker) map.removeLayer(ghostMarker);
                        ghostMarker = L.marker([userLocation.latitude, userLocation.longitude], {
                            icon: L.divIcon({ className: 'traveler-icon', html: '👻' })
                        }).addTo(map);
                    }
                } else {
                    // Remove ghost marker
                    if (ghostMarker && map) {
                        map.removeLayer(ghostMarker);
                        ghostMarker = null;
                    }
                    // Resume sending location if My Location is enabled
                    if (domElements.myLocationButton && domElements.myLocationButton.checked) {
                        if (!navigator.geolocation) {
                            alert("Geolocation not supported.");
                            domElements.myLocationButton.checked = false;
                            domElements.myLocationStatus.textContent = 'Off';
                            return;
                        }
                        domElements.myLocationStatus.textContent = 'Requesting...';
                        navigator.geolocation.getCurrentPosition((pos) => {
                            locationActive = true;
                            domElements.myLocationStatus.textContent = 'On';
                            userLocation = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                            if (socket?.connected) socket.emit('update location', userLocation);
                            updateUserLocationOnMap(myId, userLocation.latitude, userLocation.longitude);
                            map.setView([userLocation.latitude, userLocation.longitude], Math.max(map.getZoom(), 15));
                            if (currentlyMeetingWithId) handleMeetptSelect(currentlyMeetingWithId);
                        }, (err) => {
                            locationActive = false;
                            userLocation = { latitude: null, longitude: null };
                            alert(`Loc Error: ${err.message}`);
                            domElements.myLocationButton.checked = false;
                            domElements.myLocationStatus.textContent = 'Off';
                            if (socket?.connected) socket.emit('update location', { latitude: null, longitude: null });
                            updateUserLocationOnMap(myId, null, null);
                            clearMeetpoint();
                        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
                    } else {
                        domElements.myLocationStatus.textContent = 'Off';
                        locationActive = false;
                        userLocation = { latitude: null, longitude: null };
                        if (socket?.connected) socket.emit('update location', { latitude: null, longitude: null });
                        updateUserLocationOnMap(myId, null, null);
                        clearMeetpoint();
                    }
                }
            });
            ghostModeOn = domElements.ghostModeCheckbox.checked;
            domElements.ghostModeStatus.textContent = ghostModeOn ? 'On' : 'Off';
        }
        if (domElements.myLocationButton) {
            domElements.myLocationButton.addEventListener('change', function() {
                const myId = getMyUserId();
                if (this.checked) {
                    domElements.myLocationStatus.textContent = 'Requesting...';
                    if (!navigator.geolocation) {
                        alert("Geolocation not supported.");
                        this.checked = false;
                        domElements.myLocationStatus.textContent = 'Off';
                        return;
                    }
                    navigator.geolocation.getCurrentPosition((pos) => {
                        locationActive = true;
                        domElements.myLocationStatus.textContent = 'On';
                        userLocation = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                        if (socket?.connected) socket.emit('update location', userLocation);
                        updateUserLocationOnMap(myId, userLocation.latitude, userLocation.longitude);
                        map.setView([userLocation.latitude, userLocation.longitude], Math.max(map.getZoom(), 15));
                        if (currentlyMeetingWithId) handleMeetptSelect(currentlyMeetingWithId);
                    }, (err) => {
                        locationActive = false;
                        userLocation = { latitude: null, longitude: null };
                        alert(`Loc Error: ${err.message}`);
                        this.checked = false;
                        domElements.myLocationStatus.textContent = 'Off';
                        if (socket?.connected) socket.emit('update location', { latitude: null, longitude: null });
                        updateUserLocationOnMap(myId, null, null);
                        clearMeetpoint();
                    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
                } else {
                    domElements.myLocationStatus.textContent = 'Off';
                    locationActive = false;
                    userLocation = { latitude: null, longitude: null };
                    if (socket?.connected) socket.emit('update location', { latitude: null, longitude: null });
                    updateUserLocationOnMap(myId, null, null);
                    clearMeetpoint();
                }
            });
        }
        if (domElements.modeSelector) {
            domElements.modeSelector.addEventListener('change', function() {
                const mode = this.value;
                const myId = getMyUserId();
                updateUserModeOnMap(myId, mode);
                if (socket?.connected) socket.emit('update mode', { mode });
            });
        }
        if (domElements.mapLayerSelector) {
            domElements.mapLayerSelector.addEventListener('change', function() {
                if (!map || !map._customLayers) return;
                // Remove all layers first
                Object.values(map._customLayers).forEach(layer => map.removeLayer(layer));
                // Add the selected layer
                const selected = this.value;
                if (map._customLayers[selected]) {
                    map.addLayer(map._customLayers[selected]);
                }
            });
        }
    }
    window.clearMeetpoint = function() { if (meetpointMarker) { map.removeLayer(meetpointMarker); meetpointMarker = null; } const oldId = currentlyMeetingWithId; currentlyMeetingWithId = null; const myId = getMyUserId(); const myData = onlineUsersMap.get(myId); if(myData?.marker) updateMarkerPopup(myData.marker, myData); const oldTargetData = onlineUsersMap.get(oldId); if (oldTargetData?.marker) updateMarkerPopup(oldTargetData.marker, oldTargetData); }
    window.handleMeetptSelect = async function(targetUserId) {
        const myUserId = getMyUserId();
        const user = onlineUsersMap.get(myUserId);
        const target = onlineUsersMap.get(targetUserId);

        // Validate authentication
        if (!localStorage.getItem('authToken')) {
            alert("Please log in to use the meetpoint feature.");
            return;
        }

        // Validate user data
        if (!user || !target) {
            console.error("Meetpoint: User data missing.");
            alert("Could not find user data. Please try again.");
            return;
        }

        // Check if either user is in ghost mode
        if (ghostModeOn) {
            alert("Cannot calculate meetpoint while in ghost mode. Please disable ghost mode first.");
            return;
        }

        // Check if target is in ghost mode
        if (target.ghostMode) {
            alert(`${target.username} is in ghost mode and cannot be used for meetpoint calculation.`);
            return;
        }

        // Validate locations
        if (!locationActive || user.latitude == null) {
            alert("Your location is not active. Please enable location sharing.");
            return;
        }

        if (target.latitude == null) {
            alert(`${target.username}'s location is not available.`);
            return;
        }

        const prevId = currentlyMeetingWithId;
        clearMeetpoint();

        // Calculate meetpoint
        let coords = calculateMeetPoint(user, target);
        if (!coords) {
            alert("Could not calculate meetpoint. Users may be too far apart.");
            return;
        }

        // Calculate distance
        let distStr = userLocation.latitude ? 
            `${calculateDistance(userLocation.latitude, userLocation.longitude, coords.latitude, coords.longitude).toFixed(2)} km` : 
            null;

        // Create temporary meetpoint marker
        meetpointMarker = L.marker([coords.latitude, coords.longitude], {
            icon: L.divIcon({ className: 'meetpoint-icon', html: '⏳' })
        }).addTo(map).bindPopup(`Calculating...`).openPopup();

        try {
            // Get place name
            const name = await getPlaceNameFromCoords(coords.latitude, coords.longitude);
            currentlyMeetingWithId = targetUserId;

            // Update meetpoint marker
            if (meetpointMarker) {
                meetpointMarker.setIcon(L.divIcon({ className: 'meetpoint-icon', html: '📍' }));
                meetpointMarker.setPopupContent(`Meetpoint: ${name}${distStr ? ` (${distStr} away)` : ''}`);
            }

            // Update user markers
            if (user.marker) updateMarkerPopup(user.marker, user);
            if (target.marker) updateMarkerPopup(target.marker, target);

            // Update previous target if different
            const prevTarget = onlineUsersMap.get(prevId);
            if (prevId && prevId !== targetUserId && prevTarget?.marker) {
                updateMarkerPopup(prevTarget.marker, prevTarget);
            }

            console.log(`Meetpoint: ${name}. Dist: ${distStr || 'N/A'}`);
        } catch (err) {
            console.error("Meetpoint Error:", err);
            if (meetpointMarker) {
                meetpointMarker.setIcon(L.divIcon({ className: 'meetpoint-icon', html: '❓' }));
                meetpointMarker.setPopupContent(`Meetpoint: Coords (lookup failed)`);
            }
            currentlyMeetingWithId = null;
            if (user.marker) updateMarkerPopup(user.marker, user);
            if (target.marker) updateMarkerPopup(target.marker, target);
        }
    }
    window.calculateDistance = function(lat1, lon1, lat2, lon2) { const R = 6371; const dLat = deg2rad(lat2 - lat1); const dLon = deg2rad(lon2 - lon1); const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c; }
    window.deg2rad = function(deg) { return deg * (Math.PI / 180); }
    window.calculateMeetPoint = function(d1, d2) {
        // Validate inputs
        if (!d1 || !d2 || d1.latitude == null || d2.latitude == null) {
            console.error("Invalid user data for meetpoint calculation");
            return null;
        }

        // Check for NaN values
        if (isNaN(d1.latitude) || isNaN(d1.longitude) || isNaN(d2.latitude) || isNaN(d2.longitude)) {
            console.error("Invalid coordinates (NaN)");
            return null;
        }

        // Calculate distance between points
        const distance = calculateDistance(d1.latitude, d1.longitude, d2.latitude, d2.longitude);
        
        // If users are too far apart (e.g., > 1000km), return null
        if (distance > 1000) {
            console.warn("Users are too far apart for meetpoint calculation");
            return null;
        }

        // Calculate midpoint
        return {
            latitude: (d1.latitude + d2.latitude) / 2,
            longitude: (d1.longitude + d2.longitude) / 2
        };
    }
    window.getPlaceNameFromCoords = async function(lat, lon) { const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=en`; try { const res = await fetch(url); if (!res.ok) throw new Error(`Nominatim: ${res.status}`); const data = await res.json(); let name = data.display_name || 'Unknown'; if (data.address) { name = data.address.road||data.address.suburb||data.address.village||data.address.town||data.address.city||name; if ((name===data.address.road||name===data.address.suburb) && data.address.country) name += `, ${data.address.country}`; } return name; } catch (err) { console.error("Geocoding error:", err); return `Coords: ${lat.toFixed(3)}, ${lon.toFixed(3)}`; } }


    // --- Setup Global Event Listeners (at the end of DOMContentLoaded) ---
    if (domElements.signupFormEl) {
        console.log("Attaching listener to signup form..."); // <-- DEBUG LOG
        domElements.signupFormEl.addEventListener('submit', (e) => handleAuthFormSubmit(e, '/api/auth/signup'));
    } else { console.error("Signup Form Not Found!"); }

    if (domElements.loginFormEl) {
         console.log("Attaching listener to login form..."); // <-- DEBUG LOG
        domElements.loginFormEl.addEventListener('submit', (e) => handleAuthFormSubmit(e, '/api/auth/login'));
    } else { console.error("Login Form Not Found!"); }

    // --- Attach listeners for toggle links ---
    if (domElements.toggleToLoginLink) {
        console.log("Attaching listener to toggle-to-login link..."); // <-- DEBUG LOG
        domElements.toggleToLoginLink.addEventListener('click', toggleForms);
    } else { console.error("Toggle to Login link not found!"); }

    if (domElements.toggleToSignupLink) {
        console.log("Attaching listener to toggle-to-signup link..."); // <-- DEBUG LOG
        domElements.toggleToSignupLink.addEventListener('click', toggleForms);
    } else { console.error("Toggle to Signup link not found!"); }


    // --- Other Listeners ---
    if (domElements.logoutButton) domElements.logoutButton.addEventListener('click', () => { fetch('/api/auth/logout', { method: 'POST' }).catch(console.error); localStorage.clear(); updateLoginState(); }); else console.error("Logout Button Not Found!");
    if (domElements.globalChatToggle) domElements.globalChatToggle.addEventListener('click', toggleConversationsPanel); else console.error("Global Chat Toggle Not Found!");
    if (domElements.closeConversationsBtn) domElements.closeConversationsBtn.addEventListener('click', hideConversationsPanel); else console.error("Close Conversations Button Not Found!");
    if (domElements.closeChatBtn) domElements.closeChatBtn.addEventListener('click', () => {
        closeChatWindow();
        showChatIconIfAllClosed(); // Ensure chat icon reappears
    }); else console.error("Close Chat Button Not Found!");
    if (domElements.chatBackBtn) domElements.chatBackBtn.addEventListener('click', handleChatBackButtonClick); else console.error("Chat Back Button Not Found!");
    if (domElements.sendChatBtn) domElements.sendChatBtn.addEventListener('click', sendChatMessage); else console.error("Send Chat Button Not Found!");
    if (domElements.chatMessageInput) domElements.chatMessageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }); else console.error("Chat Message Input Not Found!");
    // --- Emoji Picker for Message Input ---
    if (domElements.emojiBtn && domElements.emojiPicker && domElements.chatMessageInput) {
        domElements.emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            domElements.emojiPicker.classList.toggle('show');
            domElements.emojiPicker.style.display = domElements.emojiPicker.classList.contains('show') ? 'block' : 'none';
        });
        domElements.emojiPicker.addEventListener('emoji-click', (e) => {
            const input = domElements.chatMessageInput;
            const start = input.selectionStart ?? input.value.length;
            input.value = input.value.substring(0, start) + e.detail.unicode + input.value.substring(input.selectionEnd ?? start);
            input.selectionStart = input.selectionEnd = start + e.detail.unicode.length;
            input.focus();
            domElements.emojiPicker.classList.remove('show');
            domElements.emojiPicker.style.display = 'none';
        });
        document.addEventListener('click', (e) => {
            if (domElements.emojiPicker && !domElements.emojiPicker.contains(e.target) && e.target !== domElements.emojiBtn) {
                domElements.emojiPicker.classList.remove('show');
                domElements.emojiPicker.style.display = 'none';
            }
        });
        // Hide by default
        domElements.emojiPicker.classList.remove('show');
        domElements.emojiPicker.style.display = 'none';
    }

    // --- Reaction Picker for Message Reactions ---
    const reactionPicker = document.getElementById('reaction-picker');
    if (reactionPicker) {
        reactionPicker.classList.add('hidden');
        reactionPicker.style.display = 'none';
    }

    window.showReactionPicker = function(event, messageId) {
        event.preventDefault();
        const picker = document.getElementById('reaction-picker');
        picker.style.left = `${event.clientX}px`;
        picker.style.top = `${event.clientY}px`;
        picker.classList.remove('hidden');
        picker.style.display = 'flex';
        // Remove previous listeners
        Array.from(picker.querySelectorAll('.reaction-option')).forEach(button => {
            button.onclick = null;
        });
        picker.querySelectorAll('.reaction-option').forEach(button => {
            button.onclick = () => {
                toggleReaction(messageId, button.dataset.reaction);
                picker.classList.add('hidden');
                picker.style.display = 'none';
            };
        });
        // Hide picker if click outside
        const closePicker = (e) => {
            if (!picker.contains(e.target)) {
                picker.classList.add('hidden');
                picker.style.display = 'none';
                document.removeEventListener('click', closePicker);
            }
        };
        setTimeout(() => document.addEventListener('click', closePicker), 0);
    };

    // --- Theme toggle logic
    const applyTheme = (theme) => {
        if (theme === 'light') {
            document.body.classList.add('light-theme');
            domElements.themeToggleBtn.textContent = '☀️';
        } else {
            document.body.classList.remove('light-theme');
            domElements.themeToggleBtn.textContent = '🌙';
        }
    };
    // Load theme from localStorage
    let savedTheme = localStorage.getItem('theme');
    if (!savedTheme) {
        savedTheme = 'dark';
        localStorage.setItem('theme', 'dark');
    }
    applyTheme(savedTheme);
    if (domElements.themeToggleBtn) {
        domElements.themeToggleBtn.addEventListener('click', () => {
            const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
        });
    }

    // --- Initial Setup Calls ---
    initializeMapAndMarkers();
    updateLoginState();
    if (localStorage.getItem('authToken')) { fetchUserDetails(); }

    console.log("script.js: Initial setup complete.");

    // Add participants button
    if (domElements.addParticipantBtn) {
        domElements.addParticipantBtn.addEventListener('click', () => {
            document.getElementById('participants-modal').classList.remove('hidden');
        });
    }
    
    // Close participants modal
    if (domElements.closeParticipantsModal) {
        domElements.closeParticipantsModal.addEventListener('click', () => {
            document.getElementById('participants-modal').classList.add('hidden');
        });
    }
    
    // File upload button
    if (domElements.fileUploadBtn) {
        domElements.fileUploadBtn.addEventListener('click', () => {
            document.getElementById('file-upload-modal').classList.remove('hidden');
        });
    }
    
    // Close file upload modal
    if (domElements.closeFileModal) {
        domElements.closeFileModal.addEventListener('click', () => {
            document.getElementById('file-upload-modal').classList.add('hidden');
        });
    }
    
    // Handle file upload
    if (domElements.uploadFileBtn) {
        domElements.uploadFileBtn.addEventListener('click', () => {
            const fileInput = document.getElementById('file-input');
            if (fileInput.files.length > 0) {
                const formData = new FormData();
                Array.from(fileInput.files).forEach(file => {
                    formData.append('files', file);
                });
                
                fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    data.files.forEach(file => {
                        const message = `File: ${file.name} (${file.size} bytes)`;
                        sendChatMessage(message);
                    });
                    document.getElementById('file-upload-modal').classList.add('hidden');
                })
                .catch(error => {
                    console.error('Error uploading files:', error);
                    addSystemMessageToChat('Error uploading files');
                });
            }
        });
    }

    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
                .then(reg => console.log('Service Worker registered:', reg))
                .catch(err => console.log('Service Worker registration failed:', err));
        });
    }
}); // End DOMContentLoaded listener

console.log("script.js: Loaded.");
// --- END OF public/script.js ---

function addReactionToMessage(messageId, reaction, userId) {
    if (!messageReactions.has(messageId)) {
        messageReactions.set(messageId, new Map());
    }
    
    const messageReactionsMap = messageReactions.get(messageId);
    if (!messageReactionsMap.has(reaction)) {
        messageReactionsMap.set(reaction, new Set());
    }
    
    messageReactionsMap.get(reaction).add(userId);
    updateMessageReactions(messageId);
}

function updateMessageReactions(messageId) {
    // Find the correct message bubble
    const msgDiv = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!msgDiv) return;
    let reactionsContainer = msgDiv.querySelector('.message-reactions');
    if (!reactionsContainer) {
        reactionsContainer = document.createElement('div');
        reactionsContainer.className = 'message-reactions';
        msgDiv.appendChild(reactionsContainer);
    }
    reactionsContainer.innerHTML = '';
    const reactions = messageReactions.get(messageId);
    if (!reactions) return;
    reactions.forEach((userIds, reaction) => {
        const reactionElement = document.createElement('span');
        reactionElement.className = 'reaction';
        reactionElement.innerHTML = `${reaction} <span class="reaction-count">${userIds.size}</span>`;
        reactionElement.onclick = () => toggleReaction(messageId, reaction);
        reactionsContainer.appendChild(reactionElement);
    });
}

function toggleReaction(messageId, reaction) {
    const userId = getMyUserId();
    const messageReactionsMap = messageReactions.get(messageId);
    
    if (messageReactionsMap?.get(reaction)?.has(userId)) {
        messageReactionsMap.get(reaction).delete(userId);
        if (messageReactionsMap.get(reaction).size === 0) {
            messageReactionsMap.delete(reaction);
        }
    } else {
        if (!messageReactionsMap) {
            messageReactions.set(messageId, new Map());
        }
        if (!messageReactions.get(messageId).has(reaction)) {
            messageReactions.get(messageId).set(reaction, new Set());
        }
        messageReactions.get(messageId).get(reaction).add(userId);
    }
    
    socket.emit('update message reaction', {
        messageId,
        reaction,
        userId,
        add: !messageReactionsMap?.get(reaction)?.has(userId)
    });
    
    updateMessageReactions(messageId);
}

function showMessageContextMenu(event, messageId) {
    event.preventDefault();
    document.querySelectorAll('.message-context-menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'message-context-menu show';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    const pinItem = document.createElement('div');
    pinItem.className = 'context-menu-item';
    pinItem.textContent = pinnedMessages.has(messageId) ? 'Unpin Message' : 'Pin Message';
    pinItem.onclick = (e) => {
        e.stopPropagation();
        pinMessage(messageId);
        menu.remove();
    };
    const reactItem = document.createElement('div');
    reactItem.className = 'context-menu-item';
    reactItem.textContent = 'Add Reaction';
    reactItem.onclick = (e) => {
        e.stopPropagation();
        showReactionPicker(event, messageId);
        menu.remove();
    };
    const copyItem = document.createElement('div');
    copyItem.className = 'context-menu-item';
    copyItem.textContent = 'Copy Text';
    copyItem.onclick = (e) => {
        e.stopPropagation();
        copyMessageText(messageId);
        menu.remove();
    };
    menu.appendChild(pinItem);
    menu.appendChild(reactItem);
    menu.appendChild(copyItem);
    document.body.appendChild(menu);
    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('mousedown', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
}
window.showMessageContextMenu = showMessageContextMenu;

function pinMessage(messageId) {
    if (pinnedMessages.has(messageId)) {
        pinnedMessages.delete(messageId);
    } else {
        pinnedMessages.add(messageId);
    }
    
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.classList.toggle('pinned-message');
    }
    
    socket.emit('update pinned message', {
        messageId,
        pin: !pinnedMessages.has(messageId)
    });
}

function copyMessageText(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        const text = messageElement.querySelector('.message-text').textContent;
        navigator.clipboard.writeText(text).then(() => {
            addSystemMessageToChat('Message copied to clipboard');
        }).catch(() => {
            addSystemMessageToChat('Failed to copy message');
        });
    }
}
window.copyMessageText = copyMessageText;

function updatePinnedMessagesList() {
    if (!domElements || !domElements.pinnedMessagesList) return;
    domElements.pinnedMessagesList.innerHTML = '';
    pinnedMessages.forEach(messageId => {
        const msgDiv = document.querySelector(`[data-message-id="${messageId}"]`);
        if (msgDiv) {
            const text = msgDiv.querySelector('.message-text')?.textContent || '';
            const item = document.createElement('div');
            item.className = 'pinned-message-item';
            item.textContent = text;
            item.onclick = () => {
                msgDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                msgDiv.classList.add('highlight');
                setTimeout(() => msgDiv.classList.remove('highlight'), 2000);
            };
            domElements.pinnedMessagesList.appendChild(item);
        }
    });
}

// Add these socket event handlers
socket.on('message pinned', (data) => {
    updatePinnedMessagesList();
    if (currentChatTarget?.userId === data.senderId) {
        addSystemMessageToChat(`${data.sender} pinned a message`);
    }
});

socket.on('reaction added', (data) => {
    updateMessageReactions(data.messageId);
});

// --- Floating Chat Icon Button Logic ---
const globalChatToggle = document.getElementById('global-chat-toggle');
const conversationsPanel = document.getElementById('conversations-panel');
const closeConversationsBtn = document.getElementById('close-conversations-btn');
if (globalChatToggle) {
    globalChatToggle.addEventListener('click', () => {
        const chatWindow = document.getElementById('chat-window');
        if (chatWindow) chatWindow.style.display = 'none';
        if (conversationsPanel) {
            conversationsPanel.style.display = 'flex';
            conversationsPanel.style.zIndex = 3000;
        }
        showChatIconIfAllClosed();
    });
}
if (closeConversationsBtn && conversationsPanel) {
    closeConversationsBtn.addEventListener('click', () => {
        conversationsPanel.style.display = 'none';
        showChatIconIfAllClosed();
    });
}
const closeChatBtn = document.getElementById('close-chat-btn');
if (closeChatBtn) {
    closeChatBtn.addEventListener('click', () => {
        const chatWindow = document.getElementById('chat-window');
        if (chatWindow) chatWindow.style.display = 'none';
        showChatIconIfAllClosed();
    });
}

// Update unread badge logic if needed
function updateUnreadBadge() {
    const badge = document.getElementById('chat-unread-badge');
    let total = 0;
    unreadSenders.forEach(c => total += c);
    if (badge) {
        if (total > 0) {
            badge.textContent = total > 9 ? '9+' : total;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

function showChatIconIfAllClosed() {
    const chatWindow = document.getElementById('chat-window');
    const globalChatToggle = document.getElementById('global-chat-toggle');
    if (globalChatToggle) {
        if (chatWindow && chatWindow.style.display === 'flex') {
            globalChatToggle.style.display = 'none';
        } else {
            globalChatToggle.style.display = 'flex';
        }
    }
}