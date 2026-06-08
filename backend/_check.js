const mongoose = require('mongoose');
const User = require('./models/User');
const Activity = require('./models/Activity');
const Attendance = require('./models/Attendance');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const user = await User.findOne({ _id: '6a220620e137fd7b58fa5779' });
  console.log('User:', user ? user.name : 'not found');

  const fieldActivities = await Activity.find({ marcaFueraEdificio: true });
  const fieldActivityNames = fieldActivities.map(a => a.name);
  console.log('Field activities (marcaFueraEdificio=true):', fieldActivityNames);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const agg = await User.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId('6a220620e137fd7b58fa5779') } },
    {
      $lookup: {
        from: "attendances",
        let: { userId: "$_id", today: startOfToday },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: ["$user", "$$userId"] },
            { $gte: ["$timestamp", "$$today"] }
          ] } } },
          { $sort: { timestamp: -1 } },
          { $limit: 1 }
        ],
        as: "lastAttendance"
      }
    },
    {
      $project: {
        name: 1,
        lastRecord: { $arrayElemAt: ["$lastAttendance", 0] }
      }
    }
  ]);

  console.log('Aggregation result:', JSON.stringify(agg[0]?.lastRecord || null, null, 2));

  // Simulate the logic
  const lastRecord = agg[0]?.lastRecord;
  if (!lastRecord) {
    console.log('No lastRecord -> would be SKIPPED');
  } else {
    let isInside = false;
    if (lastRecord.type === 'Entrada') isInside = true;
    else if (lastRecord.type === 'Salida') isInside = false;
    else if (lastRecord.type === 'Fin') isInside = true;
    else if (lastRecord.type === 'Inicio') {
      if (fieldActivityNames.includes(lastRecord.activity)) {
        isInside = false;
        console.log('Inicio with field activity -> OUTSIDE');
      } else {
        isInside = true;
        console.log('Inicio with non-field activity -> INSIDE');
      }
    }
    console.log('Final status:', isInside ? 'INSIDE' : 'OUTSIDE');
  }

  mongoose.disconnect();
});
