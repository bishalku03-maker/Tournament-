import { MongoClient } from 'mongodb';
import Database from 'better-sqlite3';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Storage {
  static async create({ mongoUri, mongoDbName, databasePath }) {
    if (mongoUri) {
      return await MongoStorage.create(mongoUri, mongoDbName);
    }
    return new SQLiteStorage(databasePath || path.join(__dirname, '../database.sqlite'));
  }
}

class MongoStorage {
  constructor(client, db) {
    this.client = client;
    this.db = db;
  }

  static async create(mongoUri, mongoDbName = 'tournamentBot') {
    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db(mongoDbName);
    const storage = new MongoStorage(client, db);
    await storage.init();
    return storage;
  }

  async init() {
    await this.db.collection('participants').createIndex({ tournament_id: 1, telegram_id: 1 }, { unique: true });
    await this.db.collection('tournaments').createIndex({ created_at: -1 });
    await this.db.collection('matches').createIndex({ tournament_id: 1 });
  }

  async createTournament(params) {
    const tournament = {
      id: params.id,
      title: params.title,
      type: params.type,
      max_players: params.max_players,
      registration_fee: params.registration_fee,
      prize_pool: params.prize_pool,
      prize_distribution: params.prize_distribution,
      status: params.status,
      registration_open: params.registration_open,
      start_date: params.start_date,
      end_date: params.end_date,
      rounds: params.rounds,
      bracket_json: params.bracket_json,
      schedule_json: params.schedule_json,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await this.db.collection('tournaments').insertOne(tournament);
    return tournament;
  }

  async getActiveTournament() {
    return await this.db.collection('tournaments').find().sort({ created_at: -1 }).limit(1).next();
  }

  async getTournamentById(id) {
    return await this.db.collection('tournaments').findOne({ id });
  }

  async getParticipants(tournamentId) {
    return await this.db.collection('participants')
      .find({ tournament_id: tournamentId, status: 'active' })
      .sort({ registered_at: 1 })
      .toArray();
  }

  async getParticipant(tournamentId, telegramId) {
    return await this.db.collection('participants').findOne({ tournament_id: tournamentId, telegram_id: telegramId });
  }

  async getParticipantCount(tournamentId, status = 'active') {
    return await this.db.collection('participants').countDocuments({ tournament_id: tournamentId, status });
  }

  async addParticipant(tournamentId, telegramId, username, bingoUsername) {
    try {
      await this.db.collection('participants').insertOne({
        tournament_id: tournamentId,
        telegram_id: telegramId,
        username,
        bingo_username: bingoUsername,
        registered_at: new Date().toISOString(),
        status: 'active',
      });
      return true;
    } catch (error) {
      if (error.code === 11000) {
        return false;
      }
      throw error;
    }
  }

  async updateTournament(id, updates) {
    updates.updated_at = new Date().toISOString();
    await this.db.collection('tournaments').updateOne({ id }, { $set: updates });
  }

  async deleteMatchesByTournamentId(tournamentId) {
    await this.db.collection('matches').deleteMany({ tournament_id: tournamentId });
  }

  async insertMatches(matches) {
    if (matches.length === 0) return;
    const documents = matches.map((match) => ({
      id: match.id,
      tournament_id: match.tournamentId,
      round: match.round,
      player_a: match.playerA,
      player_b: match.playerB,
      scheduled_at: null,
      status: match.status === 'bye' ? 'bye' : 'pending',
      winner: null,
      result: null,
      created_at: new Date().toISOString(),
    }));
    await this.db.collection('matches').insertMany(documents);
  }
}

class SQLiteStorage {
  constructor(databasePath) {
    const shouldInit = !fs.existsSync(databasePath);
    this.db = new Database(databasePath);
    if (shouldInit) {
      this.init();
    }
  }

