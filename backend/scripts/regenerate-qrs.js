require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const qrcode = require('qrcode');
const User = require('../models/User');

const QR_OPTIONS = { width: 512, errorCorrectionLevel: 'H', margin: 2 };

async function regenerate() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/qr-attendance');
  console.log('Conectado a MongoDB');

  const users = await User.find({ qrCode: { $exists: true, $ne: null } });
  console.log(`Usuarios encontrados: ${users.length}`);

  let updated = 0;
  for (const user of users) {
    try {
      const qrDataURL = await qrcode.toDataURL(user.identifier, QR_OPTIONS);
      await User.updateOne({ _id: user._id }, { $set: { qrCode: qrDataURL } });
      updated++;
      if (updated % 10 === 0) console.log(`${updated}/${users.length} actualizados...`);
    } catch (err) {
      console.error(`Error con ${user.identifier}: ${err.message}`);
    }
  }

  console.log(`Completado: ${updated} QRs regenerados`);
  await mongoose.disconnect();
}

regenerate().catch(err => { console.error(err); process.exit(1); });
