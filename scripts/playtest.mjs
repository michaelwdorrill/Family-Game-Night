import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { CryptoRandomSource } from '../packages/sequence-engine/src/random.ts';
import { applyEuchre, createEuchre, euchreView } from '../packages/table-games/dist/euchre.js';
import {
  applyLantern,
  createLantern,
  goals,
  lanternView,
} from '../packages/table-games/dist/lantern-rummy.js';

const [game, count = '2'] = process.argv.slice(2);
const random = new CryptoRandomSource();

function describe(move) {
  switch (move.type) {
    case 'call':
      return `Call ${move.suit}${move.alone ? ' alone' : ' with partner'}`;
    case 'pass':
      return 'Pass';
    case 'play':
      return `Play ${move.card}`;
    case 'discard':
      return `Discard ${move.card}`;
    case 'draw':
      return `Draw from ${move.from}`;
    case 'bank':
      return `Bank ${move.cards.join(' ')}`;
  }
}

async function play() {
  if (game !== 'euchre' && game !== 'lantern')
    throw new Error('Use pnpm playtest euchre or pnpm playtest lantern [2-4].');
  const euchre = game === 'euchre';
  let state = euchre ? createEuchre(random) : createLantern(Number(count), random);
  const reader = createInterface({ input: stdin, output: stdout });
  try {
    while (state.phase !== 'finished') {
      console.clear();
      const seat = state.turn;
      await reader.question(`Pass to seat ${seat + 1}. Press Enter when ready. `);
      const view = euchre ? euchreView(state, seat) : lanternView(state, seat);
      if (euchre) {
        console.log(
          `Hand ${view.handNumber} · Seats 1/3 vs 2/4 · Score ${view.scores.join('–')} · Tricks ${view.tricks.join('–')}`,
        );
        console.log(
          `Dealer: seat ${view.dealer + 1} · Upcard: ${view.upcard} · Trump: ${view.trump ?? 'undecided'}`,
        );
        if (view.maker !== null)
          console.log(
            `Caller: seat ${view.maker + 1}${view.sittingOut === null ? '' : ' (alone)'}`,
          );
        for (const [name, trick] of [
          ['Previous trick', view.lastTrick],
          ['Current trick', view.trick],
        ]) {
          if (trick.length)
            console.log(`${name}: ${trick.map((p) => `seat ${p.seat + 1} ${p.card}`).join(', ')}`);
        }
      } else {
        console.log(
          `Goals banked by seat: ${view.progress.join(' / ')} · Your goal: ${goals[view.progress[seat]]}`,
        );
        console.log(`Discard: ${view.discard ?? 'empty'} · Stock: ${view.stockCount}`);
        if (view.lastMeld)
          console.log(
            `Last meld: seat ${view.lastMeld.seat + 1} banked ${view.lastMeld.cards.join(' ')}`,
          );
      }
      console.log(`Your hand: ${view.hand.join(' ')}`);
      view.moves.forEach((move, i) => console.log(`${i + 1}. ${describe(move)}`));
      let move;
      while (!move) {
        const entry = await reader.question('Choose an action, or q to quit: ');
        if (entry.trim().toLowerCase() === 'q') return;
        if (/^\d+$/.test(entry.trim())) move = view.moves[Number(entry) - 1];
      }
      state = euchre
        ? applyEuchre(state, seat, move, random)
        : applyLantern(state, seat, move, random);
    }
    console.clear();
    console.log(
      euchre
        ? `Seats ${state.winner === 0 ? '1 and 3' : '2 and 4'} win, ${state.scores.join('–')}.`
        : `Seat ${state.winner + 1} banked all three goals and wins!`,
    );
  } finally {
    reader.close();
  }
}
await play();
