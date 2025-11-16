"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const User_1 = __importDefault(require("./models/User"));
const Channel_1 = __importDefault(require("./models/Channel"));
const Message_1 = __importDefault(require("./models/Message"));
const Analytics_1 = __importDefault(require("./models/Analytics"));
dotenv_1.default.config();
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/slackboard';
const seedData = async () => {
    try {
        // Conectar a MongoDB
        await mongoose_1.default.connect(MONGODB_URI);
        console.log('✅ Conectado a MongoDB');
        // Limpiar datos existentes
        await User_1.default.deleteMany({});
        await Channel_1.default.deleteMany({});
        await Message_1.default.deleteMany({});
        await Analytics_1.default.deleteMany({});
        console.log('🗑️  Base de datos limpiada');
        // Crear usuarios
        const users = await User_1.default.create([
            {
                email: 'admin@slackboard.com',
                username: 'Admin',
                password: 'admin123',
                avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin',
                status: 'online',
                role: 'admin',
            },
            {
                email: 'juan@slackboard.com',
                username: 'Juan',
                password: 'juan123',
                avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Juan',
                status: 'online',
                role: 'user',
            },
            {
                email: 'maria@slackboard.com',
                username: 'Maria',
                password: 'maria123',
                avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Maria',
                status: 'online',
                role: 'user',
            },
            {
                email: 'carlos@slackboard.com',
                username: 'Carlos',
                password: 'carlos123',
                avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos',
                status: 'away',
                role: 'user',
            },
            {
                email: 'ana@slackboard.com',
                username: 'Ana',
                password: 'ana123',
                avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ana',
                status: 'offline',
                role: 'user',
            },
        ]);
        console.log(`✅ ${users.length} usuarios creados`);
        // Crear canales
        const channels = await Channel_1.default.create([
            {
                name: 'general',
                description: 'Canal general para todo el equipo',
                isPrivate: false,
                members: users.map((u) => u._id),
                createdBy: users[0]._id,
            },
            {
                name: 'desarrollo',
                description: 'Canal para el equipo de desarrollo',
                isPrivate: false,
                members: [users[0]._id, users[1]._id, users[2]._id],
                createdBy: users[0]._id,
            },
            {
                name: 'marketing',
                description: 'Estrategias y campañas de marketing',
                isPrivate: false,
                members: [users[0]._id, users[3]._id, users[4]._id],
                createdBy: users[0]._id,
            },
            {
                name: 'proyectos',
                description: 'Seguimiento de proyectos activos',
                isPrivate: true,
                members: [users[0]._id, users[1]._id],
                createdBy: users[0]._id,
            },
        ]);
        console.log(`✅ ${channels.length} canales creados`);
        // Crear mensajes en el canal general
        const generalMessages = [
            {
                content: '¡Bienvenidos a SlackBoard! 🚀',
                channel: channels[0]._id,
                sender: users[0]._id,
                type: 'text',
            },
            {
                content: '¡Hola a todos! Muy emocionado de estar aquí',
                channel: channels[0]._id,
                sender: users[1]._id,
                type: 'text',
            },
            {
                content: '¿Alguien ha probado las nuevas funciones?',
                channel: channels[0]._id,
                sender: users[2]._id,
                type: 'text',
            },
            {
                content: 'Sí, el dashboard se ve increíble 📊',
                channel: channels[0]._id,
                sender: users[3]._id,
                type: 'text',
            },
            {
                content: 'Totalmente de acuerdo, gran trabajo del equipo',
                channel: channels[0]._id,
                sender: users[4]._id,
                type: 'text',
            },
        ];
        // Crear mensajes en el canal desarrollo
        const devMessages = [
            {
                content: 'Necesitamos revisar el código del módulo de analytics',
                channel: channels[1]._id,
                sender: users[0]._id,
                type: 'text',
            },
            {
                content: 'Ya estoy trabajando en eso, debería estar listo hoy',
                channel: channels[1]._id,
                sender: users[1]._id,
                type: 'text',
            },
            {
                content: '¿Alguien puede ayudarme con la integración de Socket.IO?',
                channel: channels[1]._id,
                sender: users[2]._id,
                type: 'text',
            },
        ];
        // Crear mensajes en el canal marketing
        const marketingMessages = [
            {
                content: 'Tenemos que planear la campaña de lanzamiento',
                channel: channels[2]._id,
                sender: users[3]._id,
                type: 'text',
            },
            {
                content: 'Ya tengo algunas ideas, les comparto el documento',
                channel: channels[2]._id,
                sender: users[4]._id,
                type: 'text',
            },
        ];
        const allMessages = [...generalMessages, ...devMessages, ...marketingMessages];
        const messages = await Message_1.default.create(allMessages);
        console.log(`✅ ${messages.length} mensajes creados`);
        // Crear analytics de ejemplo
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        await Analytics_1.default.create({
            date: today,
            activeUsers: 5,
            totalMessages: messages.length,
            totalChannels: channels.length,
            messagesPerChannel: [
                {
                    channelId: channels[0]._id,
                    channelName: 'general',
                    count: 5,
                },
                {
                    channelId: channels[1]._id,
                    channelName: 'desarrollo',
                    count: 3,
                },
                {
                    channelId: channels[2]._id,
                    channelName: 'marketing',
                    count: 2,
                },
            ],
            topUsers: [
                {
                    userId: users[0]._id,
                    username: 'Admin',
                    messageCount: 3,
                },
                {
                    userId: users[1]._id,
                    username: 'Juan',
                    messageCount: 2,
                },
            ],
            peakHours: [
                { hour: 9, messageCount: 2 },
                { hour: 10, messageCount: 3 },
                { hour: 14, messageCount: 2 },
                { hour: 16, messageCount: 3 },
            ],
        });
        console.log('✅ Analytics creado');
        console.log('\n🎉 ¡Datos de prueba creados exitosamente!\n');
        console.log('📊 Resumen:');
        console.log(`   - Usuarios: ${users.length}`);
        console.log(`   - Canales: ${channels.length}`);
        console.log(`   - Mensajes: ${messages.length}`);
        console.log('\n💡 Puedes probar los endpoints:');
        console.log('   - GET http://localhost:3000/api/channels');
        console.log('   - GET http://localhost:3000/api/messages/channel/' + channels[0]._id);
        console.log('   - GET http://localhost:3000/api/analytics\n');
        process.exit(0);
    }
    catch (error) {
        console.error('❌ Error creando datos:', error);
        process.exit(1);
    }
};
seedData();
