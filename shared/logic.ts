import { BOARD_LAYOUT, parseCardString, BoardCell, GameState, Player, ClientGameState, PLAYER_COLORS, RatingDelta, PlayerProfile, Card } from './types';

const BOARD_SIZE = 10;

export function createInitialBoard(): BoardCell[][] {
  return BOARD_LAYOUT.map(row =>
    row.map(cardStr => ({
      card: parseCardString(cardStr),
      chip: cardStr === null ? 'wild' : null,
      isLocked: false
    }))
  );
}

/** First color in the palette not currently held by another seated player. */
export function pickAvailableColor(players: Player[]): string {
  const used = new Set(players.map(p => p.color));
  const free = PLAYER_COLORS.find(c => !used.has(c));
  return free ?? PLAYER_COLORS[players.length % PLAYER_COLORS.length];
}

/** Redact a server GameState down to what one specific player is allowed to see. */
export function toClientState(game: GameState, forPlayerId: string, getProfileFn?: (playerId: string) => any): ClientGameState {
  const spectatorCount = game.spectators?.filter(s => s.connected).length ?? 0;
  return {
    roomId: game.roomId,
    board: game.board,
    turnIndex: game.turnIndex,
    deckCount: game.deck.length,
    status: game.status,
    winner: game.winner,
    lastMove: game.lastMove,
    youPlayerId: forPlayerId,
    winningSequences: game.winningSequences,
    winningCells: game.winningCells,
    isTeamGame: game.isTeamGame,
    winningTeam: game.winningTeam,
    winningPlayerNames: game.winningPlayerNames,
    gameStats: game.gameStats,
    rematchVotes: game.rematchVotes,
    turnDeadline: game.turnDeadline,
    turnDurationSeconds: game.turnDurationSeconds ?? 30,
    undoAvailableForPlayerId: game.undoAvailableForPlayerId,
    undoDeadline: game.undoDeadline,
    rewardBreakdown: game.rewardBreakdowns?.[forPlayerId] ?? null,
    allowSpectators: game.allowSpectators ?? true,
    spectatorCount,
    isSpectator: false,
    isRanked: game.isRanked,
    hostPlayerId: game.hostPlayerId,
    ratingDeltas: game.ratingDeltas,
    tournamentId: game.tournamentId ?? null,
    activityFeed: game.activityFeed ?? [],
    players: game.players.map(p => {
      const prof = getProfileFn ? getProfileFn(p.playerId) : null;
      return {
        playerId: p.playerId,
        name: p.name,
        color: p.color,
        isBot: p.isBot,
        botDifficulty: p.botDifficulty,
        rankedRating: prof?.rankedRating ?? 1000,
        avatar: prof?.avatar ?? 'avatar_default',
        equippedCosmetics: prof?.equippedCosmetics ?? {
          boardTheme: 'board_classic',
          chipSkin: 'chip_classic',
          cardBack: 'card_classic',
          avatar: 'avatar_default',
          victoryEffect: 'victory_confetti',
          emote: 'emote_thumbsup',
        },
        handCount: p.hand.length,
        hand: p.playerId === forPlayerId ? p.hand : [],
        connected: p.connected,
        surrendered: p.surrendered,
      };
    }),
  };
}

