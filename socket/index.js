const { Server } = require("socket.io");
const User = require("../models/User");
const Message = require("../models/Message");
const fs = require('fs');
const path = require('path');
const ChatRoom = require('../models/ChatRoom');

const generateRoomId = (userIds) => {
  return userIds.map(id => id.toString()).sort().join('-');
};

const createOrGetRoom = async (userIds, isGroup = false) => {
  const roomId = isGroup ? new mongoose.Types.ObjectId() : generateRoomId(userIds);
  let room = await ChatRoom.findById(roomId);
  if (!room) {
    room = await ChatRoom.create({
      _id: roomId,
      members: userIds,
      isGroup,
      name: isGroup ? 'Group Chat' : null,
    });
  }
  return room;
};

module.exports = function (server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  const userSockets = new Map();

  io.on("connection", async (socket) => {
    console.log("Connected:", socket.id);
    const userId = socket.handshake.auth.userId;
    if (userId) {
      socket.join(userId);
      userSockets.set(userId, socket.id);
      await User.findByIdAndUpdate(userId, { isOnline: true });
      io.emit('userStatus', { userId, isOnline: true });
    }

    // 🟢 عند الاتصال
    if (userId) {
      await User.findByIdAndUpdate(userId, { isOnline: true });
      io.emit("userStatus", { userId, isOnline: true });
    }

    socket.on('joinRoom', ({ roomId }) => {
      socket.join(roomId);
    });

    socket.on('typing', ({ to, userId }) => {
      console.log('Typing from', userId, 'to', to);
      const targetSocketId = userSockets.get(to);
      if (targetSocketId) {
        io.to(targetSocketId).emit('typing', { from: userId });
      }
    });

    socket.on('stopTyping', ({ to, userId }) => {
      const targetSocketId = userSockets.get(to);
      if (targetSocketId) {
        io.to(targetSocketId).emit('stopTyping', { from: userId });
      }
    });

    socket.on('sendMessage', async (data) => {
      const { senderId, receiverId, roomId, text, timestamp } = data;
      const isGroup = !!roomId;
      try {
        let room;
        if (isGroup) {
          console.log(isGroup);
          const room = await ChatRoom.findById(roomId.toString());
          console.log(room);
          console.log(roomId);
        } else {
          const userIds = [senderId, receiverId];
          room = await createOrGetRoom(userIds, false);
        }

        const message = await Message.create({
          senderId,
          receiverId,
          roomId: roomId,
          text,
          timestamp: timestamp || new Date(),
          isGroup,
        });

        if (isGroup) {
          socket.to(roomId).emit('receiveMessage', message);
          socket.emit('receiveMessage', message);
        } else {
          io.to(receiverId).emit('receivePrivateMessage', message);
          io.to(senderId).emit('receivePrivateMessage', message);
        }
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Message sending failed.' });
      }
    });

    socket.on('uploadMessage', async ({ metadata, buffer }) => {
      const { senderId, receiverId, roomId, text = '', filename, mimetype } = metadata;
      const isGroup = !!roomId;
      try {
        let room;
        if (isGroup) {
          room = await ChatRoom.findById(roomId);
        } else {
          const userIds = [senderId, receiverId];
          room = await createOrGetRoom(userIds, false);
        }
        const safe = filename.replace(/\s+/g, '_');
        const cleanName = `${Date.now()}-${safe}`;
        const savePath = path.join(__dirname, '../uploads', cleanName);
        fs.writeFileSync(savePath, Buffer.from(buffer));
        const hostUrl = 'http://localhost:5000';
        const fileUrl = `${hostUrl}/uploads/${cleanName}`;
        const fileNameOnly = path.basename(fileUrl);
        const message = await Message.create({
          senderId,
          receiverId,
          roomId: roomId,
          text,
          isGroup,
          fileUrl,
          fileType: mimetype,
          timestamp: new Date(),
          fileName: fileNameOnly,
        });
        console.log('isGroup: ', isGroup);
        if (isGroup) {
          socket.to(roomId).emit('receiveMessage', message);
          socket.emit('receiveMessage', message);
        } else {
          io.to(receiverId).emit('receivePrivateMessage', message);
          io.to(senderId).emit('receivePrivateMessage', message);
        }
      } catch (error) {
        console.error('Error uploading message:', error);
        socket.emit('error', { message: 'File upload failed.' });
      }
    });

    socket.on("messageRead", async ({ messageId, readerId }) => {
      const message = await Message.findByIdAndUpdate(
        messageId,
        { isRead: true, readAt: new Date() },
        { new: true }
      );
      if (message) {
        const targetUserId =
          message.senderId === readerId ? message.receiverId : message.senderId;
        io.emit("messageSeen", {
          messageId: message._id,
          seenBy: readerId,
          readAt: message.readAt,
        });
      }
    });

    socket.on("disconnect", async () => {
      console.log("Disconnected:", socket.id);
      if (userId) {
        const lastSeenTime = new Date();
        await User.findByIdAndUpdate(userId, {
          isOnline: false,
          lastSeen: lastSeenTime,
        });

        io.emit("userStatus", {
          userId,
          isOnline: false,
          lastSeen: lastSeenTime,
        });
      }
    });
  });
};
