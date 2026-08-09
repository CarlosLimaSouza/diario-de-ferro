FROM node:20-alpine

WORKDIR /app

# Instala dependências primeiro (aproveita cache do Docker)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copia o restante do projeto
COPY . .

# O Railway injeta PORT automaticamente; 3000 é o padrão local.
ENV PORT=3000
# Caminho do banco de dados dentro do volume persistente.
ENV DB_PATH=/data/db.json

EXPOSE 3000

CMD ["node", "server.js"]
