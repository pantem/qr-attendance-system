const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const qrcode = require('qrcode');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Activity = require('../models/Activity');
const Terminal = require('../models/Terminal');
const AuditLog = require('../models/AuditLog');
const Admin = require('../models/Admin');
const crypto = require('crypto');
const { protect } = require('../middleware/auth');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Sembrar actividad por defecto si no existe ninguna
const seedActivities = async () => {
  try {
    const count = await Activity.countDocuments();
    if (count === 0) {
      await Activity.create({ name: 'Jornada Laboral' });
      console.log('Actividad por defecto (Jornada Laboral)');
    }
  } catch (error) {
    console.error('Error agregando actividades:', error);
  }
};
seedActivities();

const storage = multer.memoryStorage();
const upload = multer({ storage });

// Extrae el valor de un objeto usando múltiples posibles nombres de columna
const getColValue = (row, possibleNames) => {
  const key = Object.keys(row).find(k => possibleNames.includes(k.toLowerCase().trim()));
  return key ? row[key] : null;
};

// POST /api/users/upload - Sube Excel y genera/actualiza usuarios y QRs
router.post('/users/upload', protect, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se subió ningún archivo' });

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    if (data.length === 0) return res.status(400).json({ message: 'El archivo Excel está vacío' });

    let createdCount = 0;
    let updatedCount = 0;

    for (const row of data) {
      const name = getColValue(row, ['nombre', 'name', 'empleado']);
      let identifier = getColValue(row, ['identificador', 'identifier', 'id', 'codigo', 'código']);
      const area = getColValue(row, ['area', 'área', 'departamento', 'dept']);
      const position = getColValue(row, ['puesto', 'cargo', 'position']);

      // employeeType can be 'Base', 'Honorarios', or 'Otro' (Default 'Base')
      let rawType = getColValue(row, ['tipo', 'type', 'tipo de empleado', 'tipo empleado']);
      let employeeType = 'Base';
      if (rawType) {
        if (rawType.toString().toLowerCase().includes('honorario')) employeeType = 'Honorarios';
        else if (rawType.toString().toLowerCase().includes('otro')) employeeType = 'Otro';
      }

      if (!name) continue;

      if (!identifier) {
        identifier = `USER_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      } else {
        identifier = identifier.toString();
      }

      let user = await User.findOne({ identifier });

      const userData = {
        name: name.toString(),
        area: area ? area.toString() : 'General',
        position: position ? position.toString() : 'Empleado',
        employeeType: employeeType,
        isActive: true
      };

      if (!user) {
        const qrDataURL = await qrcode.toDataURL(identifier, { width: 512, errorCorrectionLevel: 'H', margin: 2 });
        user = new User({ ...userData, identifier, qrCode: qrDataURL });
        await user.save();
        createdCount++;
      } else {
        await User.updateOne({ identifier }, userData);
        updatedCount++;
      }
    }

    res.json({ message: `Se procesaron: ${createdCount} nuevos, ${updatedCount} actualizados.`, createdCount, updatedCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error procesando el archivo', error: error.message });
  }
});

// GET /api/users - Listar usuarios
router.get('/users', protect, async (req, res) => {
  try {
    const users = await User.find().sort({ isActive: -1, createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener usuarios', error: error.message });
  }
});

// POST /api/users - Crear usuario manual
router.post('/users', protect, async (req, res) => {
  try {
    const { name, identifier: customId, area, position, employeeType } = req.body;
    if (!name) return res.status(400).json({ message: 'El nombre es requerido' });

    let identifier = customId;
    if (!identifier) {
      identifier = `USER_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    } else {
      const exists = await User.findOne({ identifier });
      if (exists) return res.status(400).json({ message: 'Ese identificador ya está en uso' });
    }

    const qrDataURL = await qrcode.toDataURL(identifier, { width: 512, errorCorrectionLevel: 'H', margin: 2 });

    const newUser = new User({
      name, identifier, area, position, employeeType, qrCode: qrDataURL
    });

    await newUser.save();
    res.json({ message: 'Empleado guardado exitosamente', user: newUser });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear empleado', error: error.message });
  }
});

