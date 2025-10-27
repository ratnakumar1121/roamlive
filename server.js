require('dotenv').config();

const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require("socket.io");
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs');
const { opsMiddleware, errorHandler } = require('./ops');

function validateInput(username, password) { if (!username || typeof username !== 'string' || username.length < 3 || username.length > 50) { return 'Invalid username (must be 3-50 characters).'; } if (!password || typeof password !== 'string' || password.length < 6) { return 'Invalid password (must be at least 6 characters).'; } return null; }

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error("FATAL ERROR: JWT_SECRET is not defined."); process.exit(1); }

const server = http.createServer(app);
const io = new Server(server);

console.log('[DB] Creating connection pool...');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
});
console.log('[DB] Connection pool created.');
pool.on('error', (err, client) => { console.error('[DB Pool Error] Unexpected error on idle client', err); });
pool.connect((err, client, release) => { if (err) { console.error('[DB Connect Error] Error acquiring database client:', err.message); console.error(err.stack); return; } console.log('[DB] Initial connection successful! Client acquired.'); client.query('SELECT NOW()', (queryErr, result) => { release(); if (queryErr) { console.error('[DB] Error executing initial query:', queryErr.stack); } else { console.log('[DB] Database test query successful:', result.rows[0]); } }); });

// Phase A: ops hardening
app.use(opsMiddleware);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, max: 20,
	message: { status: 429, message: 'Too many login/signup attempts, please try again later' },
	standardHeaders: true, legacyHeaders: false,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

function authenticateToken(req, res, next) { const authHeader = req.headers['authorization']; const token = authHeader && authHeader.split(' ')[1]; if (token == null) return res.sendStatus(401); jwt.verify(token, JWT_SECRET, (err, userPayload) => { if (err) { if (err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Token expired.' }); return res.sendStatus(403); } req.user = userPayload; next(); }); }

io.use((socket, next) => { const token = socket.handshake.auth.token; if (!token) { return next(new Error("Authentication error: No token")); } jwt.verify(token, JWT_SECRET, (err, userPayload) => { if (err) { console.log("Socket Auth: Invalid token.", err.message); return next(new Error("Authentication error: Invalid token")); } socket.user = userPayload; console.log(`Socket Auth: User ${socket.user.username} (ID: ${socket.user.userId}) authenticated.`); next(); }); });

const onlineUsers = new Map(); function addUser(socket, userData) { onlineUsers.set(userData.userId, { socketId: socket.id, username: userData.username, role: userData.role, mode: 'person', latitude: null, longitude: null }); const usersList = []; for (let [id, data] of onlineUsers.entries()) { if (id !== userData.userId) { usersList.push({ userId: id, username: data.username, mode: data.mode, latitude: data.latitude, longitude: data.longitude }); } } socket.emit('online users list', usersList); socket.broadcast.emit('user connected', { userId: userData.userId, username: userData.username, mode: 'person', latitude: null, longitude: null }); }
function removeUser(socketId) { let disconnectedUserId = null; for (let [userId, data] of onlineUsers.entries()) { if (data.socketId === socketId) { disconnectedUserId = userId; onlineUsers.delete(userId); break; } } if (disconnectedUserId !== null) { io.emit('user disconnected', { userId: disconnectedUserId }); } }
function getUserSocketId(userId) { const userData = onlineUsers.get(Number(userId)); return userData ? userData.socketId : null; }
function isUserOnline(userId) { return onlineUsers.has(Number(userId)); }

io.on('connection', (socket) => {
    addUser(socket, socket.user);

    const locations = [];
    for (let [userId, data] of onlineUsers.entries()) {
        if (data.latitude != null && data.longitude != null) {
            locations.push({ userId, latitude: data.latitude, longitude: data.longitude });
        }
    }
    if (locations.length > 0) {
        socket.emit('bulk location update', locations);
        io.emit('bulk location update', locations);
    }
    const newUserData = onlineUsers.get(socket.user.userId);
    if (newUserData && newUserData.latitude != null && newUserData.longitude != null) {
        socket.broadcast.emit('location updated', { userId: socket.user.userId, latitude: newUserData.latitude, longitude: newUserData.longitude });
    }

    socket.on('update location', ({ latitude, longitude }) => { const userData = onlineUsers.get(socket.user.userId); if (userData) { userData.latitude = latitude; userData.longitude = longitude; io.emit('location updated', { userId: socket.user.userId, latitude: latitude, longitude: longitude }); } });

    socket.on('disconnect', () => { removeUser(socket.id); });
});

app.post('/api/auth/signup', async (req, res) => { const { username, password } = req.body; const validationError = validateInput(username, password); if (validationError) { return res.status(400).json({ message: validationError }); } let client; try { client = await pool.connect(); const checkUserQuery = 'SELECT id FROM users WHERE username = $1'; const checkResult = await client.query(checkUserQuery, [username]); if (checkResult.rows.length > 0) { return res.status(409).json({ message: 'Username already taken.' }); } const saltRounds = 10; const hashedPassword = await bcrypt.hash(password, saltRounds); const insertUserQuery = 'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, role, created_at'; const insertResult = await client.query(insertUserQuery, [username, hashedPassword]); const newUser = insertResult.rows[0]; res.status(201).json({ message: 'Signup successful!', user: { id: newUser.id, username: newUser.username, role: newUser.role } }); } catch (error) { res.status(500).json({ message: 'Server error during signup.' }); } finally { if (client) client.release(); } });
app.post('/api/auth/login', async (req, res) => { const { username, password } = req.body; if (!username || !password) { return res.status(400).json({ message: 'Username and password are required.' }); } let client; let clientReleased = false; try { client = await pool.connect(); const findResult = await client.query('SELECT id, username, password_hash, role, is_active FROM users WHERE username = $1', [username]); if (findResult.rows.length === 0) { client.release(); clientReleased = true; return res.status(401).json({ message: 'Invalid credentials.' }); } const user = findResult.rows[0]; if (!user.is_active) { client.release(); clientReleased = true; return res.status(403).json({ message: 'Account is inactive.' }); } const isMatch = await bcrypt.compare(password, user.password_hash); if (!isMatch) { client.release(); clientReleased = true; return res.status(401).json({ message: 'Invalid credentials.' }); } const userPayload = { userId: user.id, username: user.username, role: user.role }; const accessToken = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '1h' }); res.status(200).json({ message: 'Login successful!', token: accessToken, user: { id: user.id, username: user.username, role: user.role } }); } catch (error) { if (client && !clientReleased) { try { client.release(); } catch {} clientReleased = true; } res.status(500).json({ message: 'Internal server error during login.' }); } finally { if (client && !clientReleased) { try { client.release(); } catch {} } } });
app.get('/api/auth/me', authenticateToken, async (req, res) => { res.status(200).json({ message: "User authenticated successfully.", user: req.user }); });
app.post('/api/auth/logout', (req, res) => { res.status(200).json({ message: "Logout acknowledged." }); });
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

// Mount health and version under /ops
app.use('/ops', opsMiddleware);

// Centralized error handler (catch-all)
app.use(errorHandler);

server.listen(PORT, () => { console.log(`Server running on http://localhost:${PORT}`); });