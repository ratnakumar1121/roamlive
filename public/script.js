// --- START OF public/script.js ---

// --- Global Map State Variables ---
let map;
let meetpointMarker = null;
let currentlyMeetingWithId = null;
let userLocation = { latitude: null, longitude: null }; // Stores THIS user's coords
let ghostModeOn = false;
let locationActive = false;

// --- Global Chat State Variables ---
let socket = null;
let currentChatTarget = null; // { userId, username }
let notificationSound = null; // <-- Variable for the sound object

// --- Client-side state for online users ---
let onlineUsersMap = new Map(); // { userId -> { username, role, mode, latitude, longitude, marker } }


// --- DOM Elements ---
// Ensure these selectors match your index.html exactly
const signupFormEl = document.querySelector('#signup-form form');
const loginFormEl = document.querySelector('#login-form form');
const signupMessageEl = document.getElementById('signup-message');
const loginMessageEl = document.getElementById('login-message');
const signupContainer = document.getElementById('signup-form');
const loginContainer = document.getElementById('login-form');
const userStatusEl = document.getElementById('user-status');
const loggedInUsernameEl = document.getElementById('logged-in-username');
const logoutButton = document.getElementById('logout-button');
const authContainer = document.getElementById('auth-container');
const chatWindow = document.getElementById('chat-window');
const chatHeaderUsername = document.getElementById('chat-with-username');
const closeChatBtn = document.getElementById('close-chat-btn');
const chatMessagesDiv = document.getElementById('chat-messages');
const chatMessageInput = document.getElementById('chat-message-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const emojiBtn = document.getElementById('emoji-btn'); // <-- Get Emoji Button
const emojiPicker = document.getElementById('emoji-picker'); // <-- Get Emoji Picker
// Sidebar Controls
const ghostModeCheckbox = document.getElementById('ghost-mode');
const ghostModeStatus = document.getElementById('ghost-mode-status');
const nicknameInput = document.getElementById('nickname');
const myLocationButton = document.getElementById('my-location-button');
const myLocationStatus = document.getElementById('my-location-status');
const modeSelector = document.getElementById('mode');


// === AUTHENTICATION LOGIC ===
function toggleForms() { if (!signupContainer || !loginContainer) return; if (signupContainer.style.display === 'none') { signupContainer.style.display = 'block'; loginContainer.style.display = 'none'; } else { signupContainer.style.display = 'none'; loginContainer.style.display = 'block'; } if (signupMessageEl) signupMessageEl.textContent = ''; if (loginMessageEl) loginMessageEl.textContent = ''; }

function updateLoginState() {
    const token = localStorage.getItem('authToken');
    const username = localStorage.getItem('loggedInUser');
    const userId = localStorage.getItem('loggedInUserId');

    if (token && username && userId) {
        // Logged In
        if (authContainer) authContainer.style.display = 'none';
        if (userStatusEl) userStatusEl.style.display = 'block';
        if (loggedInUsernameEl) loggedInUsernameEl.textContent = username;
        if (nicknameInput) nicknameInput.value = username; // Set sidebar nickname
        connectWebSocket(token); // Connect WebSocket, which will handle adding self to map
    } else {
        // Logged Out
        if (authContainer) authContainer.style.display = 'block';
        if (userStatusEl) userStatusEl.style.display = 'none';
        if (loggedInUsernameEl) loggedInUsernameEl.textContent = '';
        if(signupContainer) signupContainer.style.display = 'none';
        if(loginContainer) loginContainer.style.display = 'block';
        disconnectWebSocket();
        closeChatWindow();
        clearAllUserMarkers();
        if (map) { clearMeetpoint(); }
    }
    if (signupMessageEl) signupMessageEl.textContent = '';
    if (loginMessageEl) loginMessageEl.textContent = '';
}

// Signup Listener
if (signupFormEl) {
    signupFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("Signup form submitted");
        if (signupMessageEl) signupMessageEl.textContent = 'Signing up...';
        const usernameInput = document.getElementById('signup-username');
        const passwordInput = document.getElementById('signup-password');
        if (!usernameInput || !passwordInput) { console.error("Signup form elements not found"); return; }
        const username = usernameInput.value; const password = passwordInput.value;
        try {
            const response = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
            const data = await response.json();
            if (!response.ok) { throw new Error(data.message || `HTTP error! status: ${response.status}`); }
            if (signupMessageEl) signupMessageEl.textContent = `Signup successful! You can now log in.`;
            signupFormEl.reset(); setTimeout(toggleForms, 1500);
        } catch (error) { console.error('Signup fetch error:', error); if (signupMessageEl) signupMessageEl.textContent = `Error: ${error.message}`; }
    });
} else {
    console.error("Signup form element not found!");
}

