import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { Storage } from './db.js';
import { generateId, formatDateTime, buildSingleEliminationBracket, buildSchedule, formatPrizeDistribution } from './utils.js';
import { isAdmin, buildAdminKeyboard, buildTournamentSummary, buildTournamentDetails, buildRegisterKeyboard } from './admin.js';
import { ADMIN_ACTIONS, TOURNAMENT_STATUS, TOURNAMENT_TYPE, MATCH_STATUS } from './constants.js';

const bot = new Telegraf(process.env.BOT_TOKEN);
const ownerId = process.env.OWNER_ID;
const db = new Storage(process.env.DATABASE_PATH);

function createTournament(params) {
  const id = generateId('tourn');
  db.run(`INSERT INTO tournaments (id, title, type, max_players, registration_fee, prize_pool, prize_distribution, status, registration_open, start_date, end_date, rounds, bracket_json, schedule_json) VALUES (@id, @title, @type, @max_players, @registration_fee, @prize_pool, @prize_distribution, @status, @registration_open, @start_date, @end_date, @rounds, @bracket_json, @schedule_json)`, {
    id,
    title: params.title,
    type: params.type,
    max_players: params.maxPlayers || 0,
    registration_fee: params.registrationFee || 0,
    prize_pool: params.prizePool || 0,
    prize_distribution: JSON.stringify(params.prizeDistribution || []),
    status: TOURNAMENT_STATUS.DRAFT,
    registration_open: 0,
    start_date: params.startDate || null,
    end_date: params.endDate || null,
    rounds: params.rounds || 0,
    bracket_json: JSON.stringify([]),
    schedule_json: JSON.stringify([]),
  });
  return db.get('SELECT * FROM tournaments WHERE id = @id', { id });
}

function getActiveTournament() {
  return db.get('SELECT * FROM tournaments ORDER BY created_at DESC LIMIT 1');
}

function getParticipants(tournamentId) {
  return db.all('SELECT * FROM participants WHERE tournament_id = @tournamentId AND status = @status ORDER BY registered_at ASC', {
    tournamentId,
    status: 'active',
  });
}

function registerPlayer(tournament, user) {
  try {
    db.run(`INSERT INTO participants (tournament_id, telegram_id, username, bingo_username) VALUES (@tournamentId, @telegramId, @username, @bingoUsername)`, {
      tournamentId: tournament.id,
      telegramId: user.id.toString(),
      username: user.username || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      bingoUsername: user.username || '',
    });
    return true;
  } catch (error) {
    return false;
  }
}

function generateBracket(tournamentId) {
  const participants = getParticipants(tournamentId);
  const playerIds = participants.map((p) => p.telegram_id);
  const rounds = buildSingleEliminationBracket(playerIds);
  db.run('UPDATE tournaments SET bracket_json = @bracket, status = @status WHERE id = @id', {
    bracket: JSON.stringify(rounds),
    status: TOURNAMENT_STATUS.BRACKET,
    id: tournamentId,
  });
  db.run('DELETE FROM matches WHERE tournament_id = @id', { id: tournamentId });
  const insert = db.db.prepare('INSERT INTO matches (id, tournament_id, round, player_a, player_b, scheduled_at, status) VALUES (@id, @tournamentId, @round, @playerA, @playerB, @scheduledAt, @status)');
  db.transaction(() => {
    rounds.flat().forEach((match) => {
      insert.run({
        id: match.id,
        tournamentId,
        round: match.round,
        playerA: match.playerA,
        playerB: match.playerB,
        scheduledAt: null,
        status: match.status === 'bye' ? MATCH_STATUS.BYE : MATCH_STATUS.PENDING,
      });
    });
  });
  return rounds;
}

function buildTournamentKeyboard(tournament) {
  const isOpen = tournament.registration_open === 1 && tournament.status === TOURNAMENT_STATUS.REGISTRATION;
  const keyboard = [
    [Markup.button.callback('View Tournament', `view_tournament|${tournament.id}`)],
  ];
  if (isOpen) keyboard.push([Markup.button.callback('Register', `register|${tournament.id}`)]);
  return Markup.inlineKeyboard(keyboard);
}

