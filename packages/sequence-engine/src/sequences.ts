import { BOARD_SIZE, isCell, isCorner, toCell, toRowColumn } from './board';

import type { ClaimedSequence, Occupant, SequenceCandidate, TeamIndex } from './types';

const DIRECTIONS = [
  { id: 'H', row: 0, column: 1 },
  { id: 'V', row: 1, column: 0 },
  { id: 'DR', row: 1, column: 1 },
  { id: 'DL', row: 1, column: -1 },
] as const;

function isInBounds(row: number, column: number): boolean {
  return row >= 0 && row < BOARD_SIZE && column >= 0 && column < BOARD_SIZE;
}

function countOverlap(left: readonly number[], right: readonly number[]): number {
  const rightCells = new Set(right);
  return left.reduce((total, cell) => total + (rightCells.has(cell) ? 1 : 0), 0);
}

export function sequenceCellOverlap(left: readonly number[], right: readonly number[]): number {
  return countOverlap(left, right);
}

export function expectedSequenceId(cells: readonly number[]): string | null {
  if (cells.length !== 5 || new Set(cells).size !== 5 || cells.some((cell) => !isCell(cell))) {
    return null;
  }

  const firstCell = cells[0];
  const secondCell = cells[1];
  if (firstCell === undefined || secondCell === undefined) {
    return null;
  }
  const first = toRowColumn(firstCell);
  const second = toRowColumn(secondCell);
  const rowStep = second.row - first.row;
  const columnStep = second.column - first.column;
  const direction = DIRECTIONS.find(
    (candidate) => candidate.row === rowStep && candidate.column === columnStep,
  );
  if (direction === undefined) {
    return null;
  }

  const isStraight = cells.every((cell, index) => {
    const coordinate = toRowColumn(cell);
    return (
      coordinate.row === first.row + index * rowStep &&
      coordinate.column === first.column + index * columnStep
    );
  });
  return isStraight ? `${direction.id}:${first.row}:${first.column}` : null;
}

function isTeamSpace(board: readonly Occupant[], cell: number, teamIndex: TeamIndex): boolean {
  return isCorner(cell) || board[cell] === teamIndex;
}

export function enumerateSequenceCandidates(
  board: readonly Occupant[],
  teamIndex: TeamIndex,
  newlyPlacedCell: number,
): SequenceCandidate[] {
  if (board.length !== BOARD_SIZE * BOARD_SIZE) {
    throw new RangeError('Sequence detection requires exactly 100 board occupants.');
  }
  if (!isCell(newlyPlacedCell) || isCorner(newlyPlacedCell)) {
    return [];
  }

  const { row: placedRow, column: placedColumn } = toRowColumn(newlyPlacedCell);
  const byId = new Map<string, SequenceCandidate>();

  for (const direction of DIRECTIONS) {
    for (let offset = -4; offset <= 0; offset += 1) {
      const startRow = placedRow + offset * direction.row;
      const startColumn = placedColumn + offset * direction.column;
      const cells: number[] = [];

      for (let step = 0; step < 5; step += 1) {
        const row = startRow + step * direction.row;
        const column = startColumn + step * direction.column;
        if (!isInBounds(row, column)) {
          cells.length = 0;
          break;
        }
        cells.push(toCell(row, column));
      }

      if (
        cells.length === 5 &&
        cells.includes(newlyPlacedCell) &&
        cells.every((cell) => isTeamSpace(board, cell, teamIndex))
      ) {
        const id = `${direction.id}:${startRow}:${startColumn}`;
        byId.set(id, { id, cells });
      }
    }
  }

  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function getProtectedCells(claimedSequences: readonly ClaimedSequence[]): Set<number> {
  const protectedCells = new Set<number>();
  for (const sequence of claimedSequences) {
    for (const cell of sequence.cells) {
      if (!isCorner(cell)) {
        protectedCells.add(cell);
      }
    }
  }
  return protectedCells;
}

export function getMaximalClaimAlternatives(input: {
  readonly board: readonly Occupant[];
  readonly teamIndex: TeamIndex;
  readonly newlyPlacedCell: number;
  readonly existingClaims: readonly ClaimedSequence[];
  readonly sequencesStillNeeded: number;
}): Array<readonly SequenceCandidate[]> {
  if (input.sequencesStillNeeded <= 0) {
    return [];
  }

  const sameTeamClaims = input.existingClaims.filter(
    (claim) => claim.teamIndex === input.teamIndex,
  );
  const candidates = enumerateSequenceCandidates(
    input.board,
    input.teamIndex,
    input.newlyPlacedCell,
  ).filter((candidate) =>
    sameTeamClaims.every((existing) => countOverlap(candidate.cells, existing.cells) <= 1),
  );

  if (candidates.length === 0) {
    return [];
  }

  if (input.sequencesStillNeeded === 1) {
    return candidates.map((candidate) => [candidate]);
  }

  const pairs: Array<readonly SequenceCandidate[]> = [];
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex];
    if (left === undefined) {
      continue;
    }
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const right = candidates[rightIndex];
      if (right !== undefined && countOverlap(left.cells, right.cells) <= 1) {
        pairs.push([left, right]);
      }
    }
  }

  const alternatives = pairs.length > 0 ? pairs : candidates.map((candidate) => [candidate]);
  return alternatives.sort((left, right) =>
    left
      .map((candidate) => candidate.id)
      .join('|')
      .localeCompare(right.map((candidate) => candidate.id).join('|')),
  );
}

export function claimSelectionMatches(
  alternative: readonly SequenceCandidate[],
  selectedIds: readonly string[],
): boolean {
  if (
    alternative.length !== selectedIds.length ||
    new Set(selectedIds).size !== selectedIds.length
  ) {
    return false;
  }
  const allowed = new Set(alternative.map((candidate) => candidate.id));
  return selectedIds.every((id) => allowed.has(id));
}
