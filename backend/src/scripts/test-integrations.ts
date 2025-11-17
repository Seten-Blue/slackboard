import dotenv from 'dotenv';
import slackService from '../services/slackService';
import geminiService from '../services/geminiService';
import trelloService from '../services/trelloService';

dotenv.config();

const testIntegrations = async () => {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 PROBANDO INTEGRACIONES DE SLACKBOARD');
  console.log('='.repeat(70) + '\n');

  let allPassed = true;

  // Test Slack
  console.log('📌 SLACK');
  console.log('-'.repeat(70));
  if (slackService.isConfigured()) {
    console.log('✅ Slack está configurado correctamente');
    try {
      console.log('🔄 Intentando obtener canales de Slack...');
      const channels = await slackService.syncChannels();
      console.log(`✅ ${channels.length} canales encontrados en Slack`);
      if (channels.length > 0) {
        console.log('   Primeros 5 canales:');
        channels.slice(0, 5).forEach((ch: any) => {
          console.log(`   • #${ch.name}`);
        });
      }
    } catch (error: any) {
      console.error('❌ Error al conectar con Slack:', error.message);
      allPassed = false;
    }
  } else {
    console.log('❌ Slack NO está configurado');
    console.log('   Acción requerida: Agregar SLACK_BOT_TOKEN en .env');
    console.log('   Obtener token en: https://api.slack.com/apps');
    allPassed = false;
  }

  // Test Gemini AI
  console.log('\n📌 GEMINI AI');
  console.log('-'.repeat(70));
  if (geminiService.isConfigured()) {
    console.log('✅ Gemini AI está configurado correctamente');
    try {
      console.log('🤖 Probando generación de respuesta...');
      const response = await geminiService.chat(
        'test-user',
        '¿Cuál es la capital de Colombia? Responde en máximo 10 palabras.'
      );
      console.log('✅ Respuesta de Gemini AI:');
      console.log(`   "${response.substring(0, 150)}${response.length > 150 ? '...' : ''}"`);
    } catch (error: any) {
      console.error('❌ Error al conectar con Gemini AI:', error.message);
      allPassed = false;
    }
  } else {
    console.log('❌ Gemini AI NO está configurado');
    console.log('   Acción requerida: Agregar GEMINI_API_KEY en .env');
    console.log('   Obtener API key en: https://makersuite.google.com/app/apikey');
    allPassed = false;
  }

  // Test Trello
  console.log('\n📌 TRELLO');
  console.log('-'.repeat(70));
  if (trelloService.isConfigured()) {
    console.log('✅ Trello está configurado correctamente');
    try {
      console.log('🔄 Intentando obtener tableros de Trello...');
      const boards = await trelloService.getBoards();
      console.log(`✅ ${boards.length} tableros encontrados en Trello`);
      if (boards.length > 0) {
        console.log('   Tus tableros:');
        boards.slice(0, 5).forEach((board: any) => {
          console.log(`   • ${board.name} (ID: ${board.id})`);
        });
        console.log('\n   💡 Copia un ID de board y agrégalo como TRELLO_BOARD_ID en .env');
      } else {
        console.log('   ⚠️  No tienes tableros en Trello');
      }
    } catch (error: any) {
      console.error('❌ Error al conectar con Trello:', error.message);
      if (error.message.includes('invalid key')) {
        console.log('   💡 Tu TRELLO_API_KEY es inválida. Verifica en:');
        console.log('      https://trello.com/power-ups/admin');
      }
      allPassed = false;
    }
  } else {
    console.log('❌ Trello NO está configurado');
    console.log('   Acción requerida: Agregar TRELLO_API_KEY y TRELLO_API_TOKEN en .env');
    console.log('   Obtener credenciales en: https://trello.com/power-ups/admin');
    allPassed = false;
  }

  // Test Google Calendar
  console.log('\n📌 GOOGLE CALENDAR');
  console.log('-'.repeat(70));
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    console.log('✅ Google Calendar está configurado');
    console.log('   Para completar la configuración:');
    console.log('   1. Inicia el backend: npm run dev');
    console.log('   2. Visita: http://localhost:3000/api/calendar/authorize');
    console.log('   3. Copia la URL de autorización y ábrela en el navegador');
    console.log('   4. Autoriza la aplicación');
  } else {
    console.log('❌ Google Calendar NO está configurado');
    console.log('   Acción requerida: Agregar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env');
    console.log('   Obtener credenciales en: https://console.cloud.google.com/');
    allPassed = false;
  }

  // Resumen final
  console.log('\n' + '='.repeat(70));
  if (allPassed) {
    console.log('✅ TODAS LAS INTEGRACIONES FUNCIONANDO CORRECTAMENTE');
  } else {
    console.log('⚠️  ALGUNAS INTEGRACIONES REQUIEREN CONFIGURACIÓN');
  }
  console.log('='.repeat(70) + '\n');

  process.exit(allPassed ? 0 : 1);
};

testIntegrations().catch((error) => {
  console.error('❌ Error ejecutando pruebas:', error);
  process.exit(1);
});
