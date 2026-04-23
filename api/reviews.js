const mongoose = require('mongoose');
const Review = require('../models/Review');
const User = require('../models/User');
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
    if (method === 'GET') {
      const reviews = await Review.find().sort({ createdAt: -1 });
      res.json(reviews);
    } else if (method === 'POST') {
      // Check authorization
      const authHeader = headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Не авторизован' });
      }

      let userId;
      try {
        const decoded = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET);
        userId = decoded.userId;
      } catch (jwtError) {
        return res.status(401).json({ error: 'Неверный токен' });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      const { message, rating } = body;

      if (!message || !rating) {
        return res.status(400).json({ error: 'Заполните все поля' });
      }

      if (message.length > 500) {
        return res.status(400).json({ error: 'Сообщение слишком длинное' });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Рейтинг должен быть от 1 до 5' });
      }

      const review = new Review({
        user: user._id,
        username: user.displayName || user.username,
        message,
        rating
      });

      await review.save();

      res.status(201).json(review);
    } else if (method === 'DELETE') {
      const authHeader = headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Не авторизован' });
      }

      let userId;
      try {
        const decoded = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET);
        userId = decoded.userId;
      } catch (jwtError) {
        return res.status(401).json({ error: 'Неверный токен' });
      }

      const { id } = query;

      if (!id) {
        return res.status(400).json({ error: 'ID отзыва не указан' });
      }

      const review = await Review.findById(id);
      if (!review) {
        return res.status(404).json({ error: 'Отзыв не найден' });
      }

      // Only allow deleting own reviews
      if (String(review.user) !== String(userId)) {
        return res.status(403).json({ error: 'Можно удалять только свои отзывы' });
      }

      await Review.findByIdAndDelete(id);

      res.json({ message: 'Отзыв удален' });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Reviews error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};