// PUT /api/users/:id - Actualizar usuario
router.put('/users/:id', protect, async (req, res) => {
  try {
    const { name, area, position, employeeType } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id,
      { name, area, position, employeeType },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'Empleado no encontrado' });
    res.json({ message: 'Empleado actualizado', user });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar', error: error.message });
  }
});

// PATCH /api/users/:id/status - Activar/Desactivar
router.patch('/users/:id/status', protect, async (req, res) => {
  try {
    const { isActive } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true });
    if (!user) return res.status(404).json({ message: 'Empleado no encontrado' });
    res.json({ message: `Empleado ${isActive ? 'activado' : 'desactivado'}`, user });
  } catch (error) {
    res.status(500).json({ message: 'Error al cambiar estado', error: error.message });
  }
});

// POST /api/attendance - Registrar asistencia
router.post('/attendance', async (req, res) => {
  try {
    const clientToken = req.headers['x-terminal-token'];
    if (!clientToken) {
      return res.status(403).json({ message: 'Este dispositivo no está autorizado para registrar asistencias.' });
    }

    const terminal = await Terminal.findOne({ token: clientToken, isActive: true });
    if (!terminal) {
      return res.status(403).json({ message: 'Este dispositivo no está autorizado o su acceso ha sido revocado.' });
    }

    const { identifier, photo, activity } = req.body;
    if (!identifier || !photo) return res.status(400).json({ message: 'Faltan datos' });

    const selectedActivity = activity || 'Jornada Laboral';

    const user = await User.findOne({ identifier });
    if (!user) return res.status(404).json({ message: 'Código no reconocido' });
    if (!user.isActive) return res.status(403).json({ message: 'El empleado está inactivo' });

    const lastAttendance = await Attendance.findOne({ user: user._id, activity: selectedActivity }).sort({ timestamp: -1 });
    
    // Evitar registros duplicados o accidentales en un intervalo menor a 15 segundos (cooldown)
    if (lastAttendance && (Date.now() - new Date(lastAttendance.timestamp).getTime()) < 15000) {
      return res.status(400).json({ 
        message: `Ya has registrado tu ${lastAttendance.type === 'Entrada' || lastAttendance.type === 'Inicio' ? 'entrada' : 'salida'} hace unos segundos. Por favor, espera.` 
      });
    }

    let type = 'Entrada';
    if (selectedActivity === 'Jornada Laboral') {
      if (lastAttendance && lastAttendance.type === 'Entrada') {
        type = 'Salida';
      }
    } else {
      type = 'Inicio';
      if (lastAttendance && lastAttendance.type === 'Inicio') {
        type = 'Fin';
      }
    }

    // Subir a Cloudinary
    let photoUrl = photo;
    if (photo.startsWith('data:image')) {
      const uploadRes = await cloudinary.uploader.upload(photo, { 
        folder: 'qr_attendance',
        transformation: [
          { width: 640, height: 480, crop: 'limit' },
          { quality: 'auto' },
          { fetch_format: 'auto' }
        ]
      });
      photoUrl = uploadRes.secure_url;
    }

    const newAttendance = new Attendance({
      user: user._id,
      type,
      photo: photoUrl,
      activity: selectedActivity,
      terminalName: terminal.name
    });
    await newAttendance.save();

    // Actualizar fecha de última actividad de la terminal
    terminal.lastActive = new Date();
    await terminal.save();

    res.json({ message: `Registro exitoso: ${type} - ${selectedActivity}`, attendance: newAttendance, userName: user.name });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al registrar asistencia', error: error.message });
  }
});

// GET /api/attendance - Listar registros
router.get('/attendance', protect, async (req, res) => {
  try {
    const records = await Attendance.find().populate('user', 'name identifier area position employeeType').sort({ timestamp: -1 });
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener registros', error: error.message });
  }
});