/** Redact server GameState down to what a spectator is allowed to see (all hands hidden). */
export function toSpectatorState(game: GameState, spectatorId: string, getProfileFn?: (playerId: string) => any): ClientGameState {
  const spectatorCount = game.spectators?.filter(s => s.connected).length ?? 0;
  return {
    roomId: game.roomId,
    board: game.board,
    turnIndex: game.turnIndex,
    deckCount: game.deck.length,
    status: game.status,
    winner: game.winner,
    lastMove: game.lastMove,
    youPlayerId: spectatorId,
    winningSequences: game.winningSequences,
    winningCells: game.winningCells,
    isTeamGame: game.isTeamGame,
    winningTeam: game.winningTeam,
    winningPlayerNames: game.winningPlayerNames,
    gameStats: game.gameStats,
    rematchVotes: game.rematchVotes,
    turnDeadline: game.turnDeadline,
    turnDurationSeconds: game.turnDurationSeconds ?? 30,
    undoAvailableForPlayerId: null,
    undoDeadline: null,
    rewardBreakdown: null,
    allowSpectators: game.allowSpectators ?? true,
    spectatorCount,
    isSpectator: true,
    isRanked: game.isRanked,
    hostPlayerId: game.hostPlayerId,
    ratingDeltas: game.ratingDeltas,
    tournamentId: game.tournamentId ?? null,
    activityFeed: game.activityFeed ?? [],
    players: game.players.map(p => {
      const prof = getProfileFn ? getProfileFn(p.playerId) : null;
      return {
        playerId: p.playerId,
        name: p.name,
        color: p.color,
        isBot: p.isBot,
        botDifficulty: p.botDifficulty,
        rankedRating: prof?.rankedRating ?? 1000,
        avatar: prof?.avatar ?? 'avatar_default',
        equippedCosmetics: prof?.equippedCosmetics ?? {
          boardTheme: 'board_classic',
          chipSkin: 'chip_classic',
          cardBack: 'card_classic',
          avatar: 'avatar_default',
          victoryEffect: 'victory_confetti',
          emote: 'emote_thumbsup',
        },
        handCount: p.hand.length,
        hand: [], // Spectators NEVER see any player's private cards!
        connected: p.connected,
        surrendered: p.surrendered,
      };
    }),
  };
}

type Coord = [number, number];

/**
 * Find every *maximal* contiguous run of this player's chips (or wild corners).
 */
function findRuns(board: BoardCell[][], color: string, dr: number, dc: number): Coord[][] {
  const inBounds = (r: number, c: number) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
  const isPlayerChip = (r: number, c: number) => {
    if (!inBounds(r, c)) return false;
    const cell = board[r][c];
    return cell.chip === color || cell.chip === 'wild';
  };

  const runs: Coord[][] = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!isPlayerChip(r, c)) continue;

      if (isPlayerChip(r - dr, c - dc)) continue;

      const run: Coord[] = [];
      let rr = r;
      let cc = c;
      while (isPlayerChip(rr, cc)) {
        run.push([rr, cc]);
        rr += dr;
        cc += dc;
      }
      if (run.length >= 5) runs.push(run);
    }
  }

  return runs;
}

/** Check 5-in-a-row sequences for a given chip color */
export function checkSequences(board: BoardCell[][], color: string): { count: number; cells: Coord[]; sequences: Coord[][] } {
  const directions: Coord[] = [
    [0, 1],  // horizontal
    [1, 0],  // vertical
    [1, 1],  // diagonal \
    [1, -1], // diagonal /
  ];

  let totalCount = 0;
  const usedCells = new Set<string>();
  const sequences: Coord[][] = [];

  for (const [dr, dc] of directions) {
    const runs = findRuns(board, color, dr, dc);
    for (const run of runs) {
      const n = run.length;
      const seqCount = 1 + Math.floor((n - 5) / 4);
      totalCount += seqCount;
      for (let k = 0; k < seqCount; k++) {
        const seq: Coord[] = [];
        for (let i = 0; i < 5; i++) {
          const [r, c] = run[4 * k + i];
          seq.push([r, c]);
          usedCells.add(`${r},${c}`);
        }
        sequences.push(seq);
      }
    }
  }

  const cells: Coord[] = Array.from(usedCells).map(s => {
    const [r, c] = s.split(',').map(Number);
    return [r, c] as Coord;
  });

  return { count: totalCount, cells, sequences };
}

// ============================================================================
// Feature 20: AI / Bot Heuristic Engine
// ============================================================================

export interface BotMoveCandidate {
  cardId: string;
  row: number;
  col: number;
  type: 'place' | 'remove';
  score: number;
}

