// Session model for storing session IDs
const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now, expires: '7d' } // Sessions expire after 7 days
});

module.exports = mongoose.model('Session', sessionSchema);
