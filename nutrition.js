const crypto = require('crypto');
const { TACO_FOODS } = require('./taco');
const { getUserData, persist } = require('./db');

const MEAL_TYPES = ['cafe', 'almoco', 'jantar', 'lanche'];

function allFoods(userData) {
  return [...TACO_FOODS, ...userData.customFoods];
}

// ---------- Alimentos ----------
function searchFoods(req, res) {
  const userData = getUserData(req.userId);
  const q = String(req.query.q || '').trim().toLowerCase();
  const foods = allFoods(userData);
  const results = q ? foods.filter((f) => f.name.toLowerCase().includes(q)) : foods.slice(0, 30);
  res.json(results.slice(0, 30));
}

function createCustomFood(req, res) {
  const { name, kcal, proteinG, carbG, fatG, per } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'nome do alimento é obrigatório' });
  }
  const userData = getUserData(req.userId);
  const food = {
    key: 'custom_' + crypto.randomUUID(),
    name: name.trim().slice(0, 80),
    kcal: Math.max(0, Number(kcal) || 0),
    proteinG: Math.max(0, Number(proteinG) || 0),
    carbG: Math.max(0, Number(carbG) || 0),
    fatG: Math.max(0, Number(fatG) || 0),
    per: per || '100g',
  };
  userData.customFoods.push(food);
  persist().then(() => res.json(food));
}

// ---------- Diário do dia ----------
function getFoodLog(req, res) {
  const userData = getUserData(req.userId);
  const entries = userData.foodLog[req.params.date] || [];
  const foodsByKey = Object.fromEntries(allFoods(userData).map((f) => [f.key, f]));
  res.json(entries.map((e) => ({ ...e, food: foodsByKey[e.foodKey] || null })));
}

function addFoodLogEntry(req, res) {
  const userData = getUserData(req.userId);
  const date = req.params.date;
  const { foodKey, grams, mealType } = req.body || {};

  if (!allFoods(userData).some((f) => f.key === foodKey)) {
    return res.status(404).json({ error: 'alimento não encontrado' });
  }
  if (!MEAL_TYPES.includes(mealType)) {
    return res.status(400).json({ error: 'refeição inválida' });
  }
  const g = Number(grams);
  if (!Number.isFinite(g) || g <= 0) {
    return res.status(400).json({ error: 'quantidade inválida' });
  }

  const entry = { id: crypto.randomUUID(), foodKey, grams: g, mealType, loggedAt: new Date().toISOString() };
  if (!userData.foodLog[date]) userData.foodLog[date] = [];
  userData.foodLog[date].push(entry);
  persist().then(() => res.json(entry));
}

function deleteFoodLogEntry(req, res) {
  const userData = getUserData(req.userId);
  const { date, id } = req.params;
  if (!userData.foodLog[date]) return res.status(404).json({ error: 'não encontrado' });
  userData.foodLog[date] = userData.foodLog[date].filter((e) => e.id !== id);
  persist().then(() => res.json({ ok: true }));
}

// ---------- Meta calórica/macro ----------
function ageFromBirthDate(birthDate) {
  if (!birthDate) return null;
  const b = new Date(birthDate + 'T00:00:00');
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age > 0 ? age : null;
}

// Mifflin-St Jeor + fator de atividade (pelos dias/semana da Fase 1) +
// ajuste por objetivo. Precisa de peso (última métrica corporal), altura e
// idade — se faltar algum, não dá pra calcular (retorna null).
function computeAutoTargets(userData) {
  const profile = userData.profile;
  const latestMetric = userData.bodyMetrics.length ? userData.bodyMetrics[userData.bodyMetrics.length - 1] : null;
  const weight = latestMetric && latestMetric.weightKg;
  const height = profile.heightCm;
  const age = ageFromBirthDate(profile.birthDate);
  if (!weight || !height || !age) return null;

  const male = 10 * weight + 6.25 * height - 5 * age + 5;
  const female = 10 * weight + 6.25 * height - 5 * age - 161;
  const bmr = profile.sex === 'M' ? male : profile.sex === 'F' ? female : (male + female) / 2;

  const days = profile.daysPerWeek || 3;
  const activityFactor = days <= 1 ? 1.2 : days <= 3 ? 1.375 : days <= 5 ? 1.55 : 1.725;
  const tdee = bmr * activityFactor;

  const goalAdjust = { emagrecimento: -500, hipertrofia: 300, forca: 200, condicionamento: 0, saude_geral: 0 };
  const kcal = Math.round(tdee + (goalAdjust[profile.goal] ?? 0));

  const proteinPerKg = profile.goal === 'hipertrofia' || profile.goal === 'forca' ? 2.0 : 1.8;
  const proteinG = Math.round(weight * proteinPerKg);
  const fatG = Math.round((kcal * 0.25) / 9);
  const carbG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));

  return { kcal, proteinG, carbG, fatG };
}

function getTargets(req, res) {
  const userData = getUserData(req.userId);
  if (userData.nutritionTargets && userData.nutritionTargets.kcal) {
    return res.json({ ...userData.nutritionTargets, source: 'manual' });
  }
  const auto = computeAutoTargets(userData);
  if (!auto) return res.json({ kcal: null, proteinG: null, carbG: null, fatG: null, source: 'insuficiente' });
  res.json({ ...auto, source: 'auto' });
}

function setTargets(req, res) {
  const { kcal, proteinG, carbG, fatG } = req.body || {};
  const userData = getUserData(req.userId);
  userData.nutritionTargets =
    kcal === null
      ? { kcal: null, proteinG: null, carbG: null, fatG: null }
      : {
          kcal: Number(kcal) || null,
          proteinG: Number(proteinG) || null,
          carbG: Number(carbG) || null,
          fatG: Number(fatG) || null,
        };
  persist().then(() => res.json(userData.nutritionTargets));
}

module.exports = {
  searchFoods,
  createCustomFood,
  getFoodLog,
  addFoodLogEntry,
  deleteFoodLogEntry,
  getTargets,
  setTargets,
  MEAL_TYPES,
};