// GET /api/presence/status - Conteo y lista de personal dentro/fuera del edificio
router.get('/presence/status', protect, async (req, res) => {
  try {
    const activeUsersPresence = await User.aggregate([
      { $match: { isActive: true } },
      {
        $lookup: {
          from: "attendances",
          let: { userId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$user", "$$userId"] } } },
            { $sort: { timestamp: -1 } },
            { $limit: 1 }
          ],
          as: "lastAttendance"
        }
      },
      {
        $project: {
          name: 1,
          identifier: 1,
          area: 1,
          position: 1,
          lastRecord: { $arrayElemAt: ["$lastAttendance", 0] }
        }
      }
    ]);

    // Obtener actividades que marcan fuera del edificio
    const fieldActivities = await Activity.find({ marcaFueraEdificio: true });
    const fieldActivityNames = fieldActivities.map(a => a.name);

    let insideCount = 0;
    let outsideCount = 0;
    const insideList = [];
    const outsideList = [];

    for (const u of activeUsersPresence) {
      let isInside = false;
      const lastRecord = u.lastRecord;

      if (lastRecord) {
        if (lastRecord.type === 'Entrada') {
          isInside = true;
        } else if (lastRecord.type === 'Salida') {
          isInside = false;
        } else if (lastRecord.type === 'Fin') {
          isInside = true;
        } else if (lastRecord.type === 'Inicio') {
          if (fieldActivityNames.includes(lastRecord.activity)) {
            isInside = false;
          } else {
            isInside = true;
          }
        }
      }

      const userData = {
        _id: u._id,
        name: u.name,
        identifier: u.identifier,
        area: u.area,
        position: u.position,
        lastRecord: lastRecord ? {
          type: lastRecord.type,
          activity: lastRecord.activity,
          timestamp: lastRecord.timestamp
        } : null
      };

      if (isInside) {
        insideCount++;
        insideList.push(userData);
      } else {
        outsideCount++;
        outsideList.push(userData);
      }
    }

    res.json({
      insideCount,
      outsideCount,
      totalActiveUsers: activeUsersPresence.length,
      insideList,
      outsideList
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener estatus de presencia', error: error.message });
  }
});

// --- RUTAS DE ACTIVIDADES ---

// GET /api/activities - Listar actividades (Público para el escáner)
router.get('/activities', async (req, res) => {
  try {
    const activities = await Activity.find({ isActive: true }).sort({ name: 1 });
    res.json(activities);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener actividades', error: error.message });
  }
});

// GET /api/activities/all - Listar todas las actividades (Solo admin)
router.get('/activities/all', protect, async (req, res) => {
  try {
    const activities = await Activity.find().sort({ name: 1 });
    res.json(activities);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener actividades', error: error.message });
  }
});

// POST /api/activities - Crear actividad (Solo admin)
router.post('/activities', protect, async (req, res) => {
  try {
    const { name, marcaFueraEdificio } = req.body;
    if (!name) return res.status(400).json({ message: 'El nombre es requerido' });

    const exists = await Activity.findOne({ name });
    if (exists) return res.status(400).json({ message: 'La actividad ya existe' });

    const newActivity = new Activity({ 
      name, 
      marcaFueraEdificio: marcaFueraEdificio === true || marcaFueraEdificio === 'true'
    });
    await newActivity.save();

    res.json({ message: 'Actividad creada con éxito', activity: newActivity });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear actividad', error: error.message });
  }
});

// PUT /api/activities/:id - Editar actividad (Solo admin)
router.put('/activities/:id', protect, async (req, res) => {
  try {
    const { name, isActive, marcaFueraEdificio } = req.body;
    const activity = await Activity.findByIdAndUpdate(
      req.params.id, 
      { 
        name, 
        isActive, 
        marcaFueraEdificio: marcaFueraEdificio === true || marcaFueraEdificio === 'true'
      }, 
      { new: true }
    );
    if (!activity) return res.status(404).json({ message: 'Actividad no encontrada' });
    res.json({ message: 'Actividad actualizada', activity });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar', error: error.message });
  }
});

// DELETE /api/activities/:id - Eliminar actividad (Solo admin)
router.delete('/activities/:id', protect, async (req, res) => {
  try {
    const activity = await Activity.findByIdAndDelete(req.params.id);
    if (!activity) return res.status(404).json({ message: 'Actividad no encontrada' });
    res.json({ message: 'Actividad eliminada con éxito' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar', error: error.message });
  }
});

// GET /api/terminals/validate - Verificar si el token actual de la terminal es válido y está activo
router.get('/terminals/validate', async (req, res) => {
  try {
    const token = req.headers['x-terminal-token'];
    if (!token) {
      return res.status(401).json({ isValid: false, message: 'No se proporcionó token' });
    }
    const terminal = await Terminal.findOne({ token, isActive: true });
    if (!terminal) {
      return res.status(401).json({ isValid: false, message: 'Terminal no autorizada o inactiva' });
    }
    res.json({ isValid: true, terminalName: terminal.name });
  } catch (error) {
    res.status(500).json({ isValid: false, error: error.message });
  }
});

// --- Terminal endpoints (Solo admin) ---

// GET /api/terminals - Listar todas las terminales
router.get('/terminals', protect, async (req, res) => {
  try {
    const terminals = await Terminal.find().sort({ createdAt: -1 });
    res.json(terminals);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener terminales', error: error.message });
  }
});

// POST /api/terminals - Registrar una nueva terminal
router.post('/terminals', protect, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'El nombre de la terminal es requerido' });

    const exists = await Terminal.findOne({ name: name.trim() });
    if (exists) return res.status(400).json({ message: 'Ya existe una terminal registrada con este nombre' });

    // Generar un token criptográfico seguro
    const token = crypto.randomBytes(24).toString('hex');

    const newTerminal = new Terminal({
      name: name.trim(),
      token
    });

    await newTerminal.save();
    res.json({ message: 'Terminal registrada con éxito', terminal: newTerminal });
  } catch (error) {
    res.status(500).json({ message: 'Error al registrar la terminal', error: error.message });
  }
});

