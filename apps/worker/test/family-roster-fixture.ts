export const testRoster = Array.from(
  { length: 27 },
  (_, index) => `TestPlayer${index === 26 ? 'AA' : String.fromCharCode(65 + index)}`,
);
