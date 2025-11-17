import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';
import Channel from '../models/Channel';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/slackboard';

const seedData = async () => {
  try {
    console.log('🌱 Iniciando seed de datos...\n');

    // Conectar a MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Verificar si ya hay datos
    const existingUsers = await User.countDocuments();
    if (existingUsers > 0) {
      console.log('⚠️  Ya existen datos en la base de datos');
      console.log(`   Usuarios: ${existingUsers}`);
      const existingChannels = await Channel.countDocuments();
      console.log(`   Canales: ${existingChannels}`);
      console.log('\n¿Deseas continuar y crear más datos? Los datos existentes no se eliminarán.\n');
    }

    // Crear usuarios de prueba
    console.log('👥 Creando usuarios...');
    const users = await User.create([
      {
        email: 'admin@slackboard.com',
        username: 'Admin',
        password: 'admin123',
        role: 'admin',
        status: 'online',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin'
      },
      {
        email: 'juan@slackboard.com',
        username: 'Juan',
        password: 'juan123',
        role: 'user',
        status: 'online',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=juan'
      },
      {
        email: 'maria@slackboard.com',
        username: 'Maria',
        password: 'maria123',
        role: 'user',
        status: 'online',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=maria'
      },
      {
        email: 'carlos@slackboard.com',
        username: 'Carlos',
        password: 'carlos123',
        role: 'user',
        status: 'away',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=carlos'
      },
      {
        email: 'ana@slackboard.com',
        username: 'Ana',
        password: 'ana123',
        role: 'user',
        status: 'online',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ana'
      }
    ]);

    console.log(`✅ ${users.length} usuarios creados`);

    // Crear canales de prueba
    console.log('📢 Creando canales...');
    const adminUser = users[0];
    const channels = await Channel.create([
      {
        name: 'general',
        description: 'Canal general para todos',
        isPrivate: false,
        members: users.map(u => u._id),
        createdBy: adminUser._id
      },
      {
        name: 'desarrollo',
        description: 'Discusiones sobre desarrollo',
        isPrivate: false,
        members: [users[0]._id, users[1]._id, users[2]._id],
        createdBy: adminUser._id
      },
      {
        name: 'marketing',
        description: 'Estrategias de marketing',
        isPrivate: false,
        members: [users[0]._id, users[2]._id, users[3]._id],
        createdBy: adminUser._id
      },
      {
        name: 'random',
        description: 'Conversaciones casuales',
        isPrivate: false,
        members: users.map(u => u._id),
        createdBy: adminUser._id
      },
      {
        name: 'soporte',
        description: 'Canal de soporte técnico',
        isPrivate: false,
        members: [users[0]._id, users[1]._id, users[4]._id],
        createdBy: adminUser._id
      },
      {
        name: 'privado-admin',
        description: 'Canal privado de administración',
        isPrivate: true,
        members: [adminUser._id],
        createdBy: adminUser._id
      }
    ]);

    console.log(`✅ ${channels.length} canales creados`);

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE DATOS CREADOS');
    console.log('='.repeat(60));
    console.log('\n👥 USUARIOS:');
    users.forEach(u => {
      console.log(`   • ${u.username.padEnd(10)} - ${u.email.padEnd(25)} (${u.role})`);
    });
    console.log('\n📢 CANALES:');
    channels.forEach(c => {
      const privacy = c.isPrivate ? '🔒 Privado' : '🌐 Público';
      console.log(`   • #${c.name.padEnd(15)} - ${privacy.padEnd(12)} - ${c.members.length} miembros`);
    });
    console.log('\n' + '='.repeat(60));
    console.log('✅ Seed completado exitosamente!');
    console.log('='.repeat(60));
    console.log('\n🔑 CREDENCIALES DE ACCESO:');
    console.log('   Email:    admin@slackboard.com');
    console.log('   Password: admin123');
    console.log('\n💡 Usa estas credenciales para iniciar sesión en la aplicación\n');

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error en seed:', error.message);
    process.exit(1);
  }
};

seedData();
