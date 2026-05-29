const { db } = require('./db');

function createUser({ email, password, displayName, isAdmin = 0 }) {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    const sql = `INSERT INTO users (email, password, displayName, isAdmin, createdAt) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [email, password, displayName, isAdmin, createdAt], function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, email, displayName, isAdmin });
    });
  });
}

function findUserByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function findUserById(id) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT id, email, displayName, isAdmin, createdAt FROM users WHERE id = ?`, [id], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function getAllUsers() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT id, email, displayName, isAdmin, createdAt FROM users ORDER BY createdAt DESC`, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function deleteUser(id) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM users WHERE id = ?`, [id], function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    });
  });
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  getAllUsers,
  deleteUser,
};
