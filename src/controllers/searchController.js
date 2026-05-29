const { addSearchRecord, getRecentSearches, getRecentSearchesByUser } = require('../models/searchModel');
const { search, buildSuggestions, luckyResult } = require('../models/mockResults');

async function executeSearch(req, res) {
  try {
    const query = (req.query.q || '').trim();
    const page = Number(req.query.page) || 1;
    if (!query) {
      return res.status(400).json({ message: 'Please enter a search query.' });
    }

    const resultSet = search(query, page, 8);
    const userId = req.session.userId || null;
    await addSearchRecord({
      userId,
      query,
      resultsCount: resultSet.total,
    });

    res.json({
      query: resultSet.query,
      results: resultSet.results,
      page: resultSet.page,
      totalPages: resultSet.totalPages,
      total: resultSet.total,
    });
  } catch (error) {
    console.error('Search failed:', error);
    res.status(500).json({ message: 'Search service unavailable.' });
  }
}

async function getSuggestions(req, res) {
  try {
    const query = (req.query.q || '').trim();
    const suggestions = buildSuggestions(query);
    res.json({ suggestions });
  } catch (error) {
    console.error('Suggestions failed:', error);
    res.status(500).json({ message: 'Unable to load suggestions.' });
  }
}

async function fetchRecent(req, res) {
  try {
    if (req.session.userId) {
      const data = await getRecentSearchesByUser(req.session.userId, 6);
      return res.json({ recent: data });
    }
    const data = await getRecentSearches(6);
    return res.json({ recent: data });
  } catch (error) {
    console.error('Recent searches failed:', error);
    res.status(500).json({ message: 'Unable to load recent searches.' });
  }
}

async function feelingLucky(req, res) {
  try {
    const query = (req.query.q || '').trim();
    if (!query) {
      return res.status(400).json({ message: 'Please enter a search query.' });
    }

    const result = luckyResult(query);
    return res.json({ result });
  } catch (error) {
    console.error('Lucky search failed:', error);
    res.status(500).json({ message: 'Unable to find a lucky result.' });
  }
}

module.exports = {
  executeSearch,
  getSuggestions,
  fetchRecent,
  feelingLucky,
};
