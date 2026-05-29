const bcrypt = require('bcrypt');
const { createUser, findUserByEmail, findUserById } = require('../models/userModel');

async function signup(req, res) {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const existing = await findUserByEmail(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ message: 'Email already registered.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const newUser = await createUser({
      email: email.toLowerCase(),
      password: hashed,
      displayName: displayName.trim(),
    });

    req.session.userId = newUser.id;
    req.session.isAdmin = newUser.isAdmin;
    return res.status(201).json({ message: 'Signup successful.', user: { email: newUser.email, displayName: newUser.displayName } });
  } catch (error) {
    console.error('Signup failed:', error);
    return res.status(500).json({ message: 'Unable to create account.' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await findUserByEmail(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    req.session.userId = user.id;
    req.session.isAdmin = user.isAdmin;
    return res.json({ message: 'Login successful.', user: { email: user.email, displayName: user.displayName, isAdmin: user.isAdmin } });
  } catch (error) {
    console.error('Login failed:', error);
    return res.status(500).json({ message: 'Login error occurred.' });
  }
}

async function logout(req, res) {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ message: 'Unable to log out.' });
    }
    res.clearCookie('connect.sid');
    return res.json({ message: 'Logged out successfully.' });
  });
}

async function me(req, res) {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  const user = await findUserById(req.session.userId);
  return res.json({ user });
}

module.exports = {
  signup,
  login,
  logout,
  me,
};
