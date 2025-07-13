const { Server } = require("socket.io");
const User = require("../models/User");
const Message = require("../models/Message");
const fs = require('fs');
const path = require('path');

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
    console.log(userId);
    if (userId) {
      userSockets.set(userId, socket.id);
    }


    // 🟢 عند الاتصال
    if (userId) {
      await User.findByIdAndUpdate(userId, { isOnline: true });
      io.emit("userStatus", { userId, isOnline: true });
    }

    // 🏠 دخول غرفة
    socket.on("joinRoom", ({ roomId, userId }) => {
      socket.join(roomId);
      io.to(roomId).emit("userJoined", userId);
    });

    // ⌨️ لما المستخدم يكتب
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


    // ✉️ إرسال رسالة
    socket.on('sendMessage', async (data) => {
      const { senderId, receiverId, roomId, text, timestamp } = data;
      // Save message to database
      const message = await Message.create({
        senderId,
        receiverId,
        roomId,
        text,
        timestamp,
        isGroup: !!roomId,
      });
      console.log(roomId);

      // Emit the message with timestamp
      if (roomId) {
        socket.to(roomId).emit('receiveMessage', message);
      } else {
        io.emit('receivePrivateMessage', message);
      }
    });

    socket.on('uploadMessage', async ({ metadata, buffer }) => {
      const { senderId, receiverId, roomId, text = '', filename, mimetype } = metadata;
      console.log(roomId);

      // Save file to disk
      const safe = filename.replace(/\s+/g, '_');
      const cleanName = `${Date.now()}-${safe}`;
      const savePath = path.join(__dirname, '../uploads', cleanName);
      fs.writeFileSync(savePath, Buffer.from(buffer));

      const hostUrl = 'http://localhost:5000';
      const fileUrl = `${hostUrl}/uploads/${cleanName}`;
      const fileNameOnly = path.basename(fileUrl);

      const message = await Message.create({
        senderId, receiverId, roomId, text,
        isGroup: !!roomId, fileUrl, fileType: mimetype,
        timestamp: new Date(), fileName: fileNameOnly
      });

      if (roomId) {
        socket.to(roomId).emit('receiveMessage', message);
        socket.emit('receiveMessage', message); // also to sender
      } else {
        io.to(receiverId).emit('receivePrivateMessage', message);
        io.to(senderId).emit('receivePrivateMessage', message);
      }
    });





    // 👁️‍🗨️ حدث عند قراءة الرسالة
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

    // 🔴 عند الخروج
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