// PATCH /api/terminals/:id/status - Activar/desactivar terminal
router.patch('/terminals/:id/status', protect, async (req, res) => {
  try {
    const { isActive } = req.body;
    const terminal = await Terminal.findByIdAndUpdate(req.params.id, { isActive }, { new: true });
    if (!terminal) return res.status(404).json({ message: 'Terminal no encontrada' });
    res.json({ message: `Terminal ${isActive ? 'activada' : 'desactivada'} con éxito`, terminal });
  } catch (error) {
    res.status(500).json({ message: 'Error al cambiar estado de la terminal', error: error.message });
  }
});

// DELETE /api/terminals/:id - Eliminar/Revocar terminal
router.delete('/terminals/:id', protect, async (req, res) => {
  try {
    const terminal = await Terminal.findByIdAndDelete(req.params.id);
    if (!terminal) return res.status(404).json({ message: 'Terminal no encontrada' });
    res.json({ message: 'Terminal revocada y eliminada con éxito' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar la terminal', error: error.message });
  }
});

// GET /api/audit - Obtener registros de auditoría
router.get('/audit', protect, async (req, res) => {
  try {
    const logs = await AuditLog.find().sort({ timestamp: -1 });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener registros de auditoría', error: error.message });
  }
});

// POST /api/audit/export - Registrar exportación y subir respaldo a Cloudinary
router.post('/audit/export', protect, async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    let query = {};
    let rangeDetails = 'Todos los registros';

    if (startDate && endDate) {
      const start = new Date(startDate + "T00:00:00");
      const end = new Date(endDate + "T23:59:59");
      query.timestamp = { $gte: start, $lte: end };
      rangeDetails = `Rango: ${startDate} al ${endDate}`;
    }

    const records = await Attendance.find(query).populate('user').sort({ timestamp: -1 });

    // Preparar filas para Excel
    const rows = records.map(record => ({
      'Empleado': record.user ? record.user.name : 'Desconocido',
      'Identificador': record.user ? record.user.identifier : '-',
      'Área': record.user ? record.user.area : '-',
      'Puesto': record.user ? record.user.position : '-',
      'Tipo de Registro': record.type,
      'Actividad': record.activity || 'Jornada Laboral',
      'Terminal': record.terminalName || 'Web App / Desconocido',
      'Fecha y Hora': new Date(record.timestamp).toLocaleString(),
      'Fotografía URL': record.photo || 'Sin fotografía'
    }));

    // Generar libro de trabajo con xlsx
    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Asistencias");
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Subir a Cloudinary (resource_type: raw)
    const uploadStreamPromise = (fileBuffer, filename) => new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          folder: 'attendance_backups',
          public_id: filename
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result.secure_url);
        }
      );
      stream.end(fileBuffer);
    });

    const filename = `Reporte_Asistencias_${Date.now()}.xlsx`;
    const backupUrl = await uploadStreamPromise(buffer, filename);

    // Crear registro de auditoría
    const adminUser = await Admin.findById(req.adminId);
    const username = adminUser ? adminUser.username : 'admin';

    const newLog = new AuditLog({
      username,
      action: 'Exportar',
      details: `Exportó ${records.length} asistencias en Excel. ${rangeDetails}.`,
      backupUrl
    });
    await newLog.save();

    res.json({ backupUrl, count: records.length });
  } catch (error) {
    res.status(500).json({ message: 'Error al procesar exportación y respaldo', error: error.message });
  }
});

