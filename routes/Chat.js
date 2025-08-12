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
      isGroup: true,
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

  const currentUser = await User.findById(userId).select('starredUsers').lean();
  const starredSet = new Set(currentUser.starredUsers.map(id => id.toString()));

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
    isStarred: starredSet.has(user._id.toString()), // 👈 Add the flag here
    lastMessage: userLastMessageMap.get(user._id.toString()),
  }));

  result.sort((a, b) => {
    if (b.isStarred !== a.isStarred) return b.isStarred - a.isStarred; // starred first
    return new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp);
  });

  res.json(result);
});

// GET /group/recent-users
router.get("/group/recent-users", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Find all group chat rooms where the user is a member
    const groupRooms = await ChatRoom.find({
      isGroup: true,
      members: userId,
    }).lean();

    if (!groupRooms.length) {
      return res.json([]);
    }

    const roomIds = groupRooms.map((room) => room._id.toString());

    // 2. Find latest message per room (in one pass)
    const latestMessages = await Message.aggregate([
      {
        $match: {
          isGroup: true,
          roomId: { $in: groupRooms.map((room) => room._id) },
        },
      },
      {
        $sort: { timestamp: -1 },
      },
      {
        $group: {
          _id: "$roomId",
          message: { $first: "$$ROOT" },
        },
      },
    ]);

    // 3. Map room ID to its last message
    const lastMessageMap = new Map();
    latestMessages.forEach((entry) => {
      lastMessageMap.set(entry._id.toString(), entry.message);
    });

    // 4. Combine with room details
    const result = groupRooms
      .map((room) => {
        const lastMessage = lastMessageMap.get(room._id.toString());
        if (!lastMessage) return null;

        return {
          roomId: room._id,
          roomName: room.name,
          members: room.members.filter((id) => id.toString() !== userId),
          lastMessage,
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp)
      );

    res.json(result);
  } catch (error) {
    console.error("Error in /group/recent-users:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/users-filter", auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ message: "Query parameter 'q' is required" });
    }

    const currentUserId = req.user.id;

    // Get current user's starredUsers list
    const currentUser = await User.findById(currentUserId).select('starredUsers').lean();
    const starredSet = new Set(currentUser.starredUsers.map(id => id.toString()));

    const regex = new RegExp(q, "i");

    // Search all users (excluding self)
    const users = await User.find({
      _id: { $ne: currentUserId },
      $or: [
        { username: regex },
        { email: regex },
        { phone: regex }
      ]
    })
      .select("-password")
      .lean();

    const usersWithFlag = users.map(user => ({
      ...user,
      isStarred: starredSet.has(user._id.toString())
    }));

    // Optional: Sort starred users to top
    usersWithFlag.sort((a, b) => Number(b.isStarred) - Number(a.isStarred));

    res.json(usersWithFlag);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get("/users", auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const userObjectId = new mongoose.Types.ObjectId(currentUserId);

    // 1. المستخدم الحالي و الـ starred
    const currentUser = await User.findById(currentUserId)
      .select("starredUsers")
      .lean();

    const starredSet = new Set(currentUser.starredUsers.map(id => id.toString()));

    // 2. كل اليوزرز ماعدا نفسك
    const allUsers = await User.find({ _id: { $ne: currentUserId } })
      .select("-password")
      .lean();

    // 3. الرسائل الخاصة
    const privateMessages = await Message.find({
      $or: [
        { senderId: currentUserId },
        { receiverId: currentUserId }
      ]
    })
      .sort({ timestamp: -1 })
      .lean();

    const privateMap = new Map();

    for (const msg of privateMessages) {
      const otherUserId = msg.senderId.toString() === currentUserId
        ? msg.receiverId?.toString()
        : msg.senderId?.toString();

      if (!privateMap.has(otherUserId)) {
        privateMap.set(otherUserId, []);
      }

      privateMap.get(otherUserId).push(msg);
    }

    // 4. جروبات المستخدم
    const rooms = await ChatRoom.find({ members: userObjectId }).lean();

    const roomIds = rooms.map(room => room._id);

    const groupMessages = await Message.find({
      isGroup: true,
      roomId: { $in: roomIds }
    })
      .sort({ timestamp: -1 })
      .lean();

    const groupMap = new Map();

    for (const msg of groupMessages) {
      const roomId = msg.roomId.toString();
      if (!groupMap.has(roomId)) {
        groupMap.set(roomId, []);
      }
      groupMap.get(roomId).push(msg);
    }

    const userGroupMap = new Map(); // userId -> array of group messages

    for (const room of rooms) {
      const messages = groupMap.get(room._id.toString()) || [];
      if (messages.length === 0) continue;

      for (const member of room.members) {
        const memberId = member.toString();
        if (memberId === currentUserId) continue;

        if (!userGroupMap.has(memberId)) {
          userGroupMap.set(memberId, []);
        }

        userGroupMap.get(memberId).push({
          roomId: room._id,
          roomName: room.name,
          messages
        });
      }
    }

    // 5. الدمج النهائي
    const usersWithExtras = allUsers.map(user => {
      const userIdStr = user._id.toString();
      const privateMsgs = privateMap.get(userIdStr) || [];
      const groupConvos = userGroupMap.get(userIdStr) || [];

      let lastMessage = null;
      let lastMessageTime = null;
      let messageCount = privateMsgs.length;
      let roomId = null;

      if (privateMsgs.length > 0) {
        lastMessage = privateMsgs[0];
        lastMessageTime = privateMsgs[0].timestamp;
      }

      // لو الجروب فيه رسائل أحدث
      for (const convo of groupConvos) {
        const groupLastMsg = convo.messages[0];
        if (!lastMessageTime || new Date(groupLastMsg.timestamp) > new Date(lastMessageTime)) {
          lastMessage = groupLastMsg;
          lastMessageTime = groupLastMsg.timestamp;
          roomId = convo.roomId;
        }
        messageCount += convo.messages.length;
      }

      return {
        ...user,
        isStarred: starredSet.has(userIdStr),
        lastMessage: lastMessage || null,
        lastMessageTime: lastMessageTime || null,
        messageCount,
        roomId: roomId || null,
      };
    });

    // 6. ترتيب حسب آخر رسالة
    // 6. ترتيب حسب starred ثم آخر رسالة
    usersWithExtras.sort((a, b) => {
      if (a.isStarred !== b.isStarred) {
        return b.isStarred - a.isStarred;
      }

      const timeA = new Date(a.lastMessageTime || 0);
      const timeB = new Date(b.lastMessageTime || 0);
      return timeB - timeA;
    });


    res.json(usersWithExtras);
  } catch (err) {
    console.error("Error in /users:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.post("/star-user/:id", auth, async (req, res) => {
  try {
    const currentUser = req.user.id;
    const targetUser = req.params.id;

    const user = await User.findById(currentUser);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.starredUsers.includes(targetUser)) {
      user.starredUsers.push(targetUser);
      await user.save();
    }

    res.json({ success: true, starredUsers: user.starredUsers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/star-user/:id", auth, async (req, res) => {
  try {
    const currentUser = req.user.id;
    const targetUser = req.params.id;

    const user = await User.findById(currentUser);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.starredUsers = user.starredUsers.filter(
      (uid) => uid.toString() !== targetUser
    );
    await user.save();

    res.json({ success: true, starredUsers: user.starredUsers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/starred-users", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate("starredUsers", "-password")
      .lean();

    const starredUsers = (user.starredUsers || []).map((starredUser) => ({
      ...starredUser,
      isStarred: true,
    }));

    res.json(starredUsers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/messages/all-conversations", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const result = [];

    // 1. Private Messages
    const privateMessages = await Message.find({
      // isGroup: false,
      $or: [{ senderId: userId }, { receiverId: userId }],
    })
      .sort({ timestamp: -1 })
      .lean();

    const privateMap = new Map();

    for (const msg of privateMessages) {
      const otherUserId = msg.senderId?.toString() === userId ? msg.receiverId?.toString() : msg.senderId.toString();
      // if (!privateMap.has(otherUserId)) {
      //   privateMap.set(otherUserId, []);
      // }
      privateMap.get(otherUserId)?.push(msg);
    }

    const privateUserIds = Array.from(privateMap.keys());

    const privateUsers = await User.find({ _id: { $in: privateUserIds } })
      .select("username image isOnline")
      .lean();

    for (const user of privateUsers) {
      const messages = privateMap.get(user._id.toString());
      result.push({
        type: 'private',
        user,
        messages,
        lastMessageTime: messages[0]?.timestamp,
      });
    }

    // 2. Group Messages
    const rooms = await ChatRoom.find({
      // isGroup: true,
      members: userObjectId,
    }).lean();

    const roomIds = rooms.map((room) => room._id);

    const groupMessages = await Message.find({
      isGroup: true,
      roomId: { $in: roomIds },
    })
      .sort({ timestamp: -1 })
      .lean();


    const groupMap = new Map();

    for (const msg of groupMessages) {
      const roomId = msg.roomId.toString();
      if (!groupMap.has(roomId)) {
        groupMap.set(roomId, []);
      }
      groupMap.get(roomId).push(msg);
    }

    for (const room of rooms) {
      const messages = groupMap.get(room._id.toString()) || [];
      if (messages.length === 0) continue;

      result.push({
        type: 'group',
        roomId: room._id,
        roomName: room.name,
        members: room.members,
        messages,
        lastMessageTime: messages[0].timestamp,
      });
    }

    // Final sort
    result.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));

    res.json(result);
  } catch (err) {
    console.error("Error in /messages/all-conversations:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Add to your chat routes file
router.get("/room/:roomId/users-with-messages", auth, async (req, res) => {
  try {
    const { roomId } = req.params;

    // 1. Validate room ID
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ error: "Invalid room ID" });
    }

    // 2. Find the chat room and populate member users
    const room = await ChatRoom.findById(roomId)
      .populate("members", "-password") // exclude passwords
      .lean();

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // 3. Find all messages in the room, sorted by timestamp
    const messages = await Message.find({ roomId })
      .sort({ timestamp: 1 })
      .lean();

    // Optional: Group messages by user (if needed)
    const messagesByUser = room.members.map(user => ({
      user,
      messages: messages.filter(msg => msg.senderId.toString() === user._id.toString())
    }));

    res.json({
      roomId: room._id,
      roomName: room.name,
      membersWithMessages: messagesByUser,
      allMessages: messages,
    });

  } catch (err) {
    console.error("Error fetching room users with messages:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});




module.exports = router;
