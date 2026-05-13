const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const qrcode = require('qrcode');
const User = require('../models/User');
const Attendance = require('../models/Attendance');

const storage = multer.memoryStorage();
const upload = multer({ storage });

// Extrae el valor de un objeto usando múltiples posibles nombres de columna
const getColValue = (row, possibleNames) => {
  const key = Object.keys(row).find(k => possibleNames.includes(k.toLowerCase().trim()));
  return key ? row[key] : null;
};

// POST /api/users/upload - Sube Excel y genera/actualiza usuarios y QRs
router.post('/users/upload', upload.single('file'), async (req, res) => {
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
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().sort({ isActive: -1, createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener usuarios', error: error.message });
  }
});

// POST /api/users - Crear usuario manual
router.post('/users', async (req, res) => {
  try {
    const { name, area, position, employeeType } = req.body;
    if (!name) return res.status(400).json({ message: 'El nombre es requerido' });

    const identifier = `USER_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
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
router.put('/users/:id', async (req, res) => {
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
router.patch('/users/:id/status', async (req, res) => {
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
    const { identifier, photo } = req.body;
    if (!identifier || !photo) return res.status(400).json({ message: 'Faltan datos' });

    const user = await User.findOne({ identifier });
    if (!user) return res.status(404).json({ message: 'Código no reconocido' });
    if (!user.isActive) return res.status(403).json({ message: 'El empleado está inactivo' });

    const lastAttendance = await Attendance.findOne({ user: user._id }).sort({ timestamp: -1 });
    let type = 'Entrada';
    if (lastAttendance && lastAttendance.type === 'Entrada') {
      type = 'Salida';
    }

    const newAttendance = new Attendance({ user: user._id, type, photo });
    await newAttendance.save();

    res.json({ message: `Registro exitoso: ${type}`, attendance: newAttendance, userName: user.name });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al registrar asistencia', error: error.message });
  }
});

// GET /api/attendance - Listar registros
router.get('/attendance', async (req, res) => {
  try {
    const records = await Attendance.find().populate('user', 'name identifier area position employeeType').sort({ timestamp: -1 });
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener registros', error: error.message });
  }
});

module.exports = router;
