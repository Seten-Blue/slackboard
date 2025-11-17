import express, { Request, Response, Router } from 'express';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import CalendarToken from '../models/CalendarToken';

dotenv.config();

const router: Router = express.Router();

// Configuración de OAuth2
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/oauth2callback'
);

// 🔥 VARIABLE GLOBAL para cachear tokens en memoria
let tokensLoaded = false;

// Función para cargar tokens desde la base de datos (solo una vez)
async function loadTokensFromDB() {
  if (tokensLoaded) return true; // ← YA ESTÁN CARGADOS, NO VOLVER A CARGAR
  
  try {
    const tokenDoc = await CalendarToken.findOne({ userId: 'default_user' });
    if (tokenDoc) {
      oauth2Client.setCredentials({
        access_token: tokenDoc.accessToken,
        refresh_token: tokenDoc.refreshToken,
        expiry_date: tokenDoc.expiryDate,
        scope: tokenDoc.scope,
        token_type: tokenDoc.tokenType
      });
      console.log('✅ Tokens cargados desde MongoDB');
      tokensLoaded = true; // ← MARCAR COMO CARGADOS
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Error cargando tokens:', error);
    return false;
  }
}

// Función para guardar tokens en la base de datos
async function saveTokensToDB(tokens: any) {
  try {
    await CalendarToken.findOneAndUpdate(
      { userId: 'default_user' },
      {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date,
        scope: tokens.scope || 'https://www.googleapis.com/auth/calendar',
        tokenType: tokens.token_type || 'Bearer'
      },
      { upsert: true, new: true }
    );
    console.log('✅ Tokens guardados en MongoDB');
    tokensLoaded = true; // ← ACTUALIZAR CACHE
  } catch (error) {
    console.error('❌ Error guardando tokens:', error);
  }
}

// Cargar tokens SOLO UNA VEZ al iniciar el servidor
loadTokensFromDB();

// Middleware para verificar autenticación (sin volver a cargar)
function checkAuth() {
  return oauth2Client.credentials && oauth2Client.credentials.access_token;
}

// Endpoint para verificar el estado de autenticación
router.get('/status', async (req: Request, res: Response) => {
  const hasTokens = checkAuth();
  res.json({
    authenticated: !!hasTokens,
    message: hasTokens ? 'Autenticado con Google Calendar' : 'No autenticado'
  });
});

// Endpoint para iniciar el flujo de autorización
router.get('/authorize', (req: Request, res: Response) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent'
  });
  
  res.json({ authUrl });
});

