// Catálogo de conquistas. `points` é o bônus concedido ao desbloquear —
// valores iniciais, fáceis de reajustar depois de ver uso real.
const ACHIEVEMENTS = [
  { key: 'primeiro_treino', label: 'Primeiro treino', description: 'Concluiu o primeiro treino registrado.', points: 20, check: (s) => s.totalTrained >= 1 },
  { key: 'dez_treinos', label: '10 treinos', description: 'Concluiu 10 treinos.', points: 50, check: (s) => s.totalTrained >= 10 },
  { key: 'cinquenta_treinos', label: '50 treinos', description: 'Concluiu 50 treinos.', points: 200, check: (s) => s.totalTrained >= 50 },
  { key: 'streak_7', label: 'Uma semana de fogo', description: '7 dias seguidos treinando.', points: 50, check: (s) => s.streak >= 7 },
  { key: 'streak_30', label: 'Um mês inteiro', description: '30 dias seguidos treinando.', points: 150, check: (s) => s.streak >= 30 },
  { key: 'streak_100', label: 'Centenário', description: '100 dias seguidos treinando.', points: 500, check: (s) => s.streak >= 100 },
  { key: 'primeiro_pr', label: 'Primeiro recorde', description: 'Bateu o primeiro recorde pessoal.', points: 30, check: (s) => s.totalPRs >= 1 },
  { key: 'dez_prs', label: 'Colecionador de recordes', description: 'Bateu 10 recordes pessoais.', points: 150, check: (s) => s.totalPRs >= 10 },
  { key: 'primeira_refeicao', label: 'Diário alimentar iniciado', description: 'Registrou a primeira refeição.', points: 20, check: (s) => s.totalFoodLogs >= 1 },
];

module.exports = { ACHIEVEMENTS };
