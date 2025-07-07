const router = require("express").Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("../middlewares/upload");
const upload = require("../middlewares/upload");

router.post(
  "/register",
  upload.single("image"),
  async (req, res) => {
    try {
      const { username, email, phone, password } = req.body;

      // Validate required fields
      if (!username || !password || (!email && !phone)) {
        return res.status(400).json({
          message: "username, password, and at least one of email or phone is required",
        });
      }

      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }
      if (phone && !/^\+?\d{7,15}$/.test(phone)) {
        return res.status(400).json({ message: "Invalid phone format" });
      }

      const existing = await User.findOne({
        $or: [{ username }, { email }, { phone }],
      });
      if (existing) {
        const field =
          existing.username === username
            ? "Username"
            : existing.email === email
            ? "Email"
            : "Phone";
        return res.status(400).json({ message: `${field} already exists` });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const imageUrl = req.file
        ? `${req.protocol}://${req.get("host")}/${req.file.path.replace(/\\/g, "/")}`
        : null;

      const userData = {
        username,
        password: hashedPassword,
      };
      if (email) userData.email = email;
      if (phone) userData.phone = phone;
      if (imageUrl) userData.image = imageUrl;

      const user = await User.create(userData);
      res.status(201).json({ message: "User registered successfully", user });
    } catch (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: "Image upload failed", error: err.message });
      }
      if (err.code === 11000) {
        return res.status(400).json({ message: "Duplicate key error", error: err.message });
      }
      console.error(err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);



router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ error: "User not found" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { id: user._id, username: user.username },
    process.env.JWT_SECRET,
    {
      expiresIn: "24h",
    }
  );

  res.json({ user, token });
});

module.exports = router;
