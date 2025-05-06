// server.js (Based on user-provided version)
require('dotenv').config();

const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require("socket.io");
const rateLimit = require('express-rate-limit'); // Included in provided code
const multer = require('multer');
const fs = require('fs');

// --- Basic Input Validation Helper ---
function validateInput(username, password) { if (!username || typeof username !== 'string' || username.length < 3 || username.length > 50) { return 'Invalid username (must be 3-50 characters).'; } if (!password || typeof password !== 'string' || password.length < 6) { return 'Invalid password (must be at least 6 characters).'; } return null; }

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error("FATAL ERROR: JWT_SECRET is not defined."); process.exit(1); }

const server = http.createServer(app);
const io = new Server(server);

// --- Database Connection Pool ---
console.log('[DB] Creating connection pool...');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
});
console.log('[DB] Connection pool created.');
pool.on('error', (err, client) => { console.error('[DB Pool Error] Unexpected error on idle client', err); });
console.log('[DB] Pool error listener attached.');
pool.connect((err, client, release) => { if (err) { console.error('[DB Connect Error] Error acquiring database client:', err.message); console.error(err.stack); return; } console.log('[DB] Initial connection successful! Client acquired.'); client.query('SELECT NOW()', (queryErr, result) => { release(); console.log('[DB] Initial connection client released.'); if (queryErr) { console.error('[DB] Error executing initial query:', queryErr.stack); } else { console.log('[DB] Database test query successful:', result.rows[0]); } }); });
console.log('[DB] pool.connect() called (async).');

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Rate Limiter ---
const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, max: 20,
	message: { status: 429, message: 'Too many login/signup attempts, please try again later' },
	standardHeaders: true, legacyHeaders: false,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

