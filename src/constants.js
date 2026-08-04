export const ADMIN_ACTIONS = {
  CREATE: 'create_tournament',
  OPEN_REG: 'open_registration',
  CLOSE_REG: 'close_registration',
  VIEW_PARTICIPANTS: 'view_participants',
  EXPORT_PARTICIPANTS: 'export_participants',
  SHUFFLE: 'shuffle_participants',
  GENERATE_BRACKET: 'generate_bracket',
  GENERATE_SCHEDULE: 'generate_schedule',
  START: 'start_tournament',
  PAUSE: 'pause_tournament',
  RESUME: 'resume_tournament',
  END: 'end_tournament',
  DISQUALIFY: 'disqualify_player',
  RECORD_RESULT: 'record_result',
  ANNOUNCE: 'announce_results',
  VIEW_MATCHES: 'view_live_matches',
  VIEW_WINNERS: 'view_winners',
};

export const TOURNAMENT_STATUS = {
  DRAFT: 'draft',
  REGISTRATION: 'registration',
  BRACKET: 'bracket',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
};

export const MATCH_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  BYE: 'bye',
};

export const TOURNAMENT_TYPE = {
  FREE: 'free',
  PAID: 'paid',
};
