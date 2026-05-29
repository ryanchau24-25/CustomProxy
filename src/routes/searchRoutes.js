const express = require('express');
const { executeSearch, getSuggestions, fetchRecent, feelingLucky } = require('../controllers/searchController');
const router = express.Router();

router.get('/', executeSearch);
router.get('/suggestions', getSuggestions);
router.get('/recent', fetchRecent);
router.get('/lucky', feelingLucky);

module.exports = router;