// Login Listener
if (loginFormEl) {
    loginFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (loginMessageEl) loginMessageEl.textContent = 'Logging in...';
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        if (!usernameInput || !passwordInput) return;
        const username = usernameInput.value; const password = passwordInput.value;
        try {
            const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
            const data = await response.json();
            if (!response.ok) { throw new Error(data.message || `HTTP error! status: ${response.status}`); }
            if (loginMessageEl) loginMessageEl.textContent = 'Login successful!';
            loginFormEl.reset();
            console.log("Received Token:", data.token);
            console.log("User Info:", data.user);
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('loggedInUser', data.user.username);
            localStorage.setItem('loggedInUserId', data.user.id); // Store user ID too!
            updateLoginState();
            fetchUserDetails();
        } catch (error) {
            console.error('Login fetch error:', error);
            if (loginMessageEl) loginMessageEl.textContent = `Error: ${error.message}`;
            localStorage.removeItem('authToken');
            localStorage.removeItem('loggedInUser');
            localStorage.removeItem('loggedInUserId');
            updateLoginState();
        }
    });
}

// Logout Listener
if (logoutButton) {
    logoutButton.addEventListener('click', () => {
        fetch('/api/auth/logout', { method: 'POST' }).catch(err => console.error("Logout fetch error:", err));
        localStorage.removeItem('authToken');
        localStorage.removeItem('loggedInUser');
        localStorage.removeItem('loggedInUserId');
        updateLoginState();
        if(loginMessageEl) loginMessageEl.textContent = 'Logged out.';
    });
}

