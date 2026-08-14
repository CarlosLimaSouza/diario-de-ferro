const fs = require('fs');
const path = require('path');

// DB_PATH aponta pra um volume persistente no Railway (ex: /data/db.json).
// Localmente, cai dentro de ./data/db.json.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'db.json');

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function emptyDB() {
  return { users: {}, sessions: {}, userData: {} };
}

function emptyUserData() {
  return { myExercises: [], days: {}, exerciseLogs: {}, defaults: {} };
}

function loadDB() {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) {
    const initial = emptyDB();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      users: parsed.users || {},
      sessions: parsed.sessions || {},
      userData: parsed.userData || {},
    };
  } catch (e) {
    console.error('Falha ao ler o banco de dados, iniciando um novo.', e);
    return emptyDB();
  }
}

const db = loadDB();

// Fila simples de escrita para evitar corromper o arquivo com escritas concorrentes.
let writeQueue = Promise.resolve();

function persist() {
  writeQueue = writeQueue.then(
    () =>
      new Promise((resolve, reject) => {
        ensureDir();
        fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), (err) => {
          if (err) reject(err);
          else resolve();
        });
      })
  );
  return writeQueue;
}

function getUserData(userId) {
  if (!db.userData[userId]) {
    db.userData[userId] = emptyUserData();
  }
  return db.userData[userId];
}

function resetUserData(userId) {
  db.userData[userId] = emptyUserData();
  return persist();
}

module.exports = { db, persist, getUserData, resetUserData, DB_PATH };
