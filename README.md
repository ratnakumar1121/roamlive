# RoamLive 🗺️💬

[![PWA Ready](https://img.shields.io/badge/PWA-Ready-green.svg)](https://web.dev/progressive-web-apps/)
[![WebSocket](https://img.shields.io/badge/WebSocket-Real--time-blue.svg)](https://socket.io/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**RoamLive** is a cutting-edge location-based real-time chat application that allows users to connect, communicate, and coordinate based on their geographic proximity. Built as a Progressive Web App (PWA) with modern web technologies.

![RoamLive Demo](https://via.placeholder.com/800x400/1a1a1a/ffffff?text=RoamLive+Demo+Screenshot)

## 🚀 Key Features

### Real-Time Communication
- **Private & Group Chat**: Secure messaging with friends and groups
- **Live Location Sharing**: Share your real-time location with precision controls
- **Ghost Mode**: Go invisible while maintaining chat functionality
- **Message Reactions**: React to messages with emojis
- **Read Receipts**: Know when your messages are seen
- **Message History**: Persistent chat history across sessions

### Location Intelligence
- **Interactive Maps**: Powered by Leaflet.js with multiple map styles
- **Proximity Detection**: Find and connect with nearby users
- **Transport Modes**: Switch between walking, driving, and motorcycle modes
- **Meet Points**: Calculate optimal meeting locations
- **Location Accuracy**: Choose between precise and approximate location sharing

### Modern PWA Experience
- **Offline Support**: Continue chatting even without internet
- **Push Notifications**: Stay connected with real-time alerts
- **Mobile Optimized**: Native app-like experience on all devices
- **Cross-Platform**: Works on iOS, Android, and Desktop

### Security & Privacy
- **JWT Authentication**: Secure token-based authentication
- **Password Encryption**: bcrypt-secured user credentials
- **Rate Limiting**: Protection against spam and abuse
- **Privacy Controls**: Granular location and visibility settings

## 🛠️ Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web application framework
- **Socket.IO** - Real-time communication
- **PostgreSQL** - Database
- **JWT** - Authentication
- **bcrypt** - Password hashing

### Frontend
- **HTML5** - Structure
- **CSS3** - Styling with modern features
- **Vanilla JavaScript** - Client-side logic
- **Leaflet.js** - Interactive maps
- **Service Worker** - PWA functionality

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/ratnakumar1121/roamlive.git
cd roamlive
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://username:password@localhost:5432/roamlive

# Authentication
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=7d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

4. **Set up the database**
```bash
# Create database
psql -c "CREATE DATABASE roamlive;"

# Run migrations (if using migration tool)
npm run migrate
```

5. **Start the development server**
```bash
npm run dev
```

6. **Open your browser**
Navigate to `http://localhost:3000`

## 📱 PWA Installation

### On Mobile (iOS/Android)
1. Open RoamLive in your mobile browser
2. Tap the browser menu (⋮ or share button)
3. Select "Add to Home Screen" or "Install App"
4. Follow the prompts to install

### On Desktop
1. Open RoamLive in Chrome, Edge, or Safari
2. Click the install icon in the address bar
3. Click "Install" in the dialog

## 🗺️ API Documentation

### Authentication Endpoints

```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "john_doe",
  "password": "securePassword123",
  "email": "john@example.com"
}
```

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "john_doe",
  "password": "securePassword123"
}
```

### Real-Time Events (WebSocket)

#### Client → Server
```javascript
// Join a room
socket.emit('join-room', { roomId: 'room123' });

// Send message
socket.emit('send-message', {
  targetId: 'user456',
  message: 'Hello!',
  type: 'private'
});

// Share location
socket.emit('location-update', {
  latitude: 37.7749,
  longitude: -122.4194,
  accuracy: 10
});
```

#### Server → Client
```javascript
// Receive message
socket.on('new-message', (data) => {
  console.log('New message:', data);
});

// User location update
socket.on('user-location-update', (data) => {
  console.log('User moved:', data);
});

// Online users
socket.on('online-users', (users) => {
  console.log('Online users:', users);
});
```

## 🚢 Deployment

### Heroku Deployment

1. **Install Heroku CLI**
```bash
npm install -g heroku
```

2. **Create Heroku app**
```bash
heroku create your-roamlive-app
```

3. **Add PostgreSQL**
```bash
heroku addons:create heroku-postgresql:mini
```

4. **Set environment variables**
```bash
heroku config:set JWT_SECRET=your-production-secret
heroku config:set NODE_ENV=production
```

5. **Deploy**
```bash
git push heroku main
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

```bash
# Build and run
docker build -t roamlive .
docker run -p 3000:3000 --env-file .env roamlive
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Run e2e tests
npm run test:e2e
```

## 🗂️ Project Structure

```
roamlive/
├── public/                 # Frontend assets
│   ├── index.html         # Main HTML file
│   ├── script.js          # Client-side JavaScript
│   ├── styles.css         # CSS styles
│   ├── service-worker.js  # PWA service worker
│   ├── manifest.json      # PWA manifest
│   └── icons/             # PWA icons
├── server.js              # Express server
├── package.json           # Dependencies
├── .env.example           # Environment template
├── .gitignore            # Git ignore rules
└── README.md             # This file
```

## 🔒 Security Features

- **JWT Authentication**: Secure, stateless authentication
- **Password Hashing**: bcrypt with salt rounds
- **Rate Limiting**: Prevent spam and DoS attacks
- **Input Validation**: Sanitize all user inputs
- **HTTPS Enforcement**: Secure data transmission
- **CORS Protection**: Cross-origin request security
- **Ghost Mode**: Privacy-first location sharing

## 🗺️ Roadmap

### Phase 1: Core Enhancements (Next 3 months)
- [ ] Voice messaging with transcription
- [ ] Advanced geofencing
- [ ] Push notifications
- [ ] Message encryption
- [ ] User profiles with avatars

### Phase 2: Advanced Features (3-6 months)
- [ ] Video calling (WebRTC)
- [ ] Group management
- [ ] File sharing
- [ ] Location history
- [ ] Analytics dashboard

### Phase 3: Enterprise (6+ months)
- [ ] Business accounts
- [ ] API for third-party integrations
- [ ] White-label solutions
- [ ] Advanced analytics
- [ ] Multi-language support

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/ratnakumar1121/roamlive/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ratnakumar1121/roamlive/discussions)
- **Email**: ratnakumarmutyala5@gmail.com

## 🙏 Acknowledgments

- [Leaflet.js](https://leafletjs.com/) for mapping functionality
- [Socket.IO](https://socket.io/) for real-time communication
- [DiceBear](https://dicebear.com/) for avatar generation
- [OpenStreetMap](https://www.openstreetmap.org/) for map tiles

---

**Made with ❤️ by [ratnakumar1121](https://github.com/ratnakumar1121)**

*Transform the way people connect through location-based communication.*