// Fetch User Details (Verify Token)
async function fetchUserDetails() {
    const token = localStorage.getItem('authToken');
    if (!token) { console.log("fetchUserDetails: No token found."); return; }
    console.log("fetchUserDetails: Attempting to fetch /api/auth/me");
    try {
        const response = await fetch('/api/auth/me', { method: 'GET', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
        const data = await response.json();
        if (!response.ok) { if (response.status === 401 || response.status === 403) { console.warn("User details fetch failed (token invalid or expired?). Status:", response.status, data.message); if(logoutButton) logoutButton.click(); } throw new Error(data.message || `HTTP error! status: ${response.status}`); }
        console.log("User details from /api/auth/me:", data.user);
    } catch (error) { console.error("Error fetching user details:", error.message); }
}


// === WEBSOCKET / CHAT LOGIC ===
function connectWebSocket(token) {
    if (socket && socket.connected) { return; }
    console.log("Attempting WebSocket connection...");
    socket = io({ auth: { token } });

    socket.on('connect', () => {
        console.log(`WebSocket connected: ${socket.id}`);
        const myUserId = parseInt(localStorage.getItem('loggedInUserId'));
        const myUsername = localStorage.getItem('loggedInUser');
        const currentMode = modeSelector ? modeSelector.value : 'person';
        if (myUserId && myUsername) {
            addUserToMap({ userId: myUserId, username: myUsername, mode: currentMode, latitude: userLocation.latitude, longitude: userLocation.longitude });
            if (locationActive && userLocation.latitude && userLocation.longitude) { socket.emit('update location', { latitude: userLocation.latitude, longitude: userLocation.longitude }); }
            socket.emit('update mode', { mode: currentMode });
        }
    });

    socket.on('disconnect', (reason) => { console.log(`WebSocket disconnected: ${reason}`); clearAllUserMarkers(); onlineUsersMap.clear(); if (reason === 'io server disconnect') { alert("Disconnected by server."); if(logoutButton) logoutButton.click(); } });
    socket.on('connect_error', (error) => { console.error(`WebSocket connection error: ${error.message}`); if (error.message.includes("Authentication error")) { alert("WebSocket Auth Failed."); if(logoutButton) logoutButton.click(); } else { alert(`Cannot connect to chat server: ${error.message}`); } });
    socket.on('online users list', (usersList) => { console.log('Received online users list:', usersList); usersList.forEach(addUserToMap); });
    socket.on('user connected', (userData) => { console.log('User connected:', userData); addUserToMap(userData); });
    socket.on('user disconnected', ({ userId }) => { console.log('User disconnected:', userId); removeUserFromMap(userId); });
    socket.on('location updated', ({ userId, latitude, longitude }) => { console.log('Location updated:', { userId, latitude, longitude }); updateUserLocationOnMap(userId, latitude, longitude); });
    socket.on('mode updated', ({ userId, mode }) => { console.log('Mode updated:', { userId, mode }); updateUserModeOnMap(userId, mode); });
    socket.on('private message', ({ sender, message, timestamp }) => {
        console.log('Private message received:', { sender, message, timestamp });
        const myUserId = parseInt(localStorage.getItem('loggedInUserId') || '-1');
        if (sender.userId !== myUserId && notificationSound) { notificationSound.play().catch(error => { console.warn("Notification sound playback failed:", error); }); }
        const isChatOpenForSender = chatWindow && chatWindow.style.display !== 'none' && currentChatTarget && currentChatTarget.userId === sender.userId;
        if (isChatOpenForSender) { displayChatMessage(sender, message, false); }
        else { if (sender.userId !== myUserId) { console.log(`Received message from ${sender.username}, opening chat window.`); openChatWindow(sender); setTimeout(() => { if (currentChatTarget && currentChatTarget.userId === sender.userId) { displayChatMessage(sender, message, false); } }, 150); } }
    });
    socket.on('recipient offline', ({ recipientUserId }) => { if (currentChatTarget && currentChatTarget.userId === recipientUserId) { addSystemMessageToChat(`${currentChatTarget.username} is currently offline.`); } });
    socket.on('chat history response', ({ otherUserId, messages }) => { console.log(`Received history for chat with ${otherUserId}`, messages); if (currentChatTarget && currentChatTarget.userId === otherUserId && chatMessagesDiv) { const loadingMsg = chatMessagesDiv.querySelector('.system-message'); if (loadingMsg && loadingMsg.textContent.includes('Loading')) { loadingMsg.remove(); } if (messages && messages.length > 0) { messages.forEach(msg => { const myUserId = parseInt(localStorage.getItem('loggedInUserId') || '-1'); const isSentByMe = msg.sender.userId === myUserId; displayChatMessage(msg.sender, msg.message, isSentByMe); }); } else { addSystemMessageToChat("No previous messages found."); } chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight; } });
    socket.on('history error', ({ otherUserId, error }) => { if (currentChatTarget && currentChatTarget.userId === otherUserId) { addSystemMessageToChat(`Error loading history: ${error}`); } });
    socket.on('open chat window', ({ initiator }) => { console.log(`Received request to open chat from ${initiator.username} (ID: ${initiator.userId})`); openChatWindow(initiator); });
    socket.on('system message', ({ message }) => { alert(message); });
}

function disconnectWebSocket() { if (socket) { console.log("Disconnecting WebSocket..."); socket.disconnect(); socket = null; } }
function openChatWindow(targetUser) { if (!chatWindow || !chatHeaderUsername || !chatMessagesDiv || !socket) return; console.log("Opening chat with:", targetUser); currentChatTarget = targetUser; const isOnline = onlineUsersMap.has(targetUser.userId); chatHeaderUsername.textContent = `Chat with ${targetUser.username} (${isOnline ? 'Online' : 'Offline'})`; chatMessagesDiv.innerHTML = ''; addSystemMessageToChat("Loading history..."); socket.emit('request chat history', { otherUserId: targetUser.userId }); chatWindow.style.display = 'flex'; if(chatMessageInput) chatMessageInput.focus(); }
function closeChatWindow() { if (!chatWindow) return; chatWindow.style.display = 'none'; if (emojiPicker) emojiPicker.style.display = 'none'; currentChatTarget = null; console.log("Chat window closed."); }
function displayChatMessage(sender, message, isSentByMe) { if (!chatMessagesDiv) return; const msgDiv = document.createElement('div'); msgDiv.style.marginBottom = '5px'; msgDiv.style.padding = '4px 8px'; msgDiv.style.borderRadius = '4px'; msgDiv.style.maxWidth = '80%'; msgDiv.style.wordWrap = 'break-word'; if (isSentByMe) { msgDiv.textContent = `You: ${message}`; msgDiv.style.backgroundColor = '#0056b3'; msgDiv.style.marginLeft = 'auto'; msgDiv.style.textAlign = 'right'; } else { msgDiv.textContent = `${sender.username}: ${message}`; msgDiv.style.backgroundColor = '#555'; msgDiv.style.marginRight = 'auto'; } chatMessagesDiv.appendChild(msgDiv); chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight; }
function addSystemMessageToChat(message) { if (!chatMessagesDiv) return; const msgDiv = document.createElement('div'); msgDiv.textContent = message; msgDiv.classList.add('system-message'); msgDiv.style.fontStyle = 'italic'; msgDiv.style.color = '#aaa'; msgDiv.style.textAlign = 'center'; msgDiv.style.fontSize = '0.8em'; msgDiv.style.margin = '5px 0'; chatMessagesDiv.appendChild(msgDiv); chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight; }

// Chat UI Listeners
if (closeChatBtn) { closeChatBtn.addEventListener('click', closeChatWindow); }
if (sendChatBtn) { sendChatBtn.addEventListener('click', sendChatMessage); }
if (chatMessageInput) { chatMessageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }); }
function sendChatMessage() { if (!socket || !socket.connected) { alert("Not connected."); return; } if (!currentChatTarget) { alert("No chat selected."); return; } if (!chatMessageInput) return; const message = chatMessageInput.value.trim(); if (message === '') return; socket.emit('private message', { recipientUserId: currentChatTarget.userId, message: message }); const myUsername = localStorage.getItem('loggedInUser') || 'Me'; const myUserId = parseInt(localStorage.getItem('loggedInUserId') || '-1'); displayChatMessage({ userId: myUserId, username: myUsername }, message, true); chatMessageInput.value = ''; chatMessageInput.focus(); }

