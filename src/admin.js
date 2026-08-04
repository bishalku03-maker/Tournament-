import { Markup } from 'telegraf';
import { generateId, formatPrizeDistribution, formatDateTime } from './utils.js';
import { TOURNAMENT_STATUS, TOURNAMENT_TYPE, ADMIN_ACTIONS } from './constants.js';

export function isAdmin(ctx, ownerId) {
  const fromId = ctx.from?.id?.toString();
  return fromId && fromId === ownerId?.toString();
}

export function buildAdminKeyboard(tournamentId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Open Registration', `${ADMIN_ACTIONS.OPEN_REG}|${tournamentId}`), Markup.button.callback('Close Registration', `${ADMIN_ACTIONS.CLOSE_REG}|${tournamentId}`)],
    [Markup.button.callback('Shuffle Participants', `${ADMIN_ACTIONS.SHUFFLE}|${tournamentId}`), Markup.button.callback('Generate Bracket', `${ADMIN_ACTIONS.GENERATE_BRACKET}|${tournamentId}`)],
    [Markup.button.callback('Start Tournament', `${ADMIN_ACTIONS.START}|${tournamentId}`), Markup.button.callback('Pause Tournament', `${ADMIN_ACTIONS.PAUSE}|${tournamentId}`)],
    [Markup.button.callback('Resume Tournament', `${ADMIN_ACTIONS.RESUME}|${tournamentId}`), Markup.button.callback('End Tournament', `${ADMIN_ACTIONS.END}|${tournamentId}`)],
    [Markup.button.callback('View Participants', `${ADMIN_ACTIONS.VIEW_PARTICIPANTS}|${tournamentId}`), Markup.button.callback('Export Participants', `${ADMIN_ACTIONS.EXPORT_PARTICIPANTS}|${tournamentId}`)],
  ]);
}

export function buildTournamentSummary(tournament) {
  const prizeDist = JSON.parse(tournament.prize_distribution || '[]');
  return [
    `🏆 <b>${tournament.title}</b>`,
    `Type: ${tournament.type === TOURNAMENT_TYPE.FREE ? 'Free' : 'Paid'}`,
    `Status: ${formatTournamentStatus(tournament.status)}`,
    `Players: ${tournament.max_players || '∞'}`,
    `Prize Pool: ₹${tournament.prize_pool}`,
    `Prizes:\n${formatPrizeDistribution(prizeDist)}`,
    `Registration: ${tournament.registration_open ? 'Open' : 'Closed'}`,
    `Start: ${formatDateTime(tournament.start_date)}`,
    `End: ${formatDateTime(tournament.end_date)}`,
  ].join('\n');
}

export function buildTournamentDetails(tournament, participantCount = 0) {
  const prizeDist = JSON.parse(tournament.prize_distribution || '[]');
  return [
    `🏆 <b>${tournament.title}</b>`,
    `Type: ${tournament.type === TOURNAMENT_TYPE.FREE ? 'Free Tournament' : 'Paid Tournament'}`,
    `Status: ${formatTournamentStatus(tournament.status)}`,
    `Registered Players: ${participantCount}`,
    `Registration fee: ${tournament.registration_fee ? `₹${tournament.registration_fee}` : 'Free'}`,
    `Prize Pool: ₹${tournament.prize_pool}`,
    `Prizes:\n${formatPrizeDistribution(prizeDist)}`,
    `Start date: ${formatDateTime(tournament.start_date)}`,
    `End date: ${formatDateTime(tournament.end_date)}`,
    `Tournament ID: ${tournament.id}`,
  ].join('\n');
}

export function buildRegisterKeyboard(tournamentId, isOpen) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(isOpen ? 'Register for Tournament' : 'Registration Closed', `register|${tournamentId}`)],
  ]);
}
