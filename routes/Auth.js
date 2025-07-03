const router = require("express").Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("../middlewares/upload");
const upload = require("../middlewares/upload");

router.post("/register", upload.single("image"), async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if the username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: "Username already exists" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Prepare image URL if file exists
    const imageUrl = req.file
      ? `${req.protocol}://${req.get("host")}/${req.file.path.replace(/\\/g, "/")}`
      : null;

    // Create user data
    const userData = {
      username,
      password: hashedPassword,
      image: imageUrl,
    };

    // Create the user in DB
    const user = await User.create(userData);

    res.status(201).json({ message: "User created successfully", user });
  } catch (err) {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ message: "Image Upload Error" });
    } else if (err.code === 11000) {
      // Handle duplicate key error if unique index exists on username
      res.status(400).json({ message: "Username already exists" });
    } else {
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
});


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
