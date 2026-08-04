import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { Storage } from './db.js';
import { generateId, formatDateTime, buildSingleEliminationBracket, formatPrizeDistribution } from './utils.js';
import { isAdmin, buildAdminKeyboard, buildTournamentSummary, buildTournamentDetails } from './admin.js';
import { ADMIN_ACTIONS, TOURNAMENT_STATUS, TOURNAMENT_TYPE, MATCH_STATUS } from './constants.js';

const bot = new Telegraf(process.env.BOT_TOKEN);
const ownerId = process.env.OWNER_ID;
const db = await Storage.create({
  mongoUri: process.env.MONGODB_URI,
  mongoDbName: process.env.MONGODB_DB,
  databasePath: process.env.DATABASE_PATH,
});

async function createTournament(params) {
  const id = generateId('tourn');
  return await db.createTournament({
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
}

async function getActiveTournament() {
  return await db.getActiveTournament();
}

async function getParticipants(tournamentId) {
  return await db.getParticipants(tournamentId);
}

async function registerPlayer(tournament, user) {
  return await db.addParticipant(
    tournament.id,
    user.id.toString(),
    user.username || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
    user.username || '',
  );
}

async function generateBracket(tournamentId) {
  const participants = await getParticipants(tournamentId);
  const playerIds = participants.map((p) => p.telegram_id);
  const rounds = buildSingleEliminationBracket(playerIds);
  await db.updateTournament(tournamentId, {
    bracket_json: JSON.stringify(rounds),
    status: TOURNAMENT_STATUS.BRACKET,
  });
  await db.deleteMatchesByTournamentId(tournamentId);
  await db.insertMatches(rounds.flat());
  return rounds;
}

async function safeAnswerCbQuery(ctx, text) {
  try {
    return await ctx.answerCbQuery(text);
  } catch (err) {
    const description = err?.response?.description || err?.message || '';
    if (description.includes('query is too old') || description.includes('query ID is invalid') || description.includes('query id is invalid')) {
      console.warn('Ignored expired callback query:', description);
      return;
    }
    console.error('Failed to answer callback query:', err);
  }
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
  const tournament = await getActiveTournament();
  if (!tournament) {
    return ctx.reply('Welcome to the Bingo Tournament Bot. An admin can create a tournament to get started.');
  }
  const participantCount = await db.getParticipantCount(tournament.id);
  await ctx.replyWithHTML(buildTournamentDetails(tournament, participantCount), buildTournamentKeyboard(tournament));
});

bot.command('create', async (ctx) => {
  if (!isAdmin(ctx, ownerId)) {
    return ctx.reply('You are not authorized to use this command.');
  }
  const tournament = await createTournament({
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
  const tournament = await getActiveTournament();
  if (!tournament) {
    return ctx.reply('No tournament found. Create one first with /create.');
  }
  await ctx.replyWithHTML(buildTournamentSummary(tournament), buildAdminKeyboard(tournament.id));
});

bot.action(/register\|(.*)/, async (ctx) => {
  const tournamentId = ctx.match[1];
  const tournament = await db.getTournamentById(tournamentId);
  if (!tournament) {
    return safeAnswerCbQuery(ctx, 'Tournament not found.');
  }
  if (!tournament.registration_open) {
    return safeAnswerCbQuery(ctx, 'Registration is closed.');
  }
  const existing = await db.getParticipant(tournamentId, ctx.from.id.toString());
  if (existing) {
    return safeAnswerCbQuery(ctx, 'You are already registered.');
  }
  const participantCount = await db.getParticipantCount(tournamentId);
  if (tournament.max_players && participantCount >= tournament.max_players) {
    return safeAnswerCbQuery(ctx, 'The tournament is full.');
  }
  const registered = await registerPlayer(tournament, ctx.from);
  if (!registered) {
    return safeAnswerCbQuery(ctx, 'Unable to register. Please try again.');
  }
  await safeAnswerCbQuery(ctx, 'You have successfully registered.');
  await ctx.replyWithHTML(`✅ <b>Registered for ${tournament.title}</b>\nPlease ensure you have started @${process.env.BINGO_BOT_USERNAME} to receive match updates.`);
});

bot.action(/view_tournament\|(.*)/, async (ctx) => {
  const tournamentId = ctx.match[1];
  const tournament = await db.getTournamentById(tournamentId);
  if (!tournament) {
    return safeAnswerCbQuery(ctx, 'Tournament not found.');
  }
  const participantCount = await db.getParticipantCount(tournamentId);
  await safeAnswerCbQuery(ctx);
  return ctx.replyWithHTML(buildTournamentDetails(tournament, participantCount));
});

bot.action(new RegExp(`(${Object.values(ADMIN_ACTIONS).join('|')})\|(.+)`), async (ctx) => {
  if (!isAdmin(ctx, ownerId)) {
    return safeAnswerCbQuery(ctx, 'Unauthorized action.');
  }
  const action = ctx.match[1];
  const tournamentId = ctx.match[2];
  const tournament = await db.getTournamentById(tournamentId);
  if (!tournament) {
    return safeAnswerCbQuery(ctx, 'Tournament not found.');
  }

  switch (action) {
    case ADMIN_ACTIONS.OPEN_REG:
      await db.updateTournament(tournamentId, { registration_open: 1, status: TOURNAMENT_STATUS.REGISTRATION });
      await safeAnswerCbQuery(ctx, 'Registration opened.');
      return ctx.editMessageText(buildTournamentSummary({ ...tournament, registration_open: 1, status: TOURNAMENT_STATUS.REGISTRATION }), { parse_mode: 'HTML', reply_markup: buildAdminKeyboard(tournamentId).reply_markup });
    case ADMIN_ACTIONS.CLOSE_REG:
      await db.updateTournament(tournamentId, { registration_open: 0 });
      await safeAnswerCbQuery(ctx, 'Registration closed.');
      return ctx.editMessageText(buildTournamentSummary({ ...tournament, registration_open: 0 }), { parse_mode: 'HTML', reply_markup: buildAdminKeyboard(tournamentId).reply_markup });
    case ADMIN_ACTIONS.SHUFFLE:
      await safeAnswerCbQuery(ctx, 'Participants shuffled.');
      return ctx.reply('Participant order can be randomized during bracket generation.');
    case ADMIN_ACTIONS.GENERATE_BRACKET: {
      const rounds = await generateBracket(tournamentId);
      await safeAnswerCbQuery(ctx, 'Bracket generated.');
      return ctx.reply(`Bracket created with ${rounds.length} rounds.`);
    }
    case ADMIN_ACTIONS.START:
      await db.updateTournament(tournamentId, { status: TOURNAMENT_STATUS.RUNNING });
      await safeAnswerCbQuery(ctx, 'Tournament started.');
      return ctx.reply('Tournament status set to running. Notify players and update match status as results arrive.');
    case ADMIN_ACTIONS.PAUSE:
      await db.updateTournament(tournamentId, { status: TOURNAMENT_STATUS.PAUSED });
      await safeAnswerCbQuery(ctx, 'Tournament paused.');
      return ctx.reply('Tournament paused. Use resume to continue.');
    case ADMIN_ACTIONS.RESUME:
      await db.updateTournament(tournamentId, { status: TOURNAMENT_STATUS.RUNNING });
      await safeAnswerCbQuery(ctx, 'Tournament resumed.');
      return ctx.reply('Tournament resumed.');
    case ADMIN_ACTIONS.END:
      await db.updateTournament(tournamentId, { status: TOURNAMENT_STATUS.COMPLETED });
      await safeAnswerCbQuery(ctx, 'Tournament ended.');
      return ctx.reply('Tournament completed. Final results can be published.');
    case ADMIN_ACTIONS.VIEW_PARTICIPANTS: {
      const participants = await getParticipants(tournamentId);
      const text = participants.length > 0
        ? participants.map((p, index) => `${index + 1}. ${p.username} (${p.telegram_id})`).join('\n')
        : 'No participants yet.';
      await safeAnswerCbQuery(ctx, 'Participants listed.');
      return ctx.replyWithHTML(`<b>Registered Players:</b>\n${text}`);
    }
    case ADMIN_ACTIONS.EXPORT_PARTICIPANTS: {
      const participants = await getParticipants(tournamentId);
      const csv = ['telegram_id,username,registered_at', ...participants.map((p) => `${p.telegram_id},${p.username},${p.registered_at}`)].join('\n');
      await safeAnswerCbQuery(ctx, 'Participants exported.');
      return ctx.replyWithDocument({ source: Buffer.from(csv, 'utf-8'), filename: `${tournament.title.replace(/\s+/g, '_')}_participants.csv` });
    }
    default:
      return safeAnswerCbQuery(ctx, 'Action not implemented yet.');
  }
});

bot.command('status', async (ctx) => {
  const tournament = await getActiveTournament();
  if (!tournament) {
    return ctx.reply('No active tournament at the moment.');
  }
  const participantCount = await db.getParticipantCount(tournament.id);
  return ctx.replyWithHTML(buildTournamentDetails(tournament, participantCount));
});

bot.launch().then(() => {
  console.log('Tournament bot started.');
}).catch((err) => {
  console.error('Failed to start bot', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
