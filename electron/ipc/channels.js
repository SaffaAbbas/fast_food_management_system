// Whitelisted IPC channel constants for secure Electron communication

export const IPC_CHANNELS = {
  // App & System
  APP_GET_INFO: 'app:get-info',
  APP_PING: 'app:ping',
  
  // Window controls
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',

  // Database channels (Foundation for Phase 2)
  DB_QUERY: 'db:query',
  DB_MIGRATE: 'db:migrate',
  DB_STATUS: 'db:status',
  DB_BACKUP: 'db:backup',
  DB_RESTORE: 'db:restore',
  
  // Auth channels (Foundation for Phase 3)
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_CURRENT_USER: 'auth:current-user',
}
