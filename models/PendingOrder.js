// PendingOrder model for storing order submissions
const mongoose = require('mongoose');

const pendingOrderSchema = new mongoose.Schema({
  user: {
    email: String,
    phone: String,
    name: String,
    address: String,
    description: String
  },
  product: mongoose.Schema.Types.Mixed, // Store product info as object
  quantity: Number,
  images: {
    front: String, // base64 or URL
    back: String,
    providedFront: String,
    providedBack: String
  },
  status: { type: String, enum: ['pending', 'verified', 'ordered'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  ssApiResponse: mongoose.Schema.Types.Mixed // Store S&S API response if needed
});

module.exports = mongoose.model('PendingOrder', pendingOrderSchema);
