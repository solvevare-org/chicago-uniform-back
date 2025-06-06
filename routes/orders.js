// Router for pending order endpoints
const express = require('express');
const router = express.Router();
const pendingOrderController = require('../controllers/pendingOrderController');

router.post('/pending', pendingOrderController.createPendingOrder);
router.get('/pending', pendingOrderController.getAllPendingOrders);
router.patch('/pending/:id', pendingOrderController.updateOrderStatus);

// Search products by query string (name, sku, etc.)
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing search query' });
    // Search by name or SKU (case-insensitive)
    const products = await require('../models/Product').find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { sku: { $regex: q, $options: 'i' } }
      ]
    });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
