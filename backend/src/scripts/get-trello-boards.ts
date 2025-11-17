import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const getTrelloBoards = async () => {
  const apiKey = process.env.TRELLO_API_KEY;
  const apiToken = process.env.TRELLO_API_TOKEN;

  console.log('\n' + '='.repeat(80));
  console.log('📋 OBTENER BOARDS DE TRELLO');
  console.log('='.repeat(80) + '\n');

  if (!apiKey || !apiToken) {
    console.error('❌ Error: Faltan credenciales de Trello');
    console.log('\n📝 Acción requerida:');
    console.log('   1. Ve a: https://trello.com/power-ups/admin');
    console.log('   2. Crea un nuevo Power-Up o usa uno existente');
    console.log('   3. Copia tu API Key');
    console.log('   4. Genera un Token (haz clic en "Token" junto a la API Key)');
    console.log('   5. Agrega ambos a tu archivo .env:');
    console.log('      TRELLO_API_KEY=tu-api-key-aqui');
    console.log('      TRELLO_API_TOKEN=tu-token-aqui\n');
    process.exit(1);
  }

  console.log('🔍 Conectando con Trello...');
  console.log(`   API Key: ${apiKey.substring(0, 10)}...`);
  console.log(`   Token: ${apiToken.substring(0, 10)}...\n`);

  try {
    const response = await axios.get(
      'https://api.trello.com/1/members/me/boards',
      {
        params: {
          key: apiKey,
          token: apiToken,
          fields: 'id,name,url,closed,desc'
        }
      }
    );

    const boards = response.data.filter((b: any) => !b.closed);

    if (boards.length === 0) {
      console.log('⚠️  No se encontraron tableros en tu cuenta de Trello');
      console.log('   Crea un tablero en: https://trello.com/\n');
      process.exit(0);
    }

    console.log(`✅ ${boards.length} tableros encontrados en Trello\n`);
    console.log('='.repeat(80));

    boards.forEach((board: any, index: number) => {
      console.log(`\n${index + 1}. ${board.name}`);
      console.log(`   ID:  ${board.id}`);
      console.log(`   URL: ${board.url}`);
      if (board.desc) {
        console.log(`   Descripción: ${board.desc.substring(0, 60)}${board.desc.length > 60 ? '...' : ''}`);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log('\n💡 Para usar un tablero en SlackBoard:');
    console.log('   1. Copia el ID del tablero que quieras usar');
    console.log('   2. Agrégalo a tu .env:');
    console.log('      TRELLO_BOARD_ID=el-id-que-copiaste');
    console.log('   3. Reinicia el backend\n');

  } catch (error: any) {
    console.error('\n❌ Error al conectar con Trello:', error.response?.data?.message || error.message);
    
    if (error.response?.status === 401 || error.response?.data?.includes('invalid')) {
      console.log('\n🔧 Solución:');
      console.log('   Tus credenciales son inválidas. Genera nuevas:');
      console.log('   1. Ve a: https://trello.com/power-ups/admin');
      console.log('   2. Genera un nuevo Token');
      console.log('   3. Actualiza tu .env con las nuevas credenciales\n');
    }
    
    process.exit(1);
  }
};

getTrelloBoards();
