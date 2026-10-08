import { createGame } from '@onceworlds/engine';
import { config } from './game.config.js';

// The only file that starts the game. Tests and `onceworlds check` import game.config.js instead, so importing it never starts anything.
if (typeof document !== 'undefined') createGame(config).start();
