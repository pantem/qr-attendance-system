const mongoose = require('mongoose');
const Attendance = require('./models/Attendance');
const User = require('./models/User');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const user = await User.findOne({ name: /Nina/i });
  console.log('User:', JSON.stringify(user, null, 2));

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const records = await Attendance.find({ user: user._id }).sort({ timestamp: -1 }).limit(10);
  console.log('\nAll records:', JSON.stringify(records.map(r => ({ type: r.type, activity: r.activity, timestamp: r.timestamp })), null, 2));

  const todayRecords = await Attendance.find({ user: user._id, timestamp: { $gte: startOfToday } }).sort({ timestamp: -1 }).limit(10);
  console.log('\nToday records:', JSON.stringify(todayRecords.map(r => ({ type: r.type, activity: r.activity, timestamp: r.timestamp })), null, 2));

  mongoose.disconnect();
});
