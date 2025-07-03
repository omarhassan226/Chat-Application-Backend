const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  senderId: String,
  receiverId: String, 
  roomId: String,     
  text: String,
  fileUrl: String,     
  fileType: String,      
  timestamp: { type: Date, default: Date.now },
  isGroup: { type: Boolean, default: false },
  isRead: { type: Boolean, default: false },
  readAt: Date,
});

module.exports = mongoose.model("Message", messageSchema);