// --- Auth Middleware (HTTP) ---
function authenticateToken(req, res, next) { const authHeader = req.headers['authorization']; const token = authHeader && authHeader.split(' ')[1]; if (token == null) return res.sendStatus(401); jwt.verify(token, JWT_SECRET, (err, userPayload) => { if (err) { if (err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Token expired.' }); return res.sendStatus(403); } req.user = userPayload; next(); }); }

// --- Socket.IO Auth Middleware ---
io.use((socket, next) => { const token = socket.handshake.auth.token; if (!token) { return next(new Error("Authentication error: No token")); } jwt.verify(token, JWT_SECRET, (err, userPayload) => { if (err) { console.log("Socket Auth: Invalid token.", err.message); return next(new Error("Authentication error: Invalid token")); } socket.user = userPayload; console.log(`Socket Auth: User ${socket.user.username} (ID: ${socket.user.userId}) authenticated.`); next(); }); });

// === USER STATE TRACKING ===
const onlineUsers = new Map(); function addUser(socket, userData) { onlineUsers.set(userData.userId, { socketId: socket.id, username: userData.username, role: userData.role, mode: 'person', latitude: null, longitude: null }); console.log(`User ${userData.username} (ID: ${userData.userId}) connected. Online: ${onlineUsers.size}`); const usersList = []; for (let [id, data] of onlineUsers.entries()) { if (id !== userData.userId) { usersList.push({ userId: id, username: data.username, mode: data.mode, latitude: data.latitude, longitude: data.longitude }); } } socket.emit('online users list', usersList); socket.broadcast.emit('user connected', { userId: userData.userId, username: userData.username, mode: 'person', latitude: null, longitude: null }); }
function removeUser(socketId) { let disconnectedUserId = null; for (let [userId, data] of onlineUsers.entries()) { if (data.socketId === socketId) { disconnectedUserId = userId; onlineUsers.delete(userId); console.log(`User ${userId} disconnected. Online: ${onlineUsers.size}`); break; } } if (disconnectedUserId !== null) { io.emit('user disconnected', { userId: disconnectedUserId }); } }
function getUserSocketId(userId) { const userData = onlineUsers.get(Number(userId)); return userData ? userData.socketId : null; }
function isUserOnline(userId) { return onlineUsers.has(Number(userId)); }

// === SOCKET.IO CONNECTION HANDLING ===
io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}, User: ${socket.user.username}`);
    addUser(socket, socket.user);

    // Gather all online users' locations
    const locations = [];
    for (let [userId, data] of onlineUsers.entries()) {
        if (data.latitude != null && data.longitude != null) {
            locations.push({ userId, latitude: data.latitude, longitude: data.longitude });
        }
    }
    if (locations.length > 0) {
        // Send to the new user
        socket.emit('bulk location update', locations);
        // Also broadcast to all users (including the new user) to ensure everyone is in sync
        io.emit('bulk location update', locations);
        console.log(`[SERVER] Broadcasted all online users' locations to everyone.`);
    }
    // Also send the new user's location to all other users (if available)
    const newUserData = onlineUsers.get(socket.user.userId);
    if (newUserData && newUserData.latitude != null && newUserData.longitude != null) {
        socket.broadcast.emit('location updated', {
            userId: socket.user.userId,
            latitude: newUserData.latitude,
            longitude: newUserData.longitude
        });
        console.log(`[SERVER] Broadcasted new user's location to all others: userId=${socket.user.userId}`);
    }

    socket.on('update location', ({ latitude, longitude }) => { 
        const userData = onlineUsers.get(socket.user.userId); 
        if (userData) { 
            userData.latitude = latitude; 
            userData.longitude = longitude; 
            console.log(`[SERVER] User ${socket.user.username} (ID: ${socket.user.userId}) updated location: ${latitude}, ${longitude}`); 
            io.emit('location updated', { userId: socket.user.userId, latitude: latitude, longitude: longitude }); 
            console.log(`[SERVER] Emitted location updated for user ${socket.user.userId} to all clients.`);
        } else {
            console.log(`[SERVER] update location: No userData for userId ${socket.user.userId}`);
        }
    });
    socket.on('update mode', ({ mode }) => { const userData = onlineUsers.get(socket.user.userId); if (userData) { userData.mode = mode; console.log(`User ${socket.user.username} updated mode: ${mode}`); socket.broadcast.emit('mode updated', { userId: socket.user.userId, mode: mode }); } });
    socket.on('private message', async ({ recipientUserId, message }) => { const sender = socket.user; console.log(`Msg from ${sender.username} (ID: ${sender.userId}) to user ID ${recipientUserId}: ${message}`); let savedMessage; let client; try { client = await pool.connect(); const insertQuery = `INSERT INTO chat_messages (sender_id, recipient_id, message_content) VALUES ($1, $2, $3) RETURNING id, sender_id, recipient_id, message_content, created_at`; const result = await client.query(insertQuery, [sender.userId, recipientUserId, message]); savedMessage = result.rows[0]; console.log(`Message saved to DB (ID: ${savedMessage.id})`); } catch (error) { console.error("Error saving chat message to DB:", error); socket.emit('message error', { error: "Failed to save message." }); if (client) client.release(); return; } finally { if (client) client.release(); } const recipientSocketId = getUserSocketId(recipientUserId); if (recipientSocketId) { io.to(recipientSocketId).emit('private message', { sender: { userId: sender.userId, username: sender.username }, message: savedMessage.message_content, timestamp: savedMessage.created_at }); console.log(`Message forwarded to socket ${recipientSocketId}`); } else { console.log(`Recipient user ID ${recipientUserId} is not online.`); socket.emit('recipient offline', { recipientUserId }); } });
    socket.on('request chat history', async ({ otherUserId }) => {
        const userId = socket.user.userId;
        let client;
        try {
            client = await pool.connect();
            const result = await client.query(`
                SELECT m.id, m.message_content, m.created_at, u.id as sender_id, u.username as sender_username
                FROM chat_messages m
                JOIN users u ON m.sender_id = u.id
                WHERE (m.sender_id = $1 AND m.recipient_id = $2)
                   OR (m.sender_id = $2 AND m.recipient_id = $1)
                ORDER BY m.created_at DESC
                LIMIT 5
            `, [userId, otherUserId]);
            const messages = result.rows.map(row => ({
                id: row.id,
                sender: { userId: row.sender_id, username: row.sender_username },
                message: row.message_content,
                timestamp: row.created_at
            }));
            socket.emit('chat history response', { otherUserId, messages });
        } catch (error) {
            console.error('Error fetching chat history:', error);
            socket.emit('history error', { otherUserId, error: 'Failed to load chat history' });
        } finally {
            if (client) client.release();
        }
    });
    socket.on('request chat open', ({ targetUserId }) => { const sender = socket.user; console.log(`User ${sender.username} (ID: ${sender.userId}) requests to open chat with User ID ${targetUserId}`); const recipientSocketId = getUserSocketId(targetUserId); if (recipientSocketId) { io.to(recipientSocketId).emit('open chat window', { initiator: { userId: sender.userId, username: sender.username } }); console.log(`Sent 'open chat window' request to socket ${recipientSocketId}`); } else { console.log(`Cannot send chat open request: User ID ${targetUserId} is offline.`); socket.emit('system message', { message: `User is currently offline.` }); } });
    socket.on('disconnect', (reason) => { console.log(`Socket disconnected: ${socket.id}, User: ${socket.user?.username}, Reason: ${reason}`); removeUser(socket.id); });
    socket.on('error', (error) => { console.error(`Socket error for ${socket.id} (User: ${socket.user?.username}):`, error); });

    // --- New Features ---
    // Handle group chat messages
    socket.on('group message', async ({ groupId, message }) => {
        const sender = socket.user;
        console.log(`Group message from ${sender.username} in group ${groupId}: ${message}`);
        let client;
        try {
            client = await pool.connect();
            const result = await client.query(
                'INSERT INTO group_messages (group_id, sender_id, message_content) VALUES ($1, $2, $3) RETURNING id',
                [groupId, sender.userId, message]
            );
            const messageId = result.rows[0].id;
            const groupMembers = await client.query(
                'SELECT user_id FROM group_members WHERE group_id = $1',
                [groupId]
            );
            groupMembers.rows.forEach(member => {
                const memberSocketId = getUserSocketId(member.user_id);
                if (memberSocketId) {
                    io.to(memberSocketId).emit('group message', {
                        groupId,
                        sender: { userId: sender.userId, username: sender.username },
                        message,
                        messageId
                    });
                }
            });
        } catch (error) {
            console.error('Error handling group message:', error);
            socket.emit('message error', { error: 'Failed to send group message' });
        } finally {
            if (client) client.release();
        }
    });
    // Handle message reactions
    socket.on('update message reaction', async ({ messageId, reaction, add }) => {
        const userId = socket.user.userId;
        let client;
        try {
            client = await pool.connect();
            if (add) {
                await client.query(
                    'INSERT INTO message_reactions (message_id, user_id, reaction) VALUES ($1, $2, $3)',
                    [messageId, userId, reaction]
                );
            } else {
                await client.query(
                    'DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND reaction = $3',
                    [messageId, userId, reaction]
                );
            }
            // Get all reactions for this message
            const result = await client.query(
                'SELECT reaction, COUNT(*) as count FROM message_reactions WHERE message_id = $1 GROUP BY reaction',
                [messageId]
            );
            // Broadcast updated reactions to all users who might be viewing the message
            io.emit('message reaction updated', {
                messageId,
                reactions: result.rows
            });
        } catch (error) {
            console.error('Error updating message reaction:', error);
        } finally {
            if (client) client.release();
        }
    });
    // Handle pinned messages
    socket.on('update pinned message', async ({ messageId, pin }) => {
        const userId = socket.user.userId;
        let client;
        try {
            client = await pool.connect();
            if (pin) {
                await client.query(
                    'INSERT INTO pinned_messages (message_id, user_id) VALUES ($1, $2)',
                    [messageId, userId]
                );
            } else {
                await client.query(
                    'DELETE FROM pinned_messages WHERE message_id = $1 AND user_id = $2',
                    [messageId, userId]
                );
            }
            // Broadcast pin status to all users who might be viewing the message
            io.emit('pinned message updated', {
                messageId,
                pin,
                userId
            });
        } catch (error) {
            console.error('Error updating pinned message:', error);
        } finally {
            if (client) client.release();
        }
    });
    // Handle group chat history requests
    socket.on('request group chat history', async ({ groupId }) => {
        const userId = socket.user.userId;
        let client;
        try {
            client = await pool.connect();
            // Verify user is member of group
            const memberCheck = await client.query(
                'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
                [groupId, userId]
            );
            if (memberCheck.rows.length === 0) {
                socket.emit('history error', { error: 'Not a member of this group' });
                return;
            }
            const result = await client.query(`
                SELECT m.id, m.message_content, m.created_at, u.id as sender_id, u.username as sender_username
                FROM group_messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.group_id = $1
                ORDER BY m.created_at DESC
                LIMIT 50
            `, [groupId]);
            const messages = result.rows.map(row => ({
                id: row.id,
                sender: { userId: row.sender_id, username: row.sender_username },
                message: row.message_content,
                timestamp: row.created_at
            }));
            socket.emit('group chat history response', { groupId, messages });
        } catch (error) {
            console.error('Error fetching group chat history:', error);
            socket.emit('history error', { error: 'Failed to load group chat history' });
        } finally {
            if (client) client.release();
        }
    });
    // Add inside io.on('connection', (socket) => { ... })
    socket.on('request conversations', async () => {
        const userId = socket.user.userId;
        let client;
        try {
            client = await pool.connect();
            // Get all unique partner user IDs
            const result = await client.query(`
                SELECT DISTINCT
                    CASE
                        WHEN sender_id = $1 THEN recipient_id
                        ELSE sender_id
                    END AS partner_id
                FROM chat_messages
                WHERE sender_id = $1 OR recipient_id = $1
            `, [userId]);

            // Fetch usernames for all partners
            const partnerIds = result.rows.map(row => row.partner_id);
            let partners = [];
            if (partnerIds.length > 0) {
                const usersResult = await client.query(
                    `SELECT id, username FROM users WHERE id = ANY($1)`,
                    [partnerIds]
                );
                partners = usersResult.rows;
            }

            // Optionally, add online status
            partners = partners.map(p => ({
                userId: p.id,
                username: p.username,
                isOnline: isUserOnline(p.id)
            }));

            socket.emit('conversation list response', partners);
        } catch (error) {
            console.error('Error fetching conversations:', error);
            socket.emit('conversation error', { error: 'Failed to load conversations.' });
        } finally {
            if (client) client.release();
        }
    });

    // Message read receipts
    socket.on('messages read', ({ messageIds, fromUserId, toUserId }) => {
        // Find the recipient's socket
        const recipientSocketId = getUserSocketId(toUserId);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('message read', { messageIds });
        }
    });
});

