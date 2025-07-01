// نبدأ بكل الأساسيات
require("dotenv").config();
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);

// إعدادات أساسية
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ربط Routes
app.use("/api/auth", require("./routes/Auth"));
app.use("/api/chat", require("./routes/Chat"));

// الاتصال بقاعدة البيانات
mongoose.connect(process.env.MONGO_URI).then(() => {
  console.log("MongoDB Connected");
  server.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
  });
});

// تفعيل الـ Socket.IO
require("./socket")(server);
