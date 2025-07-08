const { Server } = require("socket.io");
const User = require("../models/User");
const Message = require("../models/Message");

module.exports = function (server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", async (socket) => {
    console.log("Connected:", socket.id);
    const userId = socket.handshake.auth.userId;
    console.log(userId);


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
    socket.on("typing", ({ roomId, userId }) => {
      socket.to(roomId).emit("userTyping", { userId });
    });

    // 🛑 لما المستخدم يوقف كتابة
    socket.on("stopTyping", ({ roomId, userId }) => {
      socket.to(roomId).emit("userStoppedTyping", { userId });
    });

    // ✉️ إرسال رسالة
    socket.on("sendMessage", async (data) => {
      const { senderId, receiverId, roomId } = data;

      if (roomId) {
        // جروب شات
        socket.to(roomId).emit("receiveMessage", data);
      } else if (receiverId) {
        // شات خاص - نتحقق هل المستقبل حاجب المرسل؟
        const receiver = await User.findById(receiverId).lean();
        if (receiver?.blockedUsers?.includes(senderId)) {
          console.log(`🚫 رسالة مرفوضة: ${senderId} محظور من ${receiverId}`);
          return;
        }

        // لو مش محظور، نبعته له
        io.emit("receivePrivateMessage", data); // في نسخة متقدمة تقدر تبعته لمجرد receiver socket.id
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