bot.start(async (ctx) => {
  const tournament = getActiveTournament();
  if (!tournament) {
    return ctx.reply('Welcome to the Bingo Tournament Bot. An admin can create a tournament to get started.');
  }
  const participantCount = db.get('SELECT COUNT(*) as count FROM participants WHERE tournament_id = @id', { id: tournament.id }).count;
  await ctx.replyWithHTML(buildTournamentDetails(tournament, participantCount), buildTournamentKeyboard(tournament));
});

bot.command('create', async (ctx) => {
  if (!isAdmin(ctx, ownerId)) {
    return ctx.reply('You are not authorized to use this command.');
  }
  const examplePrize = JSON.stringify([
    { place: '1st Prize', amount: '₹3000' },
    { place: '2nd Prize', amount: '₹1500' },
    { place: '3rd Prize', amount: '₹500' },
  ]);
  const tournament = createTournament({
    title: 'Bingo Championship',
    type: TOURNAMENT_TYPE.FREE,
    maxPlayers: 64,
    registrationFee: 0,
    prizePool: 0,
    prizeDistribution: [{ place: 'Winner', amount: '20,000 Bingo Coins' }],
    startDate: null,
    endDate: null,
    rounds: 0,
  });
  await ctx.reply('Tournament draft created. Use the admin panel to configure registration, schedule, and bracket generation.');
  await ctx.replyWithHTML(buildTournamentSummary(tournament), { ...Markup.inlineKeyboard([]) });
});

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx, ownerId)) {
    return ctx.reply('This command is for admins only.');
  }
  const tournament = getActiveTournament();
  if (!tournament) {
    return ctx.reply('No tournament found. Create one first with /create.');
  }
  await ctx.replyWithHTML(buildTournamentSummary(tournament), buildAdminKeyboard(tournament.id));
});

bot.action(/register\|(.*)/, async (ctx) => {
  const tournamentId = ctx.match[1];
  const tournament = db.get('SELECT * FROM tournaments WHERE id = @id', { id: tournamentId });
  if (!tournament) {
    return ctx.answerCbQuery('Tournament not found.');
  }
  if (!tournament.registration_open) {
    return ctx.answerCbQuery('Registration is closed.');
  }
  const existing = db.get('SELECT * FROM participants WHERE tournament_id = @tournamentId AND telegram_id = @telegramId', {
    tournamentId,
    telegramId: ctx.from.id.toString(),
  });
  if (existing) {
    return ctx.answerCbQuery('You are already registered.');
  }
  const participantCount = db.get('SELECT COUNT(*) as count FROM participants WHERE tournament_id = @id AND status = @status', {
    id: tournamentId,
    status: 'active',
  }).count;
  if (tournament.max_players && participantCount >= tournament.max_players) {
    return ctx.answerCbQuery('The tournament is full.');
  }
  const registered = registerPlayer(tournament, ctx.from);
  if (!registered) {
    return ctx.answerCbQuery('Unable to register. Please try again.');
  }
  await ctx.answerCbQuery('You have successfully registered.');
  await ctx.replyWithHTML(`✅ <b>Registered for ${tournament.title}</b>\nPlease ensure you have started @${process.env.BINGO_BOT_USERNAME} to receive match updates.`);
});

bot.action(/view_tournament\|(.*)/, async (ctx) => {
  const tournamentId = ctx.match[1];
  const tournament = db.get('SELECT * FROM tournaments WHERE id = @id', { id: tournamentId });
  if (!tournament) {
    return ctx.answerCbQuery('Tournament not found.');
  }
  const participantCount = db.get('SELECT COUNT(*) as count FROM participants WHERE tournament_id = @id AND status = @status', {
    id: tournamentId,
    status: 'active',
  }).count;
  await ctx.answerCbQuery();
  return ctx.replyWithHTML(buildTournamentDetails(tournament, participantCount));
});

