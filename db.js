const fs = require('fs');
const path = require('path');

// DB_PATH aponta pra um volume persistente no Railway (ex: /data/db.json).
// Localmente, cai dentro de ./data/db.json.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'db.json');
// Fotos ficam em disco, fora do JSON, no mesmo volume — o banco guarda só
// o nome do arquivo/metadados, nunca o binário da imagem.
const PHOTOS_DIR = process.env.PHOTOS_DIR || path.join(path.dirname(DB_PATH), 'photos');

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function emptyDB() {
  return { users: {}, sessions: {}, userData: {} };
}

function emptyProfile() {
  return {
    sex: null, goal: null, daysPerWeek: null, equipment: [], level: null, restSeconds: 90,
    birthDate: null, heightCm: null, profilePhoto: null,
  };
}

function emptyUserData() {
  return {
    schedule: { groups: [{ key: 'g0', label: 'A' }, { key: 'g1', label: 'B' }] },
    scheduleState: { pendingIndex: 0 },
    profile: emptyProfile(),
    bodyMetrics: [],
    progressPhotos: [],
    myExercises: [],
    days: {},
    exerciseLogs: {},
    defaults: {},
    activeSession: { startedAt: null, restEndsAt: null },
    pushSubscriptions: [],
    reminders: [],
    gamification: { points: 0, achievements: [] },
  };
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
  const userData = db.userData[userId];
  // Preenche campos que não existiam em contas criadas antes deles serem introduzidos.
  if (!userData.schedule || !Array.isArray(userData.schedule.groups) || userData.schedule.groups.length === 0) {
    userData.schedule = { groups: [{ key: 'g0', label: 'A' }, { key: 'g1', label: 'B' }] };
  }
  if (!userData.scheduleState || typeof userData.scheduleState.pendingIndex !== 'number') {
    userData.scheduleState = { pendingIndex: 0 };
  }
  if (
    userData.scheduleState.pendingIndex < 0 ||
    userData.scheduleState.pendingIndex >= userData.schedule.groups.length
  ) {
    userData.scheduleState.pendingIndex = 0;
  }
  if (!userData.profile) {
    userData.profile = emptyProfile();
  } else {
    const defaults = emptyProfile();
    Object.keys(defaults).forEach((k) => {
      if (userData.profile[k] === undefined) userData.profile[k] = defaults[k];
    });
  }
  if (!Array.isArray(userData.bodyMetrics)) userData.bodyMetrics = [];
  if (!Array.isArray(userData.progressPhotos)) userData.progressPhotos = [];
  if (!userData.activeSession) userData.activeSession = { startedAt: null, restEndsAt: null };
  if (!Array.isArray(userData.pushSubscriptions)) userData.pushSubscriptions = [];
  if (!Array.isArray(userData.reminders)) userData.reminders = [];
  if (!userData.gamification) userData.gamification = { points: 0, achievements: [] };
  if (!Array.isArray(userData.myExercises)) userData.myExercises = [];
  if (!userData.days) userData.days = {};
  if (!userData.exerciseLogs) userData.exerciseLogs = {};
  if (!userData.defaults) userData.defaults = {};
  return userData;
}

function resetUserData(userId) {
  db.userData[userId] = emptyUserData();
  const userPhotosDir = path.join(PHOTOS_DIR, userId);
  fs.rm(userPhotosDir, { recursive: true, force: true }, () => {});
  return persist();
}

module.exports = { db, persist, getUserData, resetUserData, DB_PATH, PHOTOS_DIR };
