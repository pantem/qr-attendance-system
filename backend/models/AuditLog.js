const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true
  },
  action: {
    type: String,
    enum: ['Exportar', 'Eliminar'],
    required: true
  },
  details: {
    type: String,
    required: true
  },
  backupUrl: {
    type: String,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