bot.action(new RegExp(`(${Object.values(ADMIN_ACTIONS).join('|')})\|(.+)`), async (ctx) => {
  if (!isAdmin(ctx, ownerId)) {
    return ctx.answerCbQuery('Unauthorized action.');
  }
  const action = ctx.match[1];
  const tournamentId = ctx.match[2];
  const tournament = db.get('SELECT * FROM tournaments WHERE id = @id', { id: tournamentId });
  if (!tournament) {
    return ctx.answerCbQuery('Tournament not found.');
  }

  switch (action) {
    case ADMIN_ACTIONS.OPEN_REG:
      db.run('UPDATE tournaments SET registration_open = 1, status = @status WHERE id = @id', { status: TOURNAMENT_STATUS.REGISTRATION, id: tournamentId });
      await ctx.answerCbQuery('Registration opened.');
      return ctx.editMessageText(buildTournamentSummary({ ...tournament, registration_open: 1, status: TOURNAMENT_STATUS.REGISTRATION }), { parse_mode: 'HTML', reply_markup: buildAdminKeyboard(tournamentId).reply_markup });
    case ADMIN_ACTIONS.CLOSE_REG:
      db.run('UPDATE tournaments SET registration_open = 0 WHERE id = @id', { id: tournamentId });
      await ctx.answerCbQuery('Registration closed.');
      return ctx.editMessageText(buildTournamentSummary({ ...tournament, registration_open: 0 }), { parse_mode: 'HTML', reply_markup: buildAdminKeyboard(tournamentId).reply_markup });
    case ADMIN_ACTIONS.SHUFFLE:
      await ctx.answerCbQuery('Participants shuffled.');
      return ctx.reply('Participant order can be randomized during bracket generation.');
    case ADMIN_ACTIONS.GENERATE_BRACKET: {
      const rounds = generateBracket(tournamentId);
      await ctx.answerCbQuery('Bracket generated.');
      return ctx.reply(`Bracket created with ${rounds.length} rounds.`);
    }
    case ADMIN_ACTIONS.START:
      db.run('UPDATE tournaments SET status = @status WHERE id = @id', { status: TOURNAMENT_STATUS.RUNNING, id: tournamentId });
      await ctx.answerCbQuery('Tournament started.');
      return ctx.reply('Tournament status set to running. Notify players and update match status as results arrive.');
    case ADMIN_ACTIONS.PAUSE:
      db.run('UPDATE tournaments SET status = @status WHERE id = @id', { status: TOURNAMENT_STATUS.PAUSED, id: tournamentId });
      await ctx.answerCbQuery('Tournament paused.');
      return ctx.reply('Tournament paused. Use resume to continue.');
    case ADMIN_ACTIONS.RESUME:
      db.run('UPDATE tournaments SET status = @status WHERE id = @id', { status: TOURNAMENT_STATUS.RUNNING, id: tournamentId });
      await ctx.answerCbQuery('Tournament resumed.');
      return ctx.reply('Tournament resumed.');
    case ADMIN_ACTIONS.END:
      db.run('UPDATE tournaments SET status = @status WHERE id = @id', { status: TOURNAMENT_STATUS.COMPLETED, id: tournamentId });
      await ctx.answerCbQuery('Tournament ended.');
      return ctx.reply('Tournament completed. Final results can be published.');
    case ADMIN_ACTIONS.VIEW_PARTICIPANTS: {
      const participants = getParticipants(tournamentId);
      const text = participants.length > 0
        ? participants.map((p, index) => `${index + 1}. ${p.username} (${p.telegram_id})`).join('\n')
        : 'No participants yet.';
      await ctx.answerCbQuery('Participants listed.');
      return ctx.replyWithHTML(`<b>Registered Players:</b>\n${text}`);
    }
    case ADMIN_ACTIONS.EXPORT_PARTICIPANTS: {
      const participants = getParticipants(tournamentId);
      const csv = ['telegram_id,username,registered_at', ...participants.map((p) => `${p.telegram_id},${p.username},${p.registered_at}`)].join('\n');
      await ctx.answerCbQuery('Participants exported.');
      return ctx.replyWithDocument({ source: Buffer.from(csv, 'utf-8'), filename: `${tournament.title.replace(/\s+/g, '_')}_participants.csv` });
    }
    default:
      return ctx.answerCbQuery('Action not implemented yet.');
  }
});

bot.command('status', async (ctx) => {
  const tournament = getActiveTournament();
  if (!tournament) {
    return ctx.reply('No active tournament at the moment.');
  }
  const participantCount = db.get('SELECT COUNT(*) as count FROM participants WHERE tournament_id = @id', { id: tournament.id }).count;
  return ctx.replyWithHTML(buildTournamentDetails(tournament, participantCount));
});

bot.launch().then(() => {
  console.log('Tournament bot started.');
}).catch((err) => {
  console.error('Failed to start bot', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
