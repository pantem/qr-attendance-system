const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const { protect } = require('../middleware/auth');

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

// Listar administradores
router.get('/admins', protect, async (req, res) => {
  try {
    const admins = await Admin.find().select('-password');
    res.json(admins);
  } catch (error) {
    res.status(500).json({ message: 'Error de servidor' });
  }
});

// Crear administrador
router.post('/admins', protect, async (req, res) => {
  const { username, password } = req.body;
  try {
    const adminExists = await Admin.findOne({ username });
    if (adminExists) return res.status(400).json({ message: 'El usuario ya existe' });
    const newAdmin = new Admin({ username, password });
    await newAdmin.save();
    res.json({ message: 'Administrador creado', admin: { _id: newAdmin._id, username: newAdmin.username } });
  } catch (error) {
    res.status(500).json({ message: 'Error de servidor' });
  }
});

// Eliminar administrador
router.delete('/admins/:id', protect, async (req, res) => {
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount <= 1) return res.status(400).json({ message: 'No puedes eliminar el único administrador' });
    await Admin.findByIdAndDelete(req.params.id);
    res.json({ message: 'Administrador eliminado' });
  } catch (error) {
    res.status(500).json({ message: 'Error de servidor' });
  }
});

// Cambiar contraseña
router.put('/admins/:id/password', protect, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ message: 'La contraseña debe tener al menos 4 caracteres' });
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ message: 'Admin no encontrado' });
    admin.password = newPassword;
    await admin.save();
    res.json({ message: 'Contraseña actualizada' });
  } catch (error) {
    res.status(500).json({ message: 'Error de servidor' });
  }
});

module.exports = router;
