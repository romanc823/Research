/**
 * Fixed-pitch label raster. Glyphs are 5×7, drawn as solid 8×8 blocks
 * so a baseline JPEG survives as black or white. A cell that does not
 * match the font is a miss: that line is dropped, not guessed.
 */

export const SCALE = 8;
export const GLYPH_W = 5;
export const GLYPH_H = 7;
export const CELL_W = 6;
export const CELL_H = 8;
export const MARGIN = 1;

const FONT = {
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  ",": [".....", ".....", ".....", ".....", "..#..", "..#..", ".#..."],
  ":": [".....", "..#..", ".....", ".....", "..#..", ".....", "....."],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "..##.", ".#...", "#....", "#####"],
  "3": ["#####", "....#", "..##.", "....#", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".###.", "#...#", "#....", ".###.", "....#", "#...#", ".###."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
};

const GLYPH_OF = new Map();
for (const [ch, rows] of Object.entries(FONT)) {
  if (rows.length !== GLYPH_H || rows.some((row) => row.length !== GLYPH_W)) {
    throw new Error(`Bad glyph for ${ch}`);
  }
  const key = rows.join("|");
  if (GLYPH_OF.has(key)) throw new Error(`Glyph collision on ${ch}`);
  GLYPH_OF.set(key, ch);
}

export function assertGlyphs(text) {
  for (const ch of text) {
    if (!FONT[ch]) throw new Error(`No glyph for ${JSON.stringify(ch)}`);
  }
}

export function renderLabelRaster(lines) {
  for (const line of lines) assertGlyphs(line);
  const widthChars = Math.max(1, ...lines.map((line) => line.length));
  const gridW = MARGIN + widthChars * CELL_W + MARGIN;
  const gridH = MARGIN + lines.length * CELL_H + MARGIN;
  const grid = new Uint8Array(gridW * gridH);
  for (let row = 0; row < lines.length; row += 1) {
    const line = lines[row];
    for (let col = 0; col < line.length; col += 1) {
      const glyph = FONT[line[col]];
      const x0 = MARGIN + col * CELL_W;
      const y0 = MARGIN + row * CELL_H;
      for (let y = 0; y < GLYPH_H; y += 1) {
        for (let x = 0; x < GLYPH_W; x += 1) {
          if (glyph[y][x] === "#") grid[(y0 + y) * gridW + (x0 + x)] = 1;
        }
      }
    }
  }

  const width = gridW * SCALE;
  const height = gridH * SCALE;
  const gray = new Uint8Array(width * height);
  gray.fill(255);
  for (let gy = 0; gy < gridH; gy += 1) {
    for (let gx = 0; gx < gridW; gx += 1) {
      if (!grid[gy * gridW + gx]) continue;
      const x0 = gx * SCALE;
      const y0 = gy * SCALE;
      for (let y = 0; y < SCALE; y += 1) {
        gray.fill(0, (y0 + y) * width + x0, (y0 + y) * width + x0 + SCALE);
      }
    }
  }
  return { gray, width, height };
}

/**
 * @returns {{ lines: string[], rejected: { evidence: string, reason: string }[] }}
 */
export function readLabelRaster(gray, width, height) {
  const rejected = [];
  if (width % SCALE !== 0 || height % SCALE !== 0) {
    rejected.push({
      evidence: `${width}×${height}`,
      reason: "Raster is not on the labeled grid, so no field was read.",
    });
    return { lines: [], rejected };
  }
  const gridW = width / SCALE;
  const gridH = height / SCALE;
  if ((gridW - 2 * MARGIN) % CELL_W !== 0 || (gridH - 2 * MARGIN) % CELL_H !== 0) {
    rejected.push({
      evidence: `${width}×${height}`,
      reason: "Raster pitch does not match the label font, so no field was read.",
    });
    return { lines: [], rejected };
  }

  const black = new Uint8Array(gridW * gridH);
  const half = (SCALE * SCALE) / 2;
  for (let by = 0; by < gridH; by += 1) {
    for (let bx = 0; bx < gridW; bx += 1) {
      let dark = 0;
      const x0 = bx * SCALE;
      const y0 = by * SCALE;
      for (let y = 0; y < SCALE; y += 1) {
        const row = (y0 + y) * width + x0;
        for (let x = 0; x < SCALE; x += 1) {
          if (gray[row + x] < 128) dark += 1;
        }
      }
      if (dark >= half) black[by * gridW + bx] = 1;
    }
  }

  const cols = (gridW - 2 * MARGIN) / CELL_W;
  const rows = (gridH - 2 * MARGIN) / CELL_H;
  const lines = [];
  for (let row = 0; row < rows; row += 1) {
    let text = "";
    let missed = false;
    for (let col = 0; col < cols; col += 1) {
      const x0 = MARGIN + col * CELL_W;
      const y0 = MARGIN + row * CELL_H;
      const bits = [];
      for (let y = 0; y < GLYPH_H; y += 1) {
        let glyphRow = "";
        for (let x = 0; x < GLYPH_W; x += 1) {
          glyphRow += black[(y0 + y) * gridW + (x0 + x)] ? "#" : ".";
        }
        bits.push(glyphRow);
      }
      const ch = GLYPH_OF.get(bits.join("|"));
      if (!ch) {
        missed = true;
        break;
      }
      text += ch;
    }
    text = text.trimEnd();
    if (!text) continue;
    if (missed) {
      rejected.push({
        evidence: `raster line ${row + 1}`,
        reason: "A glyph missed the font, so the whole line was omitted.",
      });
    } else {
      lines.push(text);
    }
  }
  return { lines, rejected };
}
