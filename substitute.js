const { CATALOG, EQUIPMENT_KEYS } = require('./catalog');

// Pontuação de "quanto esse exercício serve pro objetivo" — regra
// determinística sobre equipamento/tipo, no mesmo espírito do gerador de
// plano (plan.js). Não é uma tabela por-exercício mantida à mão (90+ itens
// seria inviável de manter); deriva do que já existe no catálogo.
function goalFitScore(ex, goal) {
  if (goal === 'emagrecimento' || goal === 'condicionamento') {
    if (ex.muscleGroup === 'cardio') return 3;
    if (ex.equipment === 'peso_corporal') return 2;
    if (ex.type === 'time') return 2;
    return 1;
  }
  if (goal === 'forca') {
    if (ex.equipment === 'barra') return 3;
    if (ex.equipment === 'maquina' || ex.equipment === 'halteres') return 2;
    return 1;
  }
  if (goal === 'hipertrofia') {
    if (['barra', 'halteres', 'maquina', 'cabo'].includes(ex.equipment)) return 3;
    if (ex.equipment === 'kettlebell') return 2;
    return 1;
  }
  return 2; // saude_geral ou objetivo não definido: sem preferência forte
}

// Pontuação de compatibilidade do candidato com o exercício atual + perfil.
// Equipamento disponível já é filtro obrigatório (ver findSubstitute) — aqui
// só desempata entre o que sobrou:
//  +3 mesmo tipo de execução (equipamento) — pedido explícito do usuário,
//     "de preferência, caso exista" dentro do que a pessoa pode usar
//  +1 a 3 o quanto serve pro objetivo do usuário
function scoreCandidate(candidate, current, profile) {
  let score = 0;
  if (candidate.equipment === current.equipment) score += 3;
  score += goalFitScore(candidate, profile.goal);
  return score;
}

// Acha o melhor substituto: mesmo grupo muscular, exclui o próprio exercício
// e qualquer um que o usuário já tenha importado (evita duplicar no plano).
// Equipamento disponível (perfil) é filtro obrigatório quando definido — não
// adianta sugerir outro exercício de barra pra quem não tem barra.
function findSubstitute(currentKey, userData) {
  const current = CATALOG.find((c) => c.key === currentKey);
  if (!current) return null;

  const alreadyImported = new Set(userData.myExercises.map((m) => m.key));
  const profile = userData.profile;
  const hasEquipmentPrefs = profile.equipment && profile.equipment.length > 0;
  const equipSet = new Set(hasEquipmentPrefs ? profile.equipment : EQUIPMENT_KEYS);

  const baseCandidates = CATALOG.filter(
    (c) => c.muscleGroup === current.muscleGroup && c.key !== currentKey && !alreadyImported.has(c.key)
  );
  // Primeiro tenta só dentro do equipamento disponível; se não sobrar nada
  // (ex: só tem 1 exercício desse grupo pro equipamento que a pessoa tem),
  // cai pra qualquer equipamento em vez de não sugerir nada.
  const withinEquipment = baseCandidates.filter((c) => equipSet.has(c.equipment));
  const candidates = withinEquipment.length ? withinEquipment : baseCandidates;
  if (!candidates.length) return null;

  const scored = candidates.map((c) => ({ ex: c, score: scoreCandidate(c, current, profile) }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].ex;
}

module.exports = { findSubstitute, scoreCandidate, goalFitScore };
