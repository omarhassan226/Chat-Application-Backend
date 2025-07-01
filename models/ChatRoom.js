const mongoose = require("mongoose");

const chatRoomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  members: [{ type: String, required: true }], // ← user IDs
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("ChatRoom", chatRoomSchema);
