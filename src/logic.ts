import { BOARD_LAYOUT, parseCardString, BoardCell, GameState, Player, ClientGameState, PLAYER_COLORS } from './types';

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
export function toClientState(game: GameState, forPlayerId: string): ClientGameState {
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
    players: game.players.map(p => ({
      playerId: p.playerId,
      name: p.name,
      color: p.color,
      handCount: p.hand.length,
      hand: p.playerId === forPlayerId ? p.hand : [],
      connected: p.connected,
      surrendered: p.surrendered,
    })),
  };
}

type Coord = [number, number];

/**
 * Find every *maximal* contiguous run of this player's chips (or wild
 * corners) along one line direction. A "run" here means a straight,
 * unbroken chain — this is deliberately not yet broken into individual
 * 5-chip sequences, because how many actual sequences a run is worth
 * depends on its total length (see checkSequences below).
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

      // Only start tracing a run from its true starting cell, i.e. the
      // previous cell along this direction is NOT part of the run. This
      // guarantees each maximal run is discovered exactly once.
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

/**
 * Sequence's actual rule: two sequences may share at most one chip. Packed
 * end-to-end along a straight run of N chips, that yields
 * floor((N - 5) / 4) + 1 independent 5-chip sequences (N=5 -> 1, N=6..8 -> 1,
 * N=9 -> 2, N=13 -> 3, ...).
 */
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
