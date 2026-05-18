const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const qrcode = require('qrcode');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Activity = require('../models/Activity');
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
      console.log('Actividad por defecto sembrada (Jornada Laboral)');
    }
  } catch (error) {
    console.error('Error sembrando actividades:', error);
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
        const qrDataURL = await qrcode.toDataURL(identifier);
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

    const qrDataURL = await qrcode.toDataURL(identifier);

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
    const serverToken = process.env.TERMINAL_TOKEN || 'default-terminal-token';
    if (clientToken !== serverToken) {
      return res.status(403).json({ message: 'Este dispositivo no está autorizado para registrar asistencias.' });
    }

    const { identifier, photo, activity } = req.body;
    if (!identifier || !photo) return res.status(400).json({ message: 'Faltan datos' });

    const selectedActivity = activity || 'Jornada Laboral';

    const user = await User.findOne({ identifier });
    if (!user) return res.status(404).json({ message: 'Código no reconocido' });
    if (!user.isActive) return res.status(403).json({ message: 'El empleado está inactivo' });

    const lastAttendance = await Attendance.findOne({ user: user._id, activity: selectedActivity }).sort({ timestamp: -1 });
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
      const uploadRes = await cloudinary.uploader.upload(photo, { folder: 'qr_attendance' });
      photoUrl = uploadRes.secure_url;
    }

    const newAttendance = new Attendance({ user: user._id, type, photo: photoUrl, activity: selectedActivity });
    await newAttendance.save();

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
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'El nombre es requerido' });

    const exists = await Activity.findOne({ name });
    if (exists) return res.status(400).json({ message: 'La actividad ya existe' });

    const newActivity = new Activity({ name });
    await newActivity.save();

    res.json({ message: 'Actividad creada con éxito', activity: newActivity });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear actividad', error: error.message });
  }
});

// PUT /api/activities/:id - Editar actividad (Solo admin)
router.put('/activities/:id', protect, async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const activity = await Activity.findByIdAndUpdate(req.params.id, { name, isActive }, { new: true });
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

// GET /api/terminal/token - Obtener token de terminal (Solo admin)
router.get('/terminal/token', protect, (req, res) => {
  res.json({ token: process.env.TERMINAL_TOKEN || 'default-terminal-token' });
});

module.exports = router;