  init() {
    this.db.exec(`
      CREATE TABLE admins (
        telegram_id TEXT PRIMARY KEY,
        username TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE tournaments (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        max_players INTEGER DEFAULT 0,
        registration_fee INTEGER DEFAULT 0,
        prize_pool INTEGER DEFAULT 0,
        prize_distribution TEXT DEFAULT '',
        status TEXT NOT NULL,
        registration_open INTEGER DEFAULT 0,
        start_date TEXT,
        end_date TEXT,
        rounds INTEGER DEFAULT 0,
        bracket_json TEXT DEFAULT '',
        schedule_json TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id TEXT NOT NULL,
        telegram_id TEXT NOT NULL,
        username TEXT,
        bingo_username TEXT,
        registered_at TEXT DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active',
        UNIQUE(tournament_id, telegram_id)
      );

      CREATE TABLE matches (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL,
        round INTEGER NOT NULL,
        player_a TEXT,
        player_b TEXT,
        scheduled_at TEXT,
        status TEXT DEFAULT 'pending',
        winner TEXT,
        result TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE statistics (
        telegram_id TEXT PRIMARY KEY,
        matches_played INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        tournament_wins INTEGER DEFAULT 0,
        runner_up INTEGER DEFAULT 0,
        third_place INTEGER DEFAULT 0,
        current_streak INTEGER DEFAULT 0,
        highest_finish TEXT DEFAULT ''
      );
    `);
  }

  async createTournament(params) {
    const id = params.id;
    this.db.prepare(`INSERT INTO tournaments (id, title, type, max_players, registration_fee, prize_pool, prize_distribution, status, registration_open, start_date, end_date, rounds, bracket_json, schedule_json) VALUES (@id, @title, @type, @max_players, @registration_fee, @prize_pool, @prize_distribution, @status, @registration_open, @start_date, @end_date, @rounds, @bracket_json, @schedule_json)`).run({
      id,
      title: params.title,
      type: params.type,
      max_players: params.max_players,
      registration_fee: params.registration_fee,
      prize_pool: params.prize_pool,
      prize_distribution: params.prize_distribution,
      status: params.status,
      registration_open: params.registration_open,
      start_date: params.start_date,
      end_date: params.end_date,
      rounds: params.rounds,
      bracket_json: params.bracket_json,
      schedule_json: params.schedule_json,
    });
    return this.getTournamentById(id);
  }

  async getActiveTournament() {
    return this.db.prepare('SELECT * FROM tournaments ORDER BY created_at DESC LIMIT 1').get();
  }

  async getTournamentById(id) {
    return this.db.prepare('SELECT * FROM tournaments WHERE id = @id').get({ id });
  }

  async getParticipants(tournamentId) {
    return this.db.prepare('SELECT * FROM participants WHERE tournament_id = @tournamentId AND status = @status ORDER BY registered_at ASC').all({
      tournamentId,
      status: 'active',
    });
  }

  async getParticipant(tournamentId, telegramId) {
    return this.db.prepare('SELECT * FROM participants WHERE tournament_id = @tournamentId AND telegram_id = @telegramId').get({
      tournamentId,
      telegramId,
    });
  }

  async getParticipantCount(tournamentId, status = 'active') {
    return this.db.prepare('SELECT COUNT(*) as count FROM participants WHERE tournament_id = @id AND status = @status').get({
      id: tournamentId,
      status,
    }).count;
  }

  async addParticipant(tournamentId, telegramId, username, bingoUsername) {
    try {
      this.db.prepare('INSERT INTO participants (tournament_id, telegram_id, username, bingo_username) VALUES (@tournamentId, @telegramId, @username, @bingoUsername)').run({
        tournamentId,
        telegramId,
        username,
        bingoUsername,
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async updateTournament(id, updates) {
    const setParts = [];
    const params = { id };
    for (const [key, value] of Object.entries(updates)) {
      setParts.push(`${key} = @${key}`);
      params[key] = value;
    }
    params.updated_at = new Date().toISOString();
    setParts.push('updated_at = @updated_at');
    this.db.prepare(`UPDATE tournaments SET ${setParts.join(', ')} WHERE id = @id`).run(params);
  }

  async deleteMatchesByTournamentId(tournamentId) {
    this.db.prepare('DELETE FROM matches WHERE tournament_id = @id').run({ id: tournamentId });
  }

  async insertMatches(matches) {
    const insert = this.db.prepare('INSERT INTO matches (id, tournament_id, round, player_a, player_b, scheduled_at, status) VALUES (@id, @tournamentId, @round, @playerA, @playerB, @scheduledAt, @status)');
    const transaction = this.db.transaction(() => {
      matches.flat().forEach((match) => {
        insert.run({
          id: match.id,
          tournamentId: match.tournamentId,
          round: match.round,
          playerA: match.playerA,
          playerB: match.playerB,
          scheduledAt: null,
          status: match.status === 'bye' ? 'bye' : 'pending',
        });
      });
    });
    transaction();
  }
}
