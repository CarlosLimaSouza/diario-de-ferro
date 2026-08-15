const { getUserData } = require('./db');
const { ACHIEVEMENTS } = require('./achievements');

function levelFromPoints(points) {
  return Math.floor(Math.sqrt(points / 100)) + 1;
}

// Mesma lógica de fmt/addDays do cliente (public/app.js) — parse e formata em
// horário local sem passar por toISOString(), pra não arriscar pular de dia
// por causa de fuso horário.
function addDaysStr(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Espelha renderStreak() do cliente: folga pausa sem quebrar nem somar, dia
// em branco quebra a sequência.
function computeStreakFrom(userData, todayDateStr) {
  const days = userData.days;
  let cursor = days[todayDateStr] && days[todayDateStr].status === 'trained' ? todayDateStr : addDaysStr(todayDateStr, -1);
  let streak = 0;
  while (true) {
    const info = days[cursor];
    if (info && info.status === 'trained') { streak++; cursor = addDaysStr(cursor, -1); }
    else if (info && info.status === 'rest') { cursor = addDaysStr(cursor, -1); }
    else break;
  }
  return streak;
}

function getStats(userData, todayDateStr) {
  const totalTrained = Object.values(userData.days).filter((d) => d.status === 'trained').length;
  const totalPRs = Object.values(userData.exerciseLogs).filter((l) => l.isPR).length;
  const totalFoodLogs = Object.values(userData.foodLog).reduce((acc, arr) => acc + arr.length, 0);
  const streak = todayDateStr ? computeStreakFrom(userData, todayDateStr) : 0;
  return { totalTrained, totalPRs, totalFoodLogs, streak };
}

// Soma pontos e reavalia conquistas. `todayDateStr` é opcional — sem ele, a
// sequência não é recalculada (usado em eventos que não têm uma data de
// treino associada, tipo registrar uma métrica corporal).
function registerEvent(userData, points, todayDateStr) {
  userData.gamification.points += points;
  const stats = getStats(userData, todayDateStr);
  const unlockedKeys = new Set(userData.gamification.achievements.map((a) => a.key));
  const newlyUnlocked = [];
  ACHIEVEMENTS.forEach((a) => {
    if (!unlockedKeys.has(a.key) && a.check(stats)) {
      userData.gamification.achievements.push({ key: a.key, unlockedAt: new Date().toISOString() });
      userData.gamification.points += a.points;
      newlyUnlocked.push(a);
    }
  });
  return {
    points: userData.gamification.points,
    level: levelFromPoints(userData.gamification.points),
    newlyUnlocked,
  };
}

function getSummary(req, res) {
  const userData = getUserData(req.userId);
  const unlockedKeys = new Set(userData.gamification.achievements.map((a) => a.key));
  const unlockedAt = Object.fromEntries(userData.gamification.achievements.map((a) => [a.key, a.unlockedAt]));
  res.json({
    points: userData.gamification.points,
    level: levelFromPoints(userData.gamification.points),
    achievements: ACHIEVEMENTS.map((a) => ({
      key: a.key,
      label: a.label,
      description: a.description,
      unlocked: unlockedKeys.has(a.key),
      unlockedAt: unlockedAt[a.key] || null,
    })),
  });
}

module.exports = { registerEvent, getStats, levelFromPoints, getSummary };
