const mongoose = require("mongoose");
const { Schema } = mongoose;

const ChatRoomSchema = new Schema({
  // _id: { type: String, required: true },
  name: { type: String, default: 'Untitled Room' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // isGroup: { type: Boolean, default: false },
});

// const ChatRoom = mongoose.model('ChatRoom', ChatRoomSchema);

module.exports = mongoose.model("ChatRoom", ChatRoomSchema);
