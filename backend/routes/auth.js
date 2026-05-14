const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

// Sembrar administrador por defecto si no existe ninguno
const seedAdmin = async () => {
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      const defaultAdmin = new Admin({
        username: 'admin',
        password: 'admin123'
      });
      await defaultAdmin.save();
      console.log('Administrador por defecto creado (admin / admin123)');
    }
  } catch (error) {
    console.error('Error sembrando admin:', error);
  }
};

seedAdmin();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'supersecretkey', {
    expiresIn: '30d',
  });
};

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const admin = await Admin.findOne({ username });

    if (admin && (await admin.matchPassword(password))) {
      res.json({
        _id: admin._id,
        username: admin.username,
        token: generateToken(admin._id),
      });
    } else {
      res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error de servidor' });
  }
});

module.exports = router;
