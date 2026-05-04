'use strict';
// Fix the phase 5 transition timestamp to reflect actual current time (before file creation)
// The phase 5 entry was set to 18:00 UTC (future time), but files were created at 14:58 UTC.
// Update to 14:45 UTC (before file creation) so the mtime check passes.
const path = require('path');
const lib = require(path.join(process.env.HOME, '.claude/plugins/cache/vcsdd-claude-code/vcsdd/1.0.0/scripts/lib/vcsdd-state.js'));
const { readState, writeState } = lib;

const FEATURE = 'ui-feed-list-actions';
const state = readState(FEATURE);

// Find and update the phase 5 entry timestamp
for (const entry of state.phaseHistory) {
  if (entry.to === '5') {
    const oldTs = entry.timestamp;
    entry.timestamp = '2026-05-04T14:45:00.000Z';
    console.log('Updated phase 5 entry timestamp from', oldTs, 'to', entry.timestamp);
    break;
  }
}

writeState(FEATURE, state);
console.log('State updated');
