const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  identifier: {
    type: String,
    required: true,
    unique: true,
  },
  area: {
    type: String,
    default: 'General',
  },
  position: {
    type: String,
    default: 'Empleado',
  },
  employeeType: {
    type: String,
    enum: ['Base', 'Honorarios', 'Otro'],
    default: 'Base',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  qrCode: {
    type: String, // Data URL (base64) of the QR code
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', userSchema);
