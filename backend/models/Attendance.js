const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['Entrada', 'Salida', 'Inicio', 'Fin'],
    required: true,
  },
  photo: {
    type: String, // Base64 image
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  activity: {
    type: String,
    default: 'Jornada Laboral',
    required: true
  },
  terminalName: {
    type: String,
    default: 'Web App / Desconocido'
  }
});

module.exports = mongoose.model('Attendance', attendanceSchema);