// === HTTP API Routes ===
app.post('/api/auth/signup', async (req, res) => { const { username, password } = req.body; console.log('[Signup] Attempt:', { username }); const validationError = validateInput(username, password); if (validationError) { return res.status(400).json({ message: validationError }); } let client; try { client = await pool.connect(); const checkUserQuery = 'SELECT id FROM users WHERE username = $1'; const checkResult = await client.query(checkUserQuery, [username]); if (checkResult.rows.length > 0) { return res.status(409).json({ message: 'Username already taken.' }); } const saltRounds = 10; const hashedPassword = await bcrypt.hash(password, saltRounds); const insertUserQuery = 'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, role, created_at'; const insertResult = await client.query(insertUserQuery, [username, hashedPassword]); const newUser = insertResult.rows[0]; console.log('[Signup] New user created:', newUser.username); res.status(201).json({ message: 'Signup successful!', user: { id: newUser.id, username: newUser.username, role: newUser.role } }); } catch (error) { console.error('[Signup] Error:', error); res.status(500).json({ message: 'Server error during signup.' }); } finally { if (client) client.release(); console.log('[Signup] DB Client released after attempt.'); } });
app.post('/api/auth/login', async (req, res) => { const { username, password } = req.body; console.log('[Login] Route hit. Attempt:', { username }); if (!username || !password) { console.log('[Login] Validation Failed: Missing username or password.'); return res.status(400).json({ message: 'Username and password are required.' }); } let client; let clientReleased = false; try { console.log('[Login] Attempting to connect to DB pool...'); client = await pool.connect(); console.log('[Login] DB Client acquired.'); const findUserQuery = 'SELECT id, username, password_hash, role, is_active FROM users WHERE username = $1'; console.log(`[Login] Executing query for user: ${username}`); const findResult = await client.query(findUserQuery, [username]); console.log(`[Login] Query finished. Found rows: ${findResult.rows.length}`); if (findResult.rows.length === 0) { console.log(`[Login] User '${username}' not found.`); client.release(); clientReleased = true; console.log('[Login] DB Client released (user not found).'); return res.status(401).json({ message: 'Invalid credentials.' }); } const user = findResult.rows[0]; if (!user.is_active) { console.log(`[Login] User '${username}' inactive.`); client.release(); clientReleased = true; console.log('[Login] DB Client released (user inactive).'); return res.status(403).json({ message: 'Account is inactive.' }); } console.log(`[Login] Comparing password for user '${username}'...`); const isMatch = await bcrypt.compare(password, user.password_hash); console.log(`[Login] Password comparison result: ${isMatch}`); if (!isMatch) { console.log(`[Login] Password mismatch for user '${username}'.`); client.release(); clientReleased = true; console.log('[Login] DB Client released (password mismatch).'); return res.status(401).json({ message: 'Invalid credentials.' }); } console.log(`[Login] Generating JWT for user '${username}'...`); const userPayload = { userId: user.id, username: user.username, role: user.role }; const accessToken = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '1h' }); console.log(`[Login] JWT generated.`); res.status(200).json({ message: 'Login successful!', token: accessToken, user: { id: user.id, username: user.username, role: user.role } }); console.log(`[Login] Success response sent for '${username}'.`); } catch (error) { console.error('[Login] Caught Error:', error); if (client && !clientReleased) { try { client.release(); } catch (releaseError) { console.error("[Login] Error releasing client after catch:", releaseError); } clientReleased = true; console.log('[Login] DB Client released after error.'); } res.status(500).json({ message: 'Internal server error during login.' }); } finally { if (client && !clientReleased) { try { client.release(); } catch (releaseError) { console.error("[Login] Error releasing client in finally:", releaseError); } console.log('[Login] DB Client released in FINALLY block.'); } else { console.log('[Login] FINALLY block: Client not acquired or already released.'); } } });
app.get('/api/auth/me', authenticateToken, async (req, res) => { console.log(`Accessing /api/auth/me for user: ${req.user.username} (ID: ${req.user.userId})`); res.status(200).json({ message: "User authenticated successfully.", user: req.user }); });
app.post('/api/auth/logout', (req, res) => { console.log("Logout endpoint called (client should clear token)."); res.status(200).json({ message: "Logout acknowledged." }); });
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

