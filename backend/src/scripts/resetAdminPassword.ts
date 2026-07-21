import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';

dotenv.config();

async function run() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error('Uso: node dist/scripts/resetAdminPassword.js <email> <nuevaContrasena>');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI || '');

  const user: any = await User.findOne({ email });
  if (!user) {
    console.error(`❌ No se encontro ningun usuario con email ${email}`);
    process.exit(1);
  }

  user.password = newPassword; // el pre-save hook del modelo lo hashea automaticamente
  await user.save();

  console.log(`✅ Contrasena actualizada para ${email}. Ya puedes iniciar sesion con la nueva contrasena.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});