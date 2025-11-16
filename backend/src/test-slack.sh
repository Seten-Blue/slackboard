#!/bin/bash

echo "🧪 Probando integración con Slack..."
echo ""

echo "1️⃣ Verificando estado..."
curl -s http://localhost:3000/api/slack/status | jq
echo ""

echo "2️⃣ Sincronizando canales..."
curl -s -X POST http://localhost:3000/api/slack/sync-channels | jq
echo ""

echo "3️⃣ Creando canal de prueba..."
curl -s -X POST http://localhost:3000/api/slack/create-channel \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-'$(date +%s)'",
    "description": "Canal de prueba automática"
  }' | jq
echo ""

echo "4️⃣ Enviando mensaje..."
curl -s -X POST http://localhost:3000/api/slack/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "channelName": "notificaciones",
    "text": "✅ Prueba exitosa desde script!",
    "username": "Test Bot"
  }' | jq
echo ""

echo "✅ Pruebas completadas!"