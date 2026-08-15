const { CATALOG } = require('./catalog');

// Modelos de divisão de treino por quantidade de dias/semana disponíveis.
// Cada grupo lista os grupos musculares que ele cobre, na ordem de prioridade
// de seleção (o gerador percorre essa lista em round-robin até completar a
// cota de exercícios do grupo).
const SPLIT_TEMPLATES = {
  1: [
    { label: 'Corpo inteiro', muscles: ['pernas', 'costas', 'peito', 'ombros', 'abdomen'] },
  ],
  2: [
    { label: 'Superior', muscles: ['peito', 'costas', 'ombros', 'biceps', 'triceps'] },
    { label: 'Inferior', muscles: ['pernas', 'gluteos', 'panturrilha', 'abdomen'] },
  ],
  3: [
    { label: 'Empurrar', muscles: ['peito', 'ombros', 'triceps'] },
    { label: 'Puxar', muscles: ['costas', 'biceps'] },
    { label: 'Pernas', muscles: ['pernas', 'gluteos', 'panturrilha', 'abdomen'] },
  ],
  4: [
    { label: 'Peito e Tríceps', muscles: ['peito', 'triceps'] },
    { label: 'Costas e Bíceps', muscles: ['costas', 'biceps'] },
    { label: 'Pernas', muscles: ['pernas', 'gluteos', 'panturrilha'] },
    { label: 'Ombros e Abdômen', muscles: ['ombros', 'abdomen'] },
  ],
  5: [
    { label: 'Peito', muscles: ['peito'] },
    { label: 'Costas', muscles: ['costas'] },
    { label: 'Pernas', muscles: ['pernas', 'gluteos', 'panturrilha'] },
    { label: 'Ombros', muscles: ['ombros'] },
    { label: 'Braços e Abdômen', muscles: ['biceps', 'triceps', 'abdomen'] },
  ],
};

const EXERCISES_PER_LEVEL = { iniciante: 4, intermediario: 5, avancado: 6 };
const DEFAULT_EQUIPMENT = ['barra', 'halteres', 'maquina', 'cabo', 'peso_corporal', 'kettlebell', 'cardio'];

function groupCountFor(daysPerWeek) {
  const n = Number(daysPerWeek) || 3;
  return Math.min(Math.max(Math.round(n), 1), 5);
}

function candidatesFor(muscle, equipmentSet, alreadyPicked) {
  return CATALOG.filter(
    (ex) => ex.muscleGroup === muscle && equipmentSet.has(ex.equipment) && !alreadyPicked.has(ex.key)
  );
}

// Regra determinística sobre o catálogo existente — não é geração por IA.
// Distribui, em round-robin pelos grupos musculares do "slot", exercícios
// compatíveis com os equipamentos informados, até atingir a cota por nível.
function generatePlan({ goal, daysPerWeek, equipment, level }) {
  const count = groupCountFor(daysPerWeek);
  const template = SPLIT_TEMPLATES[count];
  const equipmentList = Array.isArray(equipment) && equipment.length ? equipment : DEFAULT_EQUIPMENT;
  const equipmentSet = new Set(equipmentList);
  const perGroupTotal = EXERCISES_PER_LEVEL[level] || EXERCISES_PER_LEVEL.intermediario;
  const wantsCardio = goal === 'emagrecimento' || goal === 'condicionamento';

  const alreadyPicked = new Set();

  return template.map((slot) => {
    const muscles = slot.muscles;
    const picks = [];
    let idx = 0;
    const maxAttempts = muscles.length * (perGroupTotal + 2);
    while (picks.length < perGroupTotal && idx < maxAttempts) {
      const muscle = muscles[idx % muscles.length];
      const candidates = candidatesFor(muscle, equipmentSet, alreadyPicked);
      if (candidates.length) {
        picks.push(candidates[0].key);
        alreadyPicked.add(candidates[0].key);
      }
      idx++;
    }
    if (wantsCardio) {
      const cardioCandidates = candidatesFor('cardio', equipmentSet, alreadyPicked);
      if (cardioCandidates.length) {
        picks.push(cardioCandidates[0].key);
        alreadyPicked.add(cardioCandidates[0].key);
      }
    }
    return { label: slot.label, exerciseKeys: picks };
  });
}

module.exports = { generatePlan, SPLIT_TEMPLATES };
