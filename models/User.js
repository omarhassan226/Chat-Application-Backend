const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  image: { type: String },
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
  blockedUsers: [{ type: String }] 
});

module.exports = mongoose.model("User", userSchema);
