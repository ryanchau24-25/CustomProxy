const express = require('express');
const { getUsers, getSearchHistory, removeUser } = require('../controllers/adminController');
const { requireAdmin, requireLogin } = require('../middleware/authMiddleware');
const router = express.Router();

router.use(requireLogin);
router.use(requireAdmin);

router.get('/users', getUsers);
router.get('/history', getSearchHistory);
router.post('/delete-user', removeUser);

module.exports = router;
