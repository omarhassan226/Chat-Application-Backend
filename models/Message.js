const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Optional for group
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom" },
  text: String,
  isGroup: Boolean,
  timestamp: { type: Date, default: Date.now },
  fileUrl: String,
  fileType: String,
  isRead: { type: Boolean, default: false },
  readAt: Date,
});

module.exports = mongoose.model("Message", messageSchema);
