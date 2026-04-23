const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// MongoDB connection
let isConnected = false;

async function connectToDatabase() {
  if (isConnected) return;

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    isConnected = true;
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  await connectToDatabase();

  const { method, query, body, headers } = req;

  try {
    if (method === 'POST' && query.action === 'register') {
      const { username, email, displayName, password } = body;

      // Check if user exists
      const existingUser = await User.findOne({ $or: [{ email }, { username }] });
      if (existingUser) {
        return res.status(400).json({ error: 'Пользователь уже существует' });
      }

      // Create user (password is hashed in User model's pre-save hook)
      const user = new User({
        username,
        email,
        displayName,
        password
      });

      await user.save();

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(201).json({
        message: 'Регистрация успешна',
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          displayName: user.displayName
        }
      });
    } else if (method === 'POST' && query.action === 'login') {
      const { email, password } = body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ error: 'Неверный email или пароль' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Неверный email или пароль' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        message: 'Вход успешен',
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          displayName: user.displayName
        }
      });
    } else if (method === 'POST' && query.action === 'logout') {
      res.json({ message: 'Выход успешен' });
    } else if (method === 'GET' && query.action === 'me') {
      const authHeader = headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Не авторизован' });
      }

      const token = authHeader.substring(7);

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (!user) {
          return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json({
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
            displayName: user.displayName
          }
        });
      } catch (jwtError) {
        return res.status(401).json({ error: 'Неверный токен' });
      }
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};