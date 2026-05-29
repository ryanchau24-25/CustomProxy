const { getAllUsers, deleteUser } = require('../models/userModel');
const { getRecentSearches } = require('../models/searchModel');

async function getUsers(req, res) {
  try {
    const users = await getAllUsers();
    res.json({ users });
  } catch (error) {
    console.error('Could not load users:', error);
    res.status(500).json({ message: 'Unable to load users.' });
  }
}

async function getSearchHistory(req, res) {
  try {
    const history = await getRecentSearches(30);
    res.json({ history });
  } catch (error) {
    console.error('Could not load search history:', error);
    res.status(500).json({ message: 'Unable to load search history.' });
  }
}

async function removeUser(req, res) {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ message: 'User id is required.' });
    const changes = await deleteUser(id);
    res.json({ message: changes ? 'User removed.' : 'No user removed.' });
  } catch (error) {
    console.error('Could not delete user:', error);
    res.status(500).json({ message: 'Unable to delete user.' });
  }
}

module.exports = {
  getUsers,
  getSearchHistory,
  removeUser,
};
