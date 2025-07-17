// models/Notification.js
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    userId: String,
    title: String,
    body: String,
    type: String, // message, friend_request, etc.
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Notification', schema);