// Emoji Picker Listeners
if (emojiBtn && emojiPicker && chatMessageInput) {
    emojiBtn.addEventListener('click', (e) => { e.stopPropagation(); emojiPicker.style.display = emojiPicker.style.display === 'block' ? 'none' : 'block'; });
    emojiPicker.addEventListener('emoji-click', (event) => { const emoji = event.detail.unicode; const start = chatMessageInput.selectionStart; const end = chatMessageInput.selectionEnd; chatMessageInput.value = chatMessageInput.value.substring(0, start) + emoji + chatMessageInput.value.substring(end); chatMessageInput.selectionStart = chatMessageInput.selectionEnd = start + emoji.length; chatMessageInput.focus(); });
    document.addEventListener('click', (e) => { if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) { emojiPicker.style.display = 'none'; } });
} else { console.error("Emoji button, picker, or chat input not found!"); }


// === MAP LOGIC ===
function initializeMapAndMarkers() { if (map) { return; } console.log("Initializing map..."); map = L.map('map').setView([16.30697, 80.43635], 10); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map); map.on('popupopen', function(e) { const meetptButton = e.popup._contentNode.querySelector('.select-button'); if (meetptButton) { meetptButton.onclick = function() { const targetUserId = parseInt(this.getAttribute('data-user-id')); handleMeetptSelect(targetUserId); if (e.popup) e.popup.remove(); }; } const chatButton = e.popup._contentNode.querySelector('.chat-button'); if (chatButton) { chatButton.onclick = function() { const targetUserId = parseInt(this.getAttribute('data-chat-userid')); const targetUsername = this.getAttribute('data-chat-username'); if (targetUserId && targetUsername) { openChatWindow({ userId: targetUserId, username: targetUsername }); if (socket && socket.connected) { socket.emit('request chat open', { targetUserId: targetUserId }); } else { alert("Cannot request chat: Not connected."); } if (e.popup) e.popup.remove(); } else { console.error("Missing chat user ID or username on button."); } }; } }); setupSidebarListeners(); }
function getIconForMode(mode) { switch (mode) { case 'person': return L.divIcon({ className: 'traveler-icon', html: '👤' }); case 'motorcycle': return L.divIcon({ className: 'traveler-icon', html: '🛵' }); case 'car': return L.divIcon({ className: 'traveler-icon', html: '🚗' }); default: return L.divIcon({ className: 'traveler-icon', html: '❓' }); } }
function addUserToMap(userData) { if (!map) return; const myUserId = parseInt(localStorage.getItem('loggedInUserId') || '-1'); const isSelf = userData.userId === myUserId; let existingData = onlineUsersMap.get(userData.userId); if (existingData) { existingData.username = userData.username; existingData.role = userData.role; existingData.mode = userData.mode ?? existingData.mode ?? 'person'; existingData.latitude = userData.latitude ?? existingData.latitude; existingData.longitude = userData.longitude ?? existingData.longitude; } else { onlineUsersMap.set(userData.userId, { ...userData, mode: userData.mode ?? 'person', marker: null }); existingData = onlineUsersMap.get(userData.userId); console.log("Added user data to map state:", existingData); } const shouldShowMarker = !(isSelf && ghostModeOn); const hasLocation = existingData.latitude != null && existingData.longitude != null; if (shouldShowMarker && hasLocation) { const currentLatLng = L.latLng(existingData.latitude, existingData.longitude); const icon = getIconForMode(existingData.mode); if (existingData.marker) { existingData.marker.setLatLng(currentLatLng); existingData.marker.setIcon(icon); updateMarkerPopup(existingData.marker, existingData); console.log(`Updated marker for ${existingData.username}`); } else { existingData.marker = L.marker(currentLatLng, { icon: icon }).addTo(map); updateMarkerPopup(existingData.marker, existingData); console.log(`Created marker for ${existingData.username}`); } } else { if (existingData.marker) { map.removeLayer(existingData.marker); existingData.marker = null; console.log(`Removed marker for ${existingData.username} (ghost or no location).`); } } }
function removeUserFromMap(userId) { if (onlineUsersMap.has(userId)) { const userData = onlineUsersMap.get(userId); if (userData.marker) { map.removeLayer(userData.marker); } onlineUsersMap.delete(userId); console.log(`Removed user ${userId} from map.`); if (userId === currentlyMeetingWithId) { clearMeetpoint(); } } }
function updateUserLocationOnMap(userId, latitude, longitude) { if (!map) return; if (onlineUsersMap.has(userId)) { const userData = onlineUsersMap.get(userId); userData.latitude = latitude; userData.longitude = longitude; addUserToMap(userData); } else { console.warn(`Location update for unknown user ID: ${userId}`); } }
function updateUserModeOnMap(userId, mode) { if (onlineUsersMap.has(userId)) { const userData = onlineUsersMap.get(userId); userData.mode = mode; addUserToMap(userData); } else { console.warn(`Mode update for unknown user ID: ${userId}`); } }
function clearAllUserMarkers() { if(map) { for (let [userId, userData] of onlineUsersMap.entries()) { if (userData.marker) { map.removeLayer(userData.marker); } } } onlineUsersMap.clear(); console.log("Cleared all user markers."); }
function updateMarkerPopup(marker, userData) { if (!marker || !userData) return; const loggedInUserId = parseInt(localStorage.getItem('loggedInUserId') || '-1'); const isSelf = userData.userId === loggedInUserId; let basePopupContent = `<b>${userData.username}${isSelf ? ' (You)' : ''}</b>`; let actionButtonsHtml = ''; const isLoggedIn = !!localStorage.getItem('authToken'); const isTargetOnline = onlineUsersMap.has(userData.userId); if (!isSelf && isLoggedIn) { if (locationActive && userData.latitude != null) { actionButtonsHtml += `<button class="select-button" data-user-id="${userData.userId}" title="Calculate Meetpoint">Meetpt</button>`; } actionButtonsHtml += `<button class="chat-button" data-chat-userid="${userData.userId}" data-chat-username="${userData.username}" title="${isTargetOnline ? 'Chat with ' + userData.username : userData.username + ' is offline'}" ${!isTargetOnline ? 'disabled' : ''}>Chat</button>`; } let finalPopupContent = basePopupContent + (actionButtonsHtml ? `<br>${actionButtonsHtml}` : ''); if (currentlyMeetingWithId && (userData.userId === currentlyMeetingWithId || isSelf)) { if (meetpointMarker) { const meetpointPopupContent = meetpointMarker.getPopup() ? meetpointMarker.getPopup().getContent() : null; if (meetpointPopupContent) { finalPopupContent += `<br>${meetpointPopupContent}`; } } } if (marker.getPopup()) { marker.setPopupContent(finalPopupContent); } else { marker.bindPopup(finalPopupContent); } }
function setupSidebarListeners() { if (ghostModeCheckbox && ghostModeStatus) { ghostModeCheckbox.addEventListener('change', function () { ghostModeOn = this.checked; ghostModeStatus.textContent = ghostModeOn ? 'On' : 'Off'; const myId = parseInt(localStorage.getItem('loggedInUserId') || '-1'); updateUserLocationOnMap(myId, userLocation.latitude, userLocation.longitude); if (ghostModeOn && meetpointMarker) clearMeetpoint(); }); ghostModeOn = ghostModeCheckbox.checked; ghostModeStatus.textContent = ghostModeOn ? 'On' : 'Off'; } if (nicknameInput) { /* Readonly */ } if (myLocationButton && myLocationStatus) { myLocationButton.addEventListener('change', function () { const myId = parseInt(localStorage.getItem('loggedInUserId') || '-1'); if (this.checked) { myLocationStatus.textContent = 'Requesting...'; if (navigator.geolocation) { navigator.geolocation.getCurrentPosition( (position) => { locationActive = true; myLocationStatus.textContent = 'On'; userLocation.latitude = position.coords.latitude; userLocation.longitude = position.coords.longitude; if (socket && socket.connected) { socket.emit('update location', { latitude: userLocation.latitude, longitude: userLocation.longitude }); } updateUserLocationOnMap(myId, userLocation.latitude, userLocation.longitude); map.setView([userLocation.latitude, userLocation.longitude], map.getZoom() > 13 ? map.getZoom() : 15); if (currentlyMeetingWithId) handleMeetptSelect(currentlyMeetingWithId); }, (error) => { locationActive = false; userLocation = { latitude: null, longitude: null }; alert("Could not get location: " + error.message); myLocationButton.checked = false; myLocationStatus.textContent = 'Off'; if (socket && socket.connected) socket.emit('update location', { latitude: null, longitude: null }); updateUserLocationOnMap(myId, null, null); clearMeetpoint(); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 } ); } else { alert("Geolocation is not supported."); myLocationButton.checked = false; myLocationStatus.textContent = 'Off'; locationActive = false; userLocation = { latitude: null, longitude: null }; clearMeetpoint(); } } else { myLocationStatus.textContent = 'Off'; locationActive = false; userLocation = { latitude: null, longitude: null }; if (socket && socket.connected) socket.emit('update location', { latitude: null, longitude: null }); updateUserLocationOnMap(myId, null, null); clearMeetpoint(); } }); } if (modeSelector) { modeSelector.addEventListener('change', function () { const selectedMode = this.value; const myId = parseInt(localStorage.getItem('loggedInUserId') || '-1'); updateUserModeOnMap(myId, selectedMode); if (socket && socket.connected) { socket.emit('update mode', { mode: selectedMode }); } }); } }
window.clearMeetpoint = function() { if (meetpointMarker) { map.removeLayer(meetpointMarker); meetpointMarker = null; } const oldMeetingWithId = currentlyMeetingWithId; currentlyMeetingWithId = null; const myId = parseInt(localStorage.getItem('loggedInUserId') || -1); if(onlineUsersMap.has(myId) && onlineUsersMap.get(myId).marker) updateMarkerPopup(onlineUsersMap.get(myId).marker, onlineUsersMap.get(myId)); if (oldMeetingWithId && onlineUsersMap.has(oldMeetingWithId) && onlineUsersMap.get(oldMeetingWithId).marker) { updateMarkerPopup(onlineUsersMap.get(oldMeetingWithId).marker, onlineUsersMap.get(oldMeetingWithId)); } }
window.handleMeetptSelect = async function(targetUserId) { const myUserId = parseInt(localStorage.getItem('loggedInUserId') || '-1'); const userTraveler = onlineUsersMap.get(myUserId); const targetTraveler = onlineUsersMap.get(targetUserId); const isLoggedIn = !!localStorage.getItem('authToken'); if (!isLoggedIn) { alert("Please log in."); return; } if (!userTraveler || !targetTraveler) { console.error("Cannot find user data for meetpoint."); return; } if (!locationActive || userTraveler.latitude == null || userTraveler.longitude == null ) { alert("Your location is not active."); return; } if (targetTraveler.latitude == null || targetTraveler.longitude == null) { alert(`${targetTraveler.username}'s location is not available.`); return; } const previousMeetingId = currentlyMeetingWithId; clearMeetpoint(); let meetPointCoords = calculateMeetPoint(userTraveler, targetTraveler); if (!meetPointCoords) { console.error("Failed to calculate meetpoint coordinates."); return; } let distanceToMeetpointStr = null; if (locationActive && meetPointCoords && userLocation.latitude && userLocation.longitude) { const distanceKm = calculateDistance(userLocation.latitude, userLocation.longitude, meetPointCoords.latitude, meetPointCoords.longitude); distanceToMeetpointStr = `${distanceKm.toFixed(2)} km`; } meetpointMarker = L.marker([meetPointCoords.latitude, meetPointCoords.longitude], { icon: L.divIcon({ className: 'meetpoint-icon', html: '⏳', iconSize: [30, 30] }) }).addTo(map).bindPopup(`Calculating name...`).openPopup(); try { const placeName = await getPlaceNameFromCoords(meetPointCoords.latitude, meetPointCoords.longitude); currentlyMeetingWithId = targetUserId; const finalPopupContent = `Meetpoint: ${placeName}`; if (meetpointMarker) { meetpointMarker.setIcon(L.divIcon({ className: 'meetpoint-icon', html: '📍', iconSize: [30, 30] })); meetpointMarker.setPopupContent(finalPopupContent); } if (userTraveler.marker) updateMarkerPopup(userTraveler.marker, userTraveler); if (targetTraveler.marker) updateMarkerPopup(targetTraveler.marker, targetTraveler); if (previousMeetingId && previousMeetingId !== targetUserId && onlineUsersMap.has(previousMeetingId)) { const prevMetUserData = onlineUsersMap.get(previousMeetingId); if (prevMetUserData.marker) updateMarkerPopup(prevMetUserData.marker, prevMetUserData); } console.log(`Showing meetpoint between ${userTraveler.username} and ${targetTraveler.username} at ${placeName}. Distance: ${distanceToMeetpointStr || 'N/A'}`); } catch (error) { if (meetpointMarker) { meetpointMarker.setIcon(L.divIcon({ className: 'meetpoint-icon', html: '❓', iconSize: [30, 30] })); meetpointMarker.setPopupContent(`Meetpoint: Coords ${meetPointCoords.latitude.toFixed(2)}, ${meetPointCoords.longitude.toFixed(2)} (Name lookup failed)`); } currentlyMeetingWithId = null; if (userTraveler.marker) updateMarkerPopup(userTraveler.marker, userTraveler); if (targetTraveler.marker) updateMarkerPopup(targetTraveler.marker, targetTraveler); } }
// Utility Functions
window.calculateDistance = function(lat1, lon1, lat2, lon2) { const R = 6371; const dLat = deg2rad(lat2 - lat1); const dLon = deg2rad(lon2 - lon1); const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c; }
window.deg2rad = function(deg) { return deg * (Math.PI / 180); }
window.getLatLonFromDestination = function(destination) { const destinations = { 'Vijayawada': { latitude: 16.50617, longitude: 80.64801 }, 'Amaravati': { latitude: 16.5000, longitude: 80.5800 }, 'Machilipatnam': { latitude: 16.1667, longitude: 81.1333 }, 'Tenali': { latitude: 16.2491, longitude: 80.6437 }, 'Guntur': { latitude: 16.30697, longitude: 80.43635 } }; return destinations[destination] || null; }
window.calculateMeetPoint = function(user1Data, user2Data) { if (!user1Data || !user2Data || user1Data.latitude == null || user1Data.longitude == null || user2Data.latitude == null || user2Data.longitude == null) return null; const midLat = (user1Data.latitude + user2Data.latitude) / 2; const midLon = (user1Data.longitude + user2Data.longitude) / 2; return { latitude: midLat, longitude: midLon }; }
window.getPlaceNameFromCoords = async function(latitude, longitude) { const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=en`; try { const response = await fetch(url); if (!response.ok) throw new Error(`Nominatim status: ${response.status}`); const data = await response.json(); let name = data.display_name || 'Unknown Location'; if (data.address) { name = data.address.road || data.address.suburb || data.address.village || data.address.town || data.address.city || name; if ((name === data.address.road || name === data.address.suburb) && data.address.country) name += `, ${data.address.country}`; } console.log(`Reverse geocoded (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) to: ${name}`); return name; } catch (error) { console.error("Reverse geocoding error:", error); return `Coords: ${latitude.toFixed(3)}, ${longitude.toFixed(3)}`; } }

// === SCRIPT EXECUTION START ===
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing Map and Auth State.");
    // Initialize Notification Sound - Provide path to your sound file
    try {
       // ** IMPORTANT: You need to have a sound file (e.g., notification.mp3)
       // ** in your 'public/sounds' folder for this to work!
       notificationSound = new Audio('/sounds/notification.mp3'); // Create path like this
       notificationSound.load(); // Preload the sound
       console.log("Notification sound object created.");
       // Try to unlock audio playback on first user interaction
       document.body.addEventListener('click', () => {
           if (notificationSound && notificationSound.paused) {
               console.log("Attempting to unlock audio context...");
               notificationSound.play().then(() => {
                   notificationSound.pause(); // Immediately pause after unlocking
                   notificationSound.currentTime = 0;
                   console.log("Audio context likely unlocked.");
               }).catch(e => {
                   // This might fail if user hasn't interacted yet, that's okay.
                   // console.warn("Audio unlock failed (may need interaction):", e);
               });
           }
       }, { once: true }); // Only run this unlock attempt once
    } catch (e) {
        console.error("Could not create notification sound object:", e);
        notificationSound = null; // Ensure it's null if creation failed
    }

    initializeMapAndMarkers(); // Init map
    updateLoginState();        // Check login (connects socket)
    if (localStorage.getItem('authToken')) {
        fetchUserDetails(); // Verify token
    }
});

// --- END OF public/script.js ---