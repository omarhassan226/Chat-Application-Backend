const router = require("express").Router();
const Message = require("../models/Message");
const ChatRoom = require("../models/ChatRoom");
const auth = require("../middlewares/auth");
const upload = require("../middlewares/upload");
const User = require("../models/User");


router.post("/create-room", async (req, res) => {
  const room = await ChatRoom.create({
    name: req.body.name,
    members: req.body.members,
  });
  res.json(room);
});





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
      // fileType: req.file.mimetype,
    });
    res.json(message);
  } catch (error) {
    res.status(500).json({ error: err.message });
  }
});





router.get("/room/:roomId/messages", auth, async (req, res) => {
  const messages = await Message.find({ roomId: req.params.roomId });
  res.json(messages);
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





// جلب آخر رسالة لكل محادثة خاصة
router.get("/private/recent", auth, async (req, res) => {
  const userId = req.user.id;
  // هنجمع كل الرسائل اللي تخص اليوزر (مرسل أو مستقبل)
  const messages = await Message.find({
    isGroup: false,
    $or: [{ senderId: userId }, { receiverId: userId }],
  })
    .sort({ timestamp: -1 }) // نبدأ من الأحدث
    .lean();

  const chatMap = new Map();

  for (const msg of messages) {
    const otherUser =
      msg.senderId === userId ? msg.receiverId : msg.senderId;

    if (!chatMap.has(otherUser)) {
      chatMap.set(otherUser, msg); // نحفظ أول رسالة (لأنها الأحدث)
    }
  }

  // نرجع المحادثات كـ array
  res.json(Array.from(chatMap.values()));
});





router.get("/group/recent", auth, async (req, res) => {
  const userId = req.user.id;
  // الخطوة 1: هات الرومات اللي المستخدم دخلها (اللي هو عضو فيها)
  const rooms = await ChatRoom.find({ members: userId }).lean(); // ← لازم تضيف حقل members في ChatRoom

  const roomIds = rooms.map((room) => room._id);

  // الخطوة 2: هات الرسائل بتاعة الرومات دي فقط، ومرتبة من الأحدث
  const messages = await Message.find({
    isGroup: true,
    roomId: { $in: roomIds },
  })
    .sort({ timestamp: -1 })
    .lean();

  // الخطوة 3: نخزن آخر رسالة لكل روم
  const roomMap = new Map();

  for (const msg of messages) {
    if (!roomMap.has(msg.roomId)) {
      const room = rooms.find((r) => r._id.toString() === msg.roomId);
      roomMap.set(msg.roomId, {
        ...msg,
        roomName: room?.name || "Room",
      });
    }
  }

  res.json(Array.from(roomMap.values()));
});




router.post("/block", auth, async (req, res) => {
  const userId = req.user.id;
  const { targetUserId } = req.body;

  await User.findByIdAndUpdate(userId, {
    $addToSet: { blockedUsers: targetUserId } // ← تمنع التكرار
  });

  res.json({ success: true, message: "User blocked" });
});

// إلغاء الحظر
router.post("/unblock", auth, async (req, res) => {
  const userId = req.user.id;
  const { targetUserId } = req.body;

  await User.findByIdAndUpdate(userId, {
    $pull: { blockedUsers: targetUserId }
  });

  res.json({ success: true, message: "User unblocked" });
});

router.post("/send-file", auth, upload.single("file"), async (req, res) => {
  const { receiverId, roomId, text } = req.body;
  const senderId = req.user.id;

  if (!req.file) return res.status(400).json({ error: "File is required" });

  const message = await Message.create({
    senderId,
    receiverId,
    roomId,
    text,
    isGroup: !!roomId,
    fileUrl: `/uploads/${req.file.filename}`,
    fileType: req.file.mimetype,
  });

  res.json(message);
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
