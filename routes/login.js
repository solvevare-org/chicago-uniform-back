// Router for login endpoints
const express = require('express');
const router = express.Router();
const loginController = require('../controllers/loginController');

router.post('/register', loginController.register);
router.post('/login', loginController.login);
router.post('/logout', loginController.logout);
router.get('/me', loginController.me);

module.exports = router;
