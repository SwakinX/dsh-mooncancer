// Root re-export shim: the real host-side plugin lives in `src/index.js`.
// Kept so hosts that cached this package's pre-`src/` exports map resolve to
// a working module without a restart. See README (项目结构).
export * from './src/index.js'
