# Telegram Bingo Tournament Bot

A professional Telegram tournament bot for Bingo events. Supports free and paid tournament modes, participant registration, bracket generation, admin controls, and tournament scheduling.

## Features

- Free and paid tournaments
- Admin commands for tournament creation and management
- Player registration with duplicate prevention
- Single-elimination bracket generation with BYE support
- Export participants as CSV
- Tournament status tracking
- Persistent SQLite storage

## Getting Started

1. Copy `.env.example` to `.env`
2. Set `BOT_TOKEN`, `OWNER_ID`, `BINGO_BOT_USERNAME`, and optionally `DATABASE_PATH`
3. Install dependencies:

```bash
npm install
```

4. Start the bot:

```bash
npm start
```

## Deploying on Render

1. Push your repository to GitHub.
2. Create a new Web Service on Render and connect it to this repository.
3. Use the default `npm install` build command and `npm start` start command.
4. Add environment variables in Render:
   - `BOT_TOKEN`
   - `OWNER_ID`
   - `BINGO_BOT_USERNAME`
   - `DATABASE_PATH` set to `./database.sqlite`
5. Enable a persistent disk if you want the SQLite database to survive restarts.

Render will run the bot as a long-lived service, which is ideal for Telegram bots.

## Admin Commands

- `/create` - Create a draft tournament
- `/admin` - View the admin panel for the latest tournament
- `/status` - View the current tournament status

## Tournament Flow

1. Admin creates a tournament with `/create`
2. Admin opens registration via the admin panel
3. Players register by pressing the button
4. Admin generates the bracket once registration closes
5. Admin starts, pauses, resumes, or ends the tournament

## Project Structure

- `src/index.js` - Main bot logic
- `src/db.js` - SQLite storage layer
- `src/admin.js` - Admin helpers and keyboards
- `src/utils.js` - Utility functions for date formatting, bracket generation, and prize formatting

## Notes

- This version implements single-elimination tournaments only
- Paid tournaments support fee and prize pool metadata, but payment collection and payout are manual
- Future work can add match automation, live bracket display, and Bingo Bot result integration
