# Card Lines rules

Card Lines is a private, turn-based card-and-chip game for two equal teams or three equal teams. Two-team games require two claimed sequences to win; three-team games require one.

The board is a fixed 10×10 card layout. Each non-Jack card appears on exactly two spaces, and the four corners are permanently free. A corner counts for every team in a line but never receives a chip.

On a normal turn, play one card, resolve its board effect, discard it, claim any resulting sequence, draw a replacement unless that move wins, and advance to the next alternating team seat.

- A non-Jack places a chip on either matching empty board space.
- The two-eyed Jacks, clubs and diamonds, place on any empty non-corner space.
- The one-eyed Jacks, spades and hearts, remove an opposing chip that is not part of a claimed sequence. They do not place a chip.
- A non-Jack is dead only when both matching spaces are occupied. Before normal play, one dead card may be exchanged per turn without advancing the turn.
- Passing is available only as a server-verified safety rule when the hand has no legal target and the one permitted exchange cannot be used.

A sequence is five horizontal, vertical, or diagonal spaces occupied by the same team and/or free corners. Every new claim must contain the just-placed chip. A new line may overlap each line previously claimed by that team in at most one coordinate, including a corner. Two lines made by one play must also share at most one coordinate. Thus a run of nine can form two sequences sharing its middle chip, and crossing lines may share the newly placed chip.

When several equally maximal claim sets are possible, the player chooses one exact alternative before the move is accepted. Every non-corner chip in a claimed line is permanently protected from one-eyed Jacks.

Hands are private even from teammates. Other players see hand counts only. Played and exchanged cards are public history; replacement draws and deck order remain hidden.

The source specification remains the implementation authority. This short rules page is a player-oriented paraphrase, not a substitute for engine tests.