// Add these to your existing database tables
const createTables = async () => {
    const client = await pool.connect();
    try {
        // Create groups table
        await client.query(`
            CREATE TABLE IF NOT EXISTS groups (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create group_members table
        await client.query(`
            CREATE TABLE IF NOT EXISTS group_members (
                group_id INTEGER REFERENCES groups(id),
                user_id INTEGER REFERENCES users(id),
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (group_id, user_id)
            )
        `);

        // Create group_messages table
        await client.query(`
            CREATE TABLE IF NOT EXISTS group_messages (
                id SERIAL PRIMARY KEY,
                group_id INTEGER REFERENCES groups(id),
                sender_id INTEGER REFERENCES users(id),
                message_content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create message_reactions table
        await client.query(`
            CREATE TABLE IF NOT EXISTS message_reactions (
                message_id INTEGER REFERENCES chat_messages(id),
                user_id INTEGER REFERENCES users(id),
                reaction VARCHAR(10) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (message_id, user_id, reaction)
            )
        `);

        // Create pinned_messages table
        await client.query(`
            CREATE TABLE IF NOT EXISTS pinned_messages (
                message_id INTEGER REFERENCES chat_messages(id),
                user_id INTEGER REFERENCES users(id),
                pinned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (message_id, user_id)
            )
        `);

        // Create uploaded_files table
        await client.query(`
            CREATE TABLE IF NOT EXISTS uploaded_files (
                id SERIAL PRIMARY KEY,
                original_name VARCHAR(255) NOT NULL,
                stored_name VARCHAR(255) NOT NULL,
                file_size INTEGER NOT NULL,
                uploaded_by INTEGER REFERENCES users(id),
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('Database tables created successfully');
    } catch (error) {
        console.error('Error creating tables:', error);
    } finally {
        client.release();
    }
};

// Call createTables when server starts
createTables();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

app.post('/api/upload', authenticateToken, upload.array('files'), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }

    const client = await pool.connect();
    try {
        const files = [];
        for (const file of req.files) {
            const result = await client.query(
                'INSERT INTO uploaded_files (original_name, stored_name, file_size, uploaded_by) VALUES ($1, $2, $3, $4) RETURNING id',
                [file.originalname, file.filename, file.size, req.user.userId]
            );
            files.push({
                id: result.rows[0].id,
                name: file.originalname,
                size: file.size
            });
        }
        res.json({ files });
    } catch (error) {
        console.error('Error saving file metadata:', error);
        res.status(500).json({ error: 'Error saving file metadata' });
    } finally {
        client.release();
    }
});

// --- Start Server ---
server.listen(PORT, () => { console.log(`Server running on http://localhost:${PORT}`); });