// Controller for pending order logic
const PendingOrder = require('../models/PendingOrder');
const nodemailer = require('nodemailer');

// Configure nodemailer (replace with your SMTP credentials)
const transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 465,
      auth: {
        user: 'info@solvevare.com',
        pass: '@Solvevare2024',
      },
 });

exports.createPendingOrder = async (req, res) => {
  try {
    const order = await PendingOrder.create(req.body);
    // Build HTML with embedded images and user info
    let imagesHtml = '';
    if (order.images) {
      if (order.images.front) {
        imagesHtml += `<div><b>Front Image:</b><br><img src="${order.images.front}" style="max-width:300px;"/></div><br>`;
      }
      if (order.images.back) {
        imagesHtml += `<div><b>Back Image:</b><br><img src="${order.images.back}" style="max-width:300px;"/></div><br>`;
      }
      if (order.images.providedFront) {
        imagesHtml += `<div><b>Provided Front:</b><br><img src="${order.images.providedFront}" style="max-width:300px;"/></div><br>`;
      }
      if (order.images.providedBack) {
        imagesHtml += `<div><b>Provided Back:</b><br><img src="${order.images.providedBack}" style="max-width:300px;"/></div><br>`;
      }
    }
    let userInfoHtml = '';
    if (order.user) {
      userInfoHtml = `
        <h3>User Information</h3>
        <ul>
          <li><b>Email:</b> ${order.user.email || ''}</li>
          <li><b>Phone:</b> ${order.user.phone || ''}</li>
          <li><b>Name:</b> ${order.user.name || ''}</li>
          <li><b>Address:</b> ${order.user.address || ''}</li>
          <li><b>Description:</b> ${order.user.description || ''}</li>
        </ul>
      `;
    }
    // Send email to admin with images embedded
    await transporter.sendMail({
      from: 'info@solvevare.com',
      to: 'sufyanakbar01239@gmail.com',
      subject: 'New Pending Order',
      html: `
        <h2>New Pending Order</h2>
        ${userInfoHtml}
        <pre>${JSON.stringify(order, null, 2)}</pre>
        ${imagesHtml}
      `
    });
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getAllPendingOrders = async (req, res) => {
  try {
    const orders = await PendingOrder.find();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const order = await PendingOrder.findByIdAndUpdate(id, { status }, { new: true });

    // If status is set to 'ordered', post to S&S API
    if (order && status === 'ordered') {
      // Build S&S API order object (customize as needed)
      const ssOrder = {
        // Example structure, adjust fields as required by S&S API
        customer: {
          email: order.user.email,
          phone: order.user.phone,
          name: order.user.name,
          address: order.user.address
        },
        product: order.product,
        quantity: order.quantity,
        images: order.images
      };
      try {
        const response = await fetch('https://api.ssactivewear.com/v2/orders/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ssOrder)
        });
        const result = await response.json();
        // Optionally, update order with S&S API response
        order.ssApiResponse = result;
        await order.save();
      } catch (apiErr) {
        console.error('S&S API error:', apiErr);
      }
    }

    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Add more logic as needed (e.g., send to S&S API when status is 'ordered')
