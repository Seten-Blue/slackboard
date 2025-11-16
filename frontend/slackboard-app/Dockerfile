FROM node:18-alpine

WORKDIR /app

# Instalar Angular CLI
RUN npm install -g @angular/cli@16

# Copiar package files
COPY package*.json ./

# Instalar dependencias con --legacy-peer-deps
RUN npm install --legacy-peer-deps

# Copiar código fuente
COPY . .

# Exponer puerto
EXPOSE 4200

# Comando por defecto
CMD ["ng", "serve", "--host", "0.0.0.0", "--poll", "2000"]
