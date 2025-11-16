#!/bin/bash

echo "🔧 Arreglando y levantando SlackBoard..."
cd ~/slackboard

# Matar procesos en puerto 4200
echo "🧹 Limpiando puerto 4200..."
pkill -f "ng serve" 2>/dev/null || true
sudo lsof -ti:4200 | xargs sudo kill -9 2>/dev/null || true

# Detener contenedores
echo "⏹️  Deteniendo contenedores..."
sudo docker compose down

# Reconstruir backend
echo "🔨 Reconstruyendo backend..."
sudo docker compose build backend

# Levantar servicios
echo "🚀 Levantando servicios..."
sudo docker compose up -d

# Esperar MongoDB
echo "⏳ Esperando a que MongoDB esté listo..."
sleep 8

# Sincronizar canales
echo "📡 Sincronizando canales de Slack..."
curl -s -X POST http://localhost:3000/api/slack/sync-channels | jq

echo ""
echo "✅ Sistema listo!"
echo "   Backend: http://localhost:3000"
echo "   Frontend: http://localhost:4200"
echo ""
echo "📊 Canales disponibles:"
curl -s http://localhost:3000/api/channels | jq '.data[] | .name'