/**
 * Evaluates the bot's hand against the current board state and picks the optimal move.
 * Does NOT inspect opponents' hidden cards or future deck order.
 */
export function evaluateBotMove(game: GameState, botPlayer: Player): BotMoveCandidate | null {
  if (!botPlayer.hand || botPlayer.hand.length === 0) return null;

  const candidates: BotMoveCandidate[] = [];
  const difficulty = botPlayer.botDifficulty || 'medium';

  // 1. Gather all legal moves for each card in the bot's hand
  for (const card of botPlayer.hand) {
    if (card.rank === 'J') {
      const isTwoEyed = card.suit === 'C' || card.suit === 'D';
      const isOneEyed = card.suit === 'H' || card.suit === 'S';

      if (isTwoEyed) {
        // Two-Eyed Jack: Place chip on ANY open board cell (non-corner)
        for (let r = 0; r < BOARD_SIZE; r++) {
          for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = game.board[r][c];
            if (cell.card !== null && !cell.chip) {
              candidates.push({
                cardId: card.id,
                row: r,
                col: c,
                type: 'place',
                score: scorePlacement(game.board, botPlayer.color, r, c, true),
              });
            }
          }
        }
      } else if (isOneEyed) {
        // One-Eyed Jack: Remove an opponent's un-locked chip
        for (let r = 0; r < BOARD_SIZE; r++) {
          for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = game.board[r][c];
            if (cell.chip && cell.chip !== 'wild' && cell.chip !== botPlayer.color && !cell.isLocked) {
              candidates.push({
                cardId: card.id,
                row: r,
                col: c,
                type: 'remove',
                score: scoreRemoval(game.board, cell.chip, r, c),
              });
            }
          }
        }
      }
    } else {
      // Normal card: Place chip on matching open board cell
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const cell = game.board[r][c];
          if (!cell.chip && cell.card && cell.card.rank === card.rank && cell.card.suit === card.suit) {
            candidates.push({
              cardId: card.id,
              row: r,
              col: c,
              type: 'place',
              score: scorePlacement(game.board, botPlayer.color, r, c, false),
            });
          }
        }
      }
    }
  }

  if (candidates.length === 0) return null;

  if (difficulty === 'easy') {
    // Easy Bot: Select mostly random legal move
    const randomIndex = Math.floor(Math.random() * candidates.length);
    return candidates[randomIndex];
  }

  // Medium Bot: Sort by score descending and return the top-scoring move
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

/** Score a potential chip placement at (r, c) */
function scorePlacement(board: BoardCell[][], color: string, r: number, c: number, isTwoEyedJack: boolean): number {
  let score = 10; // Base score for placing a chip

  // Simulated board with the proposed placement
  const tempBoard = board.map(row => row.map(cell => ({ ...cell })));
  tempBoard[r][c].chip = color;

  // 1. Check if placement completes a 5-in-a-row sequence (+1000 pts!)
  const seqResult = checkSequences(tempBoard, color);
  if (seqResult.count > 0) {
    score += 1000;
  }

  // 2. Check if placement blocks an opponent's 3- or 4-chip line (+500 pts)
  const opponentColors = ['#2563eb', '#dc2626', '#16a34a', '#ca8a04'].filter(c => c !== color);
  for (const oppColor of opponentColors) {
    const oppBoard = board.map(row => row.map(cell => ({ ...cell })));
    oppBoard[r][c].chip = oppColor;
    const oppSeq = checkSequences(oppBoard, oppColor);
    if (oppSeq.count > 0) {
      score += 500; // Crucial block!
    }
  }

  // 3. Score adjacent friendly chips (extends existing line)
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of directions) {
    let friendlyCount = 0;
    for (const step of [-1, 1]) {
      let nr = r + dr * step;
      let nc = c + dc * step;
      while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
        if (board[nr][nc].chip === color || board[nr][nc].chip === 'wild') {
          friendlyCount++;
        } else {
          break;
        }
        nr += dr * step;
        nc += dc * step;
      }
    }
    score += friendlyCount * 25;
  }

  // Save 2-Eyed Jacks unless making a high-value move
  if (isTwoEyedJack && score < 400) {
    score -= 200;
  }

  return score;
}

