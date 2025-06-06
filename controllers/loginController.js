// Controller for login logic
const User = require('../models/User');
const Session = require('../models/Session');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

exports.register = async (req, res) => {
  try {
    // Ensure req.body exists and is an object
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Request body is missing or invalid. Make sure you are sending JSON.' });
    }
    // Accept all possible user fields from req.body
    const { username, email, password, role, name, phone, address } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'username, email, and password are required' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword, role, name, phone, address });
    await user.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    // Create session
    const sessionId = uuidv4();
    await Session.create({ sessionId, userId: user._id });
    res.json({ sessionId, user: { id: user._id, email: user.email, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.logout = async (req, res) => {
  try {
    const sessionId = req.header('X-Session-Id');
    if (sessionId) {
      await Session.deleteOne({ sessionId });
    }
    res.json({ message: 'Logged out' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.me = async (req, res) => {
  try {
    const sessionId = req.header('X-Session-Id');
    if (!sessionId) return res.status(401).json({ error: 'No session' });
    const session = await Session.findOne({ sessionId }).populate('userId');
    if (!session || !session.userId) return res.status(401).json({ error: 'Invalid session' });
    const user = session.userId;
    res.json({ id: user._id, email: user.email, username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
