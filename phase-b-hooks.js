// Phase B: minimal server hooks for typing and read receipts
// This file augments existing server.js socket handlers; if you prefer,
// these can be inlined into server.js. Kept separate for clarity.

module.exports = function attachPhaseB(io) {
  io.on('connection', (socket) => {
    // Typing indicators (non-persistent)
    socket.on('typing:start', ({ toUserId }) => {
      if (!toUserId) return;
      socket.to(getRoomForUser(toUserId)).emit('typing:started', { fromUserId: socket.user.userId });
    });
    socket.on('typing:stop', ({ toUserId }) => {
      if (!toUserId) return;
      socket.to(getRoomForUser(toUserId)).emit('typing:stopped', { fromUserId: socket.user.userId });
    });

    // Read receipts (client also emits messages read via existing handler)
    socket.on('messages read', ({ messageIds, fromUserId, toUserId }) => {
      if (!Array.isArray(messageIds) || !toUserId) return;
      socket.to(getRoomForUser(toUserId)).emit('message read', { messageIds, fromUserId });
    });
  });

  // Simple per-user room helper; you might already have one
  function getRoomForUser(userId){
    return `user:${userId}`;
  }
};