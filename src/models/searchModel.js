const { db } = require('./db');

function addSearchRecord({ userId, query, resultsCount }) {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    const sql = `INSERT INTO search_history (userId, query, resultsCount, createdAt) VALUES (?, ?, ?, ?)`;
    db.run(sql, [userId, query, resultsCount, createdAt], function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, query, resultsCount, createdAt });
    });
  });
}

function getRecentSearches(limit = 5) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT search_history.id, userId, query, resultsCount, search_history.createdAt, users.displayName
       FROM search_history
       LEFT JOIN users ON users.id = search_history.userId
       ORDER BY search_history.createdAt DESC
       LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

function getRecentSearchesByUser(userId, limit = 5) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, query, resultsCount, createdAt FROM search_history WHERE userId = ? ORDER BY createdAt DESC LIMIT ?`,
      [userId, limit],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

function deleteSearchRecord(id) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM search_history WHERE id = ?`, [id], function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    });
  });
}

module.exports = {
  addSearchRecord,
  getRecentSearches,
  getRecentSearchesByUser,
  deleteSearchRecord,
};
