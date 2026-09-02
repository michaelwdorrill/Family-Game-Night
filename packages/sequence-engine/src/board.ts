import type { BoardCode, CardCode, Occupant } from './types';

export const BOARD_SIZE = 10;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

export const BOARD_LAYOUT = [
  ['FREE', '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', 'FREE'],
  ['6C', '5C', '4C', '3C', '2C', 'AH', 'KH', 'QH', '10H', '10S'],
  ['7C', 'AS', '2D', '3D', '4D', '5D', '6D', '7D', '9H', 'QS'],
  ['8C', 'KS', '6C', '5C', '4C', '3C', '2C', '8D', '8H', 'KS'],
  ['9C', 'QS', '7C', '6H', '5H', '4H', 'AH', '9D', '7H', 'AS'],
  ['10C', '10S', '8C', '7H', '2H', '3H', 'KH', '10D', '6H', '2D'],
  ['QC', '9S', '9C', '8H', '9H', '10H', 'QH', 'QD', '5H', '3D'],
  ['KC', '8S', '10C', 'QC', 'KC', 'AC', 'AD', 'KD', '4H', '4D'],
  ['AC', '7S', '6S', '5S', '4S', '3S', '2S', '2H', '3H', '5D'],
  ['FREE', 'AD', 'KD', 'QD', '10D', '9D', '8D', '7D', '6D', 'FREE'],
] as const satisfies readonly (readonly BoardCode[])[];

export const CORNER_CELLS = [0, 9, 90, 99] as const;

const reverseBoardLookup = new Map<CardCode, number[]>();

for (let row = 0; row < BOARD_SIZE; row += 1) {
  const boardRow = BOARD_LAYOUT[row];
  if (boardRow === undefined) {
    throw new Error(`Canonical board row ${row} is missing.`);
  }

  for (let column = 0; column < BOARD_SIZE; column += 1) {
    const code = boardRow[column];
    if (code === undefined) {
      throw new Error(`Canonical board cell ${row},${column} is missing.`);
    }

    if (code !== 'FREE') {
      const cells = reverseBoardLookup.get(code) ?? [];
      cells.push(toCell(row, column));
      reverseBoardLookup.set(code, cells);
    }
  }
}

export function toCell(row: number, column: number): number {
  return row * BOARD_SIZE + column;
}

export function toRowColumn(cell: number): { readonly row: number; readonly column: number } {
  return {
    row: Math.floor(cell / BOARD_SIZE),
    column: cell % BOARD_SIZE,
  };
}

export function isCell(cell: number): boolean {
  return Number.isInteger(cell) && cell >= 0 && cell < CELL_COUNT;
}

export function isCorner(cell: number): boolean {
  return cell === 0 || cell === 9 || cell === 90 || cell === 99;
}

export function boardCodeAt(cell: number): BoardCode {
  if (!isCell(cell)) {
    throw new RangeError(`Board cell ${cell} is outside 0..99.`);
  }

  const { row, column } = toRowColumn(cell);
  const code = BOARD_LAYOUT[row]?.[column];
  if (code === undefined) {
    throw new Error(`Canonical board cell ${cell} is missing.`);
  }
  return code;
}

export function getMatchingCells(cardCode: CardCode): readonly number[] {
  return reverseBoardLookup.get(cardCode)?.slice() ?? [];
}

export function createEmptyBoard(): Occupant[] {
  return Array.from<Occupant>({ length: CELL_COUNT }).fill(null);
}