// Endpoint de callback para OAuth
router.get('/oauth2callback', async (req: Request, res: Response) => {
  const { code } = req.query;
  
  if (!code || typeof code !== 'string') {
    return res.status(400).send('Código de autorización no válido');
  }
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Guardar tokens en MongoDB
    await saveTokensToDB(tokens);
    
    res.send(`
      <html>
        <head>
          <title>Autenticación exitosa</title>
          <style>
            body { font-family: Arial; text-align: center; padding: 50px; }
            h1 { color: #4CAF50; }
          </style>
        </head>
        <body>
          <h1>✅ Autenticación exitosa!</h1>
          <p>Los tokens se han guardado correctamente.</p>
          <p>Ya puedes cerrar esta ventana y volver a tu aplicación.</p>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error('❌ Error en callback:', error);
    res.status(500).send(`<h1>Error en la autenticación</h1><p>${error.message}</p>`);
  }
});

// Endpoint para obtener eventos de hoy
router.get('/today', async (req: Request, res: Response) => {
  try {
    if (!checkAuth()) {
      return res.status(401).json({ 
        error: 'No autenticado', 
        message: 'Usa /api/calendar/authorize primero' 
      });
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const endOfDay = new Date(now.setHours(23, 59, 59, 999));
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    res.json({ 
      events: response.data.items || [],
      count: response.data.items?.length || 0
    });
  } catch (error: any) {
    console.error('❌ Error obteniendo eventos de hoy:', error);
    
    if (error.code === 401) {
      tokensLoaded = false; // ← INVALIDAR CACHE
      return res.status(401).json({ 
        error: 'Token expirado', 
        message: 'Por favor vuelve a autorizar usando /api/calendar/authorize' 
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para obtener eventos de la semana
router.get('/week', async (req: Request, res: Response) => {
  try {
    if (!checkAuth()) {
      return res.status(401).json({ 
        error: 'No autenticado', 
        message: 'Usa /api/calendar/authorize primero' 
      });
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: endOfWeek.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    res.json({ 
      events: response.data.items || [],
      count: response.data.items?.length || 0
    });
  } catch (error: any) {
    console.error('❌ Error obteniendo eventos de la semana:', error);
    
    if (error.code === 401) {
      tokensLoaded = false;
      return res.status(401).json({ 
        error: 'Token expirado', 
        message: 'Por favor vuelve a autorizar usando /api/calendar/authorize' 
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para obtener eventos del mes
router.get('/month', async (req: Request, res: Response) => {
  try {
    if (!checkAuth()) {
      return res.status(401).json({ 
        success: false,
        error: 'No autenticado', 
        message: 'Usa /api/calendar/authorize primero' 
      });
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const { year, month } = req.query;
    const startDate = year && month 
      ? new Date(parseInt(year as string), parseInt(month as string), 1)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59);
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    res.json({ 
      success: true,
      data: {
        events: response.data.items || [],
        count: response.data.items?.length || 0
      }
    });
  } catch (error: any) {
    console.error('❌ Error obteniendo eventos del mes:', error);
    
    if (error.code === 401) {
      tokensLoaded = false;
      return res.status(401).json({ 
        success: false,
        error: 'Token expirado', 
        message: 'Por favor vuelve a autorizar' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Endpoint para obtener días festivos
router.get('/holidays', async (req: Request, res: Response) => {
  try {
    if (!checkAuth()) {
      return res.status(401).json({ 
        success: false,
        error: 'No autenticado', 
        message: 'Usa /api/calendar/authorize primero' 
      });
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const { year, country = 'es.co' } = req.query;
    const currentYear = year ? parseInt(year as string) : new Date().getFullYear();
    const startDate = new Date(currentYear, 0, 1);
    const endDate = new Date(currentYear, 11, 31, 23, 59, 59);

    const holidayCalendarId = `${country}#holiday@group.v.calendar.google.com`;

    const response = await calendar.events.list({
      calendarId: holidayCalendarId,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    res.json({
      success: true,
      data: {
        holidays: response.data.items || [],
        count: response.data.items?.length || 0
      }
    });
  } catch (error: any) {
    console.error('❌ Error obteniendo festivos:', error);
    res.json({ 
      success: true,
      data: {
        holidays: [], 
        count: 0 
      }
    });
  }
});

// Endpoint para crear un nuevo evento
router.post('/events', async (req: Request, res: Response) => {
  try {
    if (!checkAuth()) {
      return res.status(401).json({ 
        error: 'No autenticado', 
        message: 'Usa /api/calendar/authorize primero' 
      });
    }

    const { summary, description, location, startDateTime, endDateTime, allDay } = req.body;
    
    if (!summary || !startDateTime || !endDateTime) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos',
        message: 'Se requiere: summary, startDateTime, endDateTime' 
      });
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const event: any = {
      summary,
      description,
      location,
      start: allDay 
        ? { date: startDateTime.split('T')[0] }
        : { dateTime: startDateTime, timeZone: 'America/Bogota' },
      end: allDay
        ? { date: endDateTime.split('T')[0] }
        : { dateTime: endDateTime, timeZone: 'America/Bogota' },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    res.json({
      success: true,
      event: response.data,
      message: 'Evento creado exitosamente'
    });
  } catch (error: any) {
    console.error('❌ Error creando evento:', error);
    
    if (error.code === 401) {
      tokensLoaded = false;
      return res.status(401).json({ 
        error: 'Token expirado', 
        message: 'Por favor vuelve a autorizar' 
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para actualizar un evento
router.put('/events/:eventId', async (req: Request, res: Response) => {
  try {
    if (!checkAuth()) {
      return res.status(401).json({ 
        error: 'No autenticado', 
        message: 'Usa /api/calendar/authorize primero' 
      });
    }

    const { eventId } = req.params;
    const { summary, description, location, startDateTime, endDateTime, allDay } = req.body;

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const event: any = {
      summary,
      description,
      location,
      start: allDay 
        ? { date: startDateTime.split('T')[0] }
        : { dateTime: startDateTime, timeZone: 'America/Bogota' },
      end: allDay
        ? { date: endDateTime.split('T')[0] }
        : { dateTime: endDateTime, timeZone: 'America/Bogota' },
    };

    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: event,
    });

    res.json({
      success: true,
      event: response.data,
      message: 'Evento actualizado exitosamente'
    });
  } catch (error: any) {
    console.error('❌ Error actualizando evento:', error);
    
    if (error.code === 401) {
      tokensLoaded = false;
      return res.status(401).json({ 
        error: 'Token expirado', 
        message: 'Por favor vuelve a autorizar' 
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para eliminar un evento
router.delete('/events/:eventId', async (req: Request, res: Response) => {
  try {
    if (!checkAuth()) {
      return res.status(401).json({ 
        error: 'No autenticado', 
        message: 'Usa /api/calendar/authorize primero' 
      });
    }

    const { eventId } = req.params;
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });

    res.json({
      success: true,
      message: 'Evento eliminado exitosamente'
    });
  } catch (error: any) {
    console.error('❌ Error eliminando evento:', error);
    
    if (error.code === 401) {
      tokensLoaded = false;
      return res.status(401).json({ 
        error: 'Token expirado', 
        message: 'Por favor vuelve a autorizar' 
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para revocar/eliminar tokens
router.delete('/revoke', async (req: Request, res: Response) => {
  try {
    await CalendarToken.deleteOne({ userId: 'default_user' });
    oauth2Client.setCredentials({});
    tokensLoaded = false; // ← INVALIDAR CACHE
    res.json({ message: 'Tokens revocados exitosamente' });
  } catch (error: any) {
    console.error('❌ Error revocando tokens:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;