/** Score a potential chip removal (One-Eyed Jack) at (r, c) */
function scoreRemoval(board: BoardCell[][], oppColor: string, r: number, c: number): number {
  let score = 5;

  // Check if removing this chip breaks an opponent's near-sequence
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of directions) {
    let oppCount = 0;
    for (const step of [-1, 1]) {
      let nr = r + dr * step;
      let nc = c + dc * step;
      while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
        if (board[nr][nc].chip === oppColor || board[nr][nc].chip === 'wild') {
          oppCount++;
        } else {
          break;
        }
        nr += dr * step;
        nc += dc * step;
      }
    }
    if (oppCount >= 3) score += 300;
    else if (oppCount >= 2) score += 100;
  }

  return score;
}

// ============================================================================
// Feature 22: Elo Rating System
// ============================================================================

export function calculateEloDeltas(game: GameState, profilesMap: Map<string, PlayerProfile>): Record<string, RatingDelta> {
  const result: Record<string, RatingDelta> = {};
  if (!game.winner || game.players.length < 2) return result;

  const K = 32;

  if (game.isTeamGame && game.players.length === 4) {
    // 2v2 Team Elo Calculation
    const teamBlue = game.players.slice(0, 2);
    const teamRed = game.players.slice(2, 4);

    const blueRatings = teamBlue.map(p => profilesMap.get(p.playerId)?.rankedRating ?? 1000);
    const redRatings = teamRed.map(p => profilesMap.get(p.playerId)?.rankedRating ?? 1000);

    const avgBlue = (blueRatings[0] + blueRatings[1]) / 2;
    const avgRed = (redRatings[0] + redRatings[1]) / 2;

    const expectedBlue = 1 / (1 + Math.pow(10, (avgRed - avgBlue) / 400));
    const expectedRed = 1 - expectedBlue;

    const blueWon = game.winningTeam === 'Team Blue' || game.winningPlayerNames?.includes(teamBlue[0].name);
    const actualBlue = blueWon ? 1 : 0;
    const actualRed = blueWon ? 0 : 1;

    const deltaBlue = Math.round(K * (actualBlue - expectedBlue));
    const deltaRed = Math.round(K * (actualRed - expectedRed));

    teamBlue.forEach((p, i) => {
      const oldR = blueRatings[i];
      const newR = Math.max(100, oldR + deltaBlue);
      result[p.playerId] = { oldRating: oldR, newRating: newR, delta: newR - oldR };
    });

    teamRed.forEach((p, i) => {
      const oldR = redRatings[i];
      const newR = Math.max(100, oldR + deltaRed);
      result[p.playerId] = { oldRating: oldR, newRating: newR, delta: newR - oldR };
    });
  } else {
    // 1v1 Free-for-all Elo Calculation
    const winnerPlayer = game.players.find(p => p.name === game.winner);
    if (!winnerPlayer) return result;

    for (const p of game.players) {
      if (p.playerId === winnerPlayer.playerId) continue;

      const p1Profile = profilesMap.get(winnerPlayer.playerId);
      const p2Profile = profilesMap.get(p.playerId);

      const r1 = p1Profile?.rankedRating ?? 1000;
      const r2 = p2Profile?.rankedRating ?? 1000;

      const expected1 = 1 / (1 + Math.pow(10, (r2 - r1) / 400));
      const expected2 = 1 - expected1;

      const delta1 = Math.round(K * (1 - expected1));
      const delta2 = Math.round(K * (0 - expected2));

      result[winnerPlayer.playerId] = {
        oldRating: r1,
        newRating: Math.max(100, r1 + delta1),
        delta: delta1,
      };

      result[p.playerId] = {
        oldRating: r2,
        newRating: Math.max(100, r2 + delta2),
        delta: delta2,
      };
    }
  }

  return result;
}
