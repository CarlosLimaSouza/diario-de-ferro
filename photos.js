const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const { getUserData, persist, PHOTOS_DIR } = require('./db');

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB antes do redimensionamento
const MAX_DIMENSION = 1200; // px — mantém o volume do Railway sob controle

function userDir(userId) {
  return path.join(PHOTOS_DIR, userId);
}

function ensureUserDir(userId) {
  const dir = userDir(userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      return cb(new Error('formato de imagem não suportado'));
    }
    cb(null, true);
  },
});

// Redimensiona (máx. MAX_DIMENSION no maior lado) e recomprime como JPEG —
// evita que fotos grandes de celular inchem o volume persistente.
async function resizeAndSave(buffer, destPath) {
  await sharp(buffer)
    .rotate() // respeita orientação EXIF antes de descartá-la
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(destPath);
}

// ---------- Foto de perfil ----------
async function uploadProfilePhoto(req, res) {
  if (!req.file) return res.status(400).json({ error: 'nenhuma imagem enviada' });
  const userData = getUserData(req.userId);
  const dir = ensureUserDir(req.userId);
  const filename = 'profile.jpg';
  try {
    await resizeAndSave(req.file.buffer, path.join(dir, filename));
  } catch (e) {
    return res.status(400).json({ error: 'não foi possível processar a imagem' });
  }
  userData.profile.profilePhoto = { filename, uploadedAt: new Date().toISOString() };
  persist().then(() => res.json(userData.profile.profilePhoto));
}

function getProfilePhoto(req, res) {
  const userData = getUserData(req.userId);
  if (!userData.profile.profilePhoto) return res.status(404).end();
  const filePath = path.join(userDir(req.userId), userData.profile.profilePhoto.filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
}

// ---------- Fotos de progresso ----------
async function uploadProgressPhoto(req, res) {
  if (!req.file) return res.status(400).json({ error: 'nenhuma imagem enviada' });
  const userData = getUserData(req.userId);
  const dir = ensureUserDir(req.userId);
  const id = crypto.randomUUID();
  const filename = `progress-${id}.jpg`;
  try {
    await resizeAndSave(req.file.buffer, path.join(dir, filename));
  } catch (e) {
    return res.status(400).json({ error: 'não foi possível processar a imagem' });
  }
  const date = (req.body && req.body.date) || new Date().toISOString().slice(0, 10);
  const note = (req.body && req.body.note) || '';
  const entry = { id, date, filename, note: String(note).slice(0, 200) };
  userData.progressPhotos.push(entry);
  userData.progressPhotos.sort((a, b) => a.date.localeCompare(b.date));
  persist().then(() => res.json(entry));
}

function listProgressPhotos(req, res) {
  const userData = getUserData(req.userId);
  res.json(userData.progressPhotos.map(({ id, date, note }) => ({ id, date, note })));
}

function getProgressPhotoFile(req, res) {
  const userData = getUserData(req.userId);
  const entry = userData.progressPhotos.find((p) => p.id === req.params.id);
  if (!entry) return res.status(404).end();
  const filePath = path.join(userDir(req.userId), entry.filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
}

function deleteProgressPhoto(req, res) {
  const userData = getUserData(req.userId);
  const entry = userData.progressPhotos.find((p) => p.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'foto não encontrada' });
  userData.progressPhotos = userData.progressPhotos.filter((p) => p.id !== req.params.id);
  const filePath = path.join(userDir(req.userId), entry.filename);
  fs.unlink(filePath, () => {});
  persist().then(() => res.json({ ok: true }));
}

module.exports = {
  upload,
  uploadProfilePhoto,
  getProfilePhoto,
  uploadProgressPhoto,
  listProgressPhotos,
  getProgressPhotoFile,
  deleteProgressPhoto,
};
