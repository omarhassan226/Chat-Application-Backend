const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  senderId: String,
  receiverId: String, // اختياري
  roomId: String,     // اختياري
  text: String,
  fileUrl: String,         // ← رابط الملف
  fileType: String,        // ← image / video / pdf ...
  timestamp: { type: Date, default: Date.now },
  isGroup: { type: Boolean, default: false },
  isRead: { type: Boolean, default: false },
  readAt: Date,
});

module.exports = mongoose.model("Message", messageSchema);
