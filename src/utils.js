import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { v4 as uuidv4 } from 'uuid';

dayjs.extend(utc);
dayjs.extend(timezone);

export function formatDateTime(timestamp, zone = 'UTC') {
  if (!timestamp) return 'TBD';
  return dayjs(timestamp).tz(zone).format('YYYY-MM-DD HH:mm [UTC]');
}

export function generateId(prefix = 'tourn') {
  return `${prefix}_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
}

export function shuffleArray(array) {
  const cloned = [...array];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

export function nextPowerOfTwo(num) {
  let power = 1;
  while (power < num) power *= 2;
  return power;
}

export function parsePrizeDistribution(rawText) {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const prizes = lines.map((line) => {
    const [place, amount] = line.split(':').map((part) => part.trim());
    return { place, amount: amount || '' };
  });
  return prizes;
}

export function formatPrizeDistribution(prizes) {
  if (!Array.isArray(prizes) || prizes.length === 0) {
    return 'No prize distribution defined.';
  }
  return prizes.map((entry) => `• ${entry.place}: ${entry.amount}`).join('\n');
}

export function buildSingleEliminationBracket(players = []) {
  const size = nextPowerOfTwo(players.length);
  const byes = size - players.length;
  const seededPlayers = shuffleArray(players);
  const slots = [...seededPlayers];
  for (let i = 0; i < byes; i += 1) {
    slots.push(null);
  }
  const rounds = [];
  let roundPlayers = slots;
  let roundNumber = 1;

  while (roundPlayers.length > 1) {
    const matches = [];
    for (let i = 0; i < roundPlayers.length; i += 2) {
      const playerA = roundPlayers[i];
      const playerB = roundPlayers[i + 1] ?? null;
      matches.push({
        id: generateId('match'),
        round: roundNumber,
        playerA,
        playerB,
        status: playerA && !playerB ? 'bye' : 'pending',
        winner: playerA && !playerB ? playerA : null,
      });
    }
    rounds.push(matches);
    roundPlayers = matches.map((match) => match.winner || null);
    roundNumber += 1;
  }

  return rounds;
}

export function buildSchedule(startDate, endDate, rounds) {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  const days = Math.max(1, Math.ceil(end.diff(start, 'day')) + 1);
  const roundCount = rounds;
  const schedule = [];
  for (let i = 0; i < roundCount; i += 1) {
    const dayOffset = Math.floor((i * days) / roundCount);
    schedule.push({
      round: i + 1,
      title: `Round ${i + 1}`,
      scheduledAt: start.add(dayOffset, 'day').hour(18).minute(0).second(0).toISOString(),
    });
  }
  return schedule;
}

export function formatTournamentStatus(status) {
  switch (status) {
    case 'draft': return 'Draft';
    case 'registration': return 'Registration Open';
    case 'bracket': return 'Bracket Generated';
    case 'running': return 'Running';
    case 'paused': return 'Paused';
    case 'completed': return 'Completed';
    default: return 'Unknown';
  }
}
