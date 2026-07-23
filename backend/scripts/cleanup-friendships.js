/**
 * Script de limpieza: elimina solicitudes de amistad donde userA === userB
 * y verifica cuentas duplicadas.
 *
 * Ejecutar con: node backend/scripts/cleanup-friendships.js
 */
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@localhost:27017/slackboard?authSource=admin';

const friendshipSchema = new mongoose.Schema({}, { strict: false, collection: 'friendships' });
const Friendship = mongoose.model('Friendship', friendshipSchema);

const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const User = mongoose.model('User', userSchema);

async function cleanup() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // 1. Eliminar amistades donde userA === userB (auto-solicitudes)
  const selfRef = await Friendship.deleteMany({
    $expr: { $eq: ['$userA', '$userB'] }
  });
  console.log(`Deleted ${selfRef.deletedCount} self-referencing friendships`);

  // 2. Buscar duplicados: misma pareja userA+userB
  const duplicates = await Friendship.aggregate([
    { $group: { _id: { userA: '$userA', userB: '$userB' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } }
  ]);
  for (const dup of duplicates) {
    const toRemove = dup.ids.slice(1); // keep first, remove rest
    await Friendship.deleteMany({ _id: { $in: toRemove } });
    console.log(`Removed ${toRemove.length} duplicate friendship(s) for pair ${dup._id.userA}+${dup._id.userB}`);
  }
  if (duplicates.length === 0) console.log('No duplicate friendship pairs found');

  // 3. Buscar usuarios duplicados (mismo email o mismo username)
  const emailDups = await User.aggregate([
    { $group: { _id: '$email', count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { _id: { $ne: null }, count: { $gt: 1 } } }
  ]);
  for (const dup of emailDups) {
    const toRemove = dup.ids.slice(1);
    await User.deleteMany({ _id: { $in: toRemove } });
    console.log(`Removed ${toRemove.length} duplicate user(s) with email ${dup._id}`);
  }
  if (emailDups.length === 0) console.log('No duplicate users by email');

  const userDups = await User.aggregate([
    { $group: { _id: '$username', count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { _id: { $ne: null }, count: { $gt: 1 } } }
  ]);
  for (const dup of userDups) {
    // Keep the one with most data (avatar, status, etc.)
    const users = await User.find({ _id: { $in: dup.ids } }).sort({ updatedAt: -1 });
    const toRemove = users.slice(1).map(u => u._id);
    if (toRemove.length > 0) {
      await User.deleteMany({ _id: { $in: toRemove } });
      console.log(`Removed ${toRemove.length} duplicate user(s) with username "${dup._id}"`);
    }
  }
  if (userDups.length === 0) console.log('No duplicate users by username');

  // 4. Show current friendships for debugging
  const all = await Friendship.find({}).lean();
  const userIds = new Set();
  for (const f of all) {
    userIds.add(String(f.userA));
    userIds.add(String(f.userB));
    userIds.add(String(f.initiator));
  }
  const userMap = {};
  if (userIds.size > 0) {
    const users = await User.find({ _id: { $in: [...userIds] } }).select('username email').lean();
    for (const u of users) userMap[String(u._id)] = u.username || u.email;
  }
  console.log(`\n--- All friendships (${all.length}) ---`);
  for (const f of all) {
    const a = userMap[String(f.userA)] || String(f.userA);
    const b = userMap[String(f.userB)] || String(f.userB);
    const init = userMap[String(f.initiator)] || String(f.initiator);
    console.log(`  ${a} <-> ${b} | status=${f.status} | initiator=${init} | id=${f._id}`);
  }

  // 5. Show all users
  const users = await User.find({}).select('username email status').lean();
  console.log(`\n--- All users (${users.length}) ---`);
  for (const u of users) {
    console.log(`  ${u.username} (${u.email}) - ${u.status} - id=${u._id}`);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

cleanup().catch(err => { console.error(err); process.exit(1); });
