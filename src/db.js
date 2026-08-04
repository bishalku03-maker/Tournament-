import Database from 'better-sqlite3';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Storage {
  constructor(databasePath) {
    const resolvedPath = databasePath || path.join(__dirname, '../database.sqlite');
    const shouldInit = !fs.existsSync(resolvedPath);
    this.db = new Database(resolvedPath);
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

  run(query, params = {}) {
    return this.db.prepare(query).run(params);
  }

  get(query, params = {}) {
    return this.db.prepare(query).get(params);
  }

  all(query, params = {}) {
    return this.db.prepare(query).all(params);
  }

  transaction(fn) {
    return this.db.transaction(fn)();
  }
}
