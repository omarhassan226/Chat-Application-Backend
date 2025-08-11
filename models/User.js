const mongoose = require("mongoose");
const { Schema } = mongoose;

const userSchema = new Schema({
  username: { type: String, unique: true, required: true },

  email: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
  },

  phone: {
    type: String,
    unique: true,
    trim: true,
  },

  password: { type: String, required: true },
  image: String,
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
  blockedUsers: [String],
});

module.exports = mongoose.model("User", userSchema);
