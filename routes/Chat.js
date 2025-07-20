const router = require("express").Router();
const Message = require("../models/Message");
const ChatRoom = require("../models/ChatRoom");
const auth = require("../middlewares/auth");
const upload = require("../middlewares/upload");
const User = require("../models/User");
const mongoose = require('mongoose');

router.post("/send", auth, upload.single('file'), async (req, res) => {
  try {
    const { senderId, receiverId, roomId, text } = req.body;
    const isGroup = !!roomId;
    const message = await Message.create({
      senderId,
      receiverId,
      roomId,
      text,
      isGroup,
      fileUrl: `/uploads/${req.file.filename}`,
    });
    res.json(message);
  } catch (error) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/room/:roomId/messages', auth, async (req, res) => {
  const { roomId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(roomId)) {
    return res.status(400).json({ error: 'Invalid roomId' });
  }
  const messages = await Message.find({ roomId }).sort({ timestamp: 1 }).lean();
  res.json(messages);
});

router.post('/create-room', auth, async (req, res) => {
  const { memberIds, name } = req.body;
  if (!Array.isArray(memberIds) || memberIds.length < 2) {
    return res.status(400).json({ error: 'memberIds must be an array of at least two user IDs' });
  }
  const isGroup = memberIds.length > 2;
  const roomName = isGroup ? name : null;
  let room = await ChatRoom.findOne({
    isGroup,
    members: { $all: memberIds, $size: memberIds.length },
  });
  if (!room) {
    room = await ChatRoom.create({
      name: roomName,
      members: memberIds,
      isGroup,
    });
  }
  res.json({ roomId: room._id });
});

router.get("/private/:user1/:user2", auth, async (req, res) => {
  const { user1, user2 } = req.params;
  const messages = await Message.find({
    isGroup: false,
    $or: [
      { senderId: user1, receiverId: user2 },
      { senderId: user2, receiverId: user1 }
    ]
  }).sort("timestamp");
  res.json(messages);
});

router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password").lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ message: "User data from token", user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.post("/mark-read", auth, async (req, res) => {
  const { messageIds } = req.body;
  const updated = await Message.updateMany(
    { _id: { $in: messageIds }, receiverId: req.user.id },
    { $set: { isRead: true, readAt: new Date() } }
  );
  res.json({ success: true, updated: updated.modifiedCount });
});

router.get("/private/recent-users", auth, async (req, res) => {
  const userId = req.user.id;
  const messages = await Message.find({
    $or: [{ senderId: userId }, { receiverId: userId }],
  })
    .sort({ timestamp: -1 })
    .lean();
  const userLastMessageMap = new Map();
  for (const msg of messages) {
    const otherUserId = msg.senderId === userId ? msg.receiverId : msg.senderId;
    if (!userLastMessageMap.has(otherUserId)) {
      userLastMessageMap.set(otherUserId, msg);
    }
  }
  const recentUserIds = Array.from(userLastMessageMap.keys());
  const users = await User.find({ _id: { $in: recentUserIds } })
    .select("-password")
    .lean();
  const result = users.map((user) => ({
    ...user,
    lastMessage: userLastMessageMap.get(user._id.toString()),
  }));
  result.sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));
  res.json(result);
});

router.get("/users-filter", auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ message: "Query parameter 'q' is required" });
    }
    const regex = new RegExp(q, "i");
    const users = await User.find({
      $or: [
        { username: regex },
        { email: regex },
        { phone: regex }
      ]
    })
      .select("-password")
      .lean();
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get("/users", auth, async (req, res) => {
  try {
    const users = await User.find({})
      .select("-password")
      .lean();
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