// GET /api/audit/export - Descargar Excel directamente como fallback o enlace directo
router.get('/audit/export', protect, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let query = {};
    let rangeDetails = 'Todos los registros';

    if (startDate && endDate) {
      const start = new Date(startDate + "T00:00:00");
      const end = new Date(endDate + "T23:59:59");
      query.timestamp = { $gte: start, $lte: end };
      rangeDetails = `Rango: ${startDate} al ${endDate}`;
    }

    const records = await Attendance.find(query).populate('user').sort({ timestamp: -1 });

    const rows = records.map(record => ({
      'Empleado': record.user ? record.user.name : 'Desconocido',
      'Identificador': record.user ? record.user.identifier : '-',
      'Área': record.user ? record.user.area : '-',
      'Puesto': record.user ? record.user.position : '-',
      'Tipo de Registro': record.type,
      'Actividad': record.activity || 'Jornada Laboral',
      'Terminal': record.terminalName || 'Web App / Desconocido',
      'Fecha y Hora': new Date(record.timestamp).toLocaleString(),
      'Fotografía URL': record.photo || 'Sin fotografía'
    }));

    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Asistencias");
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Asistencias_${startDate || 'todas'}_a_${endDate || 'todas'}.xlsx`);
    res.send(buffer);
  } catch (error) {
    res.status(500).send('Error al exportar archivo: ' + error.message);
  }
});

// DELETE /api/attendance/purge - Borrar físicamente asistencias y fotos en Cloudinary
router.delete('/attendance/purge', protect, async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Las fechas inicial y final son obligatorias para borrar.' });
    }

    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T23:59:59");

    const records = await Attendance.find({ timestamp: { $gte: start, $lte: end } });
    if (records.length === 0) {
      return res.status(404).json({ message: 'No hay asistencias registradas en el rango de fechas indicado.' });
    }

    // Extraer Public IDs de Cloudinary
    const extractPublicId = (url) => {
      const parts = url.split('/');
      const folderIndex = parts.indexOf('qr_attendance');
      if (folderIndex !== -1) {
        const filename = parts.slice(folderIndex).join('/');
        return filename.split('.')[0]; // Eliminar extensión .jpg
      }
      return null;
    };

    const publicIds = records
      .map(r => r.photo ? extractPublicId(r.photo) : null)
      .filter(id => id !== null);

    // Borrado físico de fotos en Cloudinary
    if (publicIds.length > 0) {
      await cloudinary.api.delete_resources(publicIds);
    }

    // Borrado físico en MongoDB
    await Attendance.deleteMany({ timestamp: { $gte: start, $lte: end } });

    // Crear registro de auditoría
    const adminUser = await Admin.findById(req.adminId);
    const username = adminUser ? adminUser.username : 'admin';

    const newLog = new AuditLog({
      username,
      action: 'Eliminar',
      details: `Se eliminaron físicamente ${records.length} asistencias y ${publicIds.length} fotos de Cloudinary. Rango: ${startDate} al ${endDate}.`
    });
    await newLog.save();

    res.json({ message: `Eliminación exitosa. Se eliminaron físicamente ${records.length} asistencias y ${publicIds.length} fotos del servidor.` });
  } catch (error) {
    res.status(500).json({ message: 'Error al borrar los registros de asistencia', error: error.message });
  }
});

module.exports = router;
