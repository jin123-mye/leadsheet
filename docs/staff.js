"use strict";
/* 리드시트 오선보: 멜로디 음표(16분음표 칸) + 박별 코드 → ABC 악보 문자열(abcjs로 렌더)
   app.js보다 먼저 로드. 전역: buildAbc, cellTimes */

const ABC_LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const ABC_NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const amod = (n, m = 12) => ((n % m) + m) % m;

/** 조표: 글자별 기본 임시표(-1 플랫, +1 샤프)와 ABC K: 값 */
function abcKeySig(tonic, mode, flats, names) {
  const majT = mode === "minor" ? amod(tonic + 3) : tonic;
  const majName = names(majT, flats);
  const start = ABC_LETTERS.indexOf(majName[0]);
  const acc = {};
  [0, 2, 4, 5, 7, 9, 11].forEach((iv, i) => {
    const L = ABC_LETTERS[(start + i) % 7];
    let a = amod(majT + iv - ABC_NAT[L]);
    if (a > 6) a -= 12;
    acc[L] = a;
  });
  const k = names(tonic, flats).replace("♭", "b").replace("♯", "#") + (mode === "minor" ? "m" : "");
  return { acc, k, flats: Object.values(acc).some((a) => a < 0) || (Object.values(acc).every((a) => a === 0) && flats) };
}

/** MIDI → (글자, 임시표, 옥타브). 조 안의 음은 조표대로, 밖의 음은 샤프조면 올림·플랫조면 내림으로 */
function abcSpell(p, sig) {
  const pc = amod(p);
  let L = ABC_LETTERS.find((l) => amod(ABC_NAT[l] + sig.acc[l]) === pc);
  let a;
  if (L) a = sig.acc[L];
  else {
    // 조 밖의 음: 이중 ♯/♭은 피하고 제자리표 → (플랫조면 ♭, 샤프조면 ♯) 순으로 고른다(예: D♭장조의 D는 E𝄫이 아니라 D♮)
    const cands = ABC_LETTERS.map((l) => {
      let x = amod(pc - ABC_NAT[l]);
      if (x > 6) x -= 12;
      return [l, x];
    }).filter(([, x]) => Math.abs(x) <= 1);
    const dir = sig.flats ? -1 : 1;
    [L, a] = cands.find(([, x]) => x === 0) || cands.find(([, x]) => x === dir) || cands[0];
  }
  const oct = Math.round((p - ABC_NAT[L] - a) / 12) - 1;
  return { L, a, oct };
}

function abcPitch(sp) {
  if (sp.oct >= 5) return sp.L.toLowerCase() + "'".repeat(sp.oct - 5);
  return sp.L + ",".repeat(Math.max(0, 4 - sp.oct));
}
const ACC_MARK = { "-2": "__", "-1": "_", 0: "=", 1: "^", 2: "^^" };

/** 한 덩어리(같은 음 또는 쉼표가 이어진 구간)를 읽기 쉬운 음가로 쪼갠다(박 경계 존중) */
function splitDur(o, len, g, barBeats) {
  const out = [];
  while (len > 0) {
    let take;
    if (o % g === 0 && len >= g) {
      const beat = o / g;
      let k = Math.floor(len / g);
      // 온마디·점2분·2분은 박자 구조가 보이는 위치에서만
      const ok = (kk) =>
        kk === 1 ||
        (kk === 2 && (barBeats !== 4 || beat % 2 === 0)) ||
        (kk === 3 && (barBeats === 3 ? beat === 0 : beat <= 1) && beat + 3 <= barBeats) ||
        (kk === 4 && beat === 0 && barBeats === 4);
      while (k > 1 && !ok(k)) k--;
      take = k * g;
      // 점4분음표(1.5박): 4/4의 1·3박, 3/4의 1·2박에서 시작하면 붙임줄 대신 점음표로
      const dottedOk = barBeats === 4 ? beat % 2 === 0 : barBeats === 3 && beat <= 1;
      if (k === 1 && len >= g * 1.5 && len < g * 2 && dottedOk && g % 2 === 0) take = g * 1.5;
    } else {
      take = Math.min(len, g - (o % g));
    }
    out.push([o, take]);
    o += take;
    len -= take;
  }
  return out;
}

/**
 * song: result.json, labels: 박별 코드 라벨(고친 것 반영), opt: {chordText(label, 박)->문자열|null, keyNames(pc,flats), usesFlats(tonic,mode)}
 * 반환: {abc, tokens:[{char0, char, cell, len, beat}]}
 */
function buildAbc(song, labels, opt) {
  const mel = song.melody || { grid: 4, notes: [], shift: 0 };
  const g = mel.grid || 4;
  const bpb = song.beats_per_bar;
  const nCells = song.beats.length * g;
  const owner = new Int32Array(nCells).fill(-1);
  mel.notes.forEach(([s, n], i) => { for (let c = s; c < s + n && c < nCells; c++) owner[c] = i; });
  // 조바꿈: 구간마다 조표. 박자: 마디 박 수가 바뀔 때만 박자표
  const segs = (song.keys && song.keys.length) ? song.keys : [{ bar: 0, ...song.key }];
  const flatsOf = (k) => (opt.usesFlats ? opt.usesFlats(k.tonic, k.mode) : !!opt.flats);
  const sigs = segs.map((k) => abcKeySig(k.tonic, k.mode, flatsOf(k), opt.keyNames));
  const segAt = (bi) => { let j = 0; segs.forEach((k, i) => { if (k.bar <= bi) j = i; }); return j; };
  const firstBar = song.bars.find((b) => !b.pickup) || song.bars[0];
  let curM = firstBar ? firstBar.n : bpb;

  const head = `X:1\nM:${curM}/4\nL:1/16\nQ:1/4=${Math.round(song.tempo)}\nK:${sigs[0].k}\n`;
  let body = "";
  const tokens = [];
  let curSeg = 0;

  song.bars.forEach((bar, bi) => {
    const c0 = bar.start * g, c1 = (bar.start + bar.n) * g;
    const seg = segAt(bi);
    if (seg !== curSeg) { body += `[K:${sigs[seg].k}] `; curSeg = seg; }
    const sig = sigs[seg];
    const lastShort = bi === song.bars.length - 1 && bar.n < curM; // 곡 끝 짧은 마디는 박자표 없이
    if (bar.n !== curM && !(bi === 0 && bar.pickup) && !lastShort) { body += `[M:${bar.n}/4] `; curM = bar.n; }
    const state = {}; // 이 마디 안에서 쓴 임시표: "글자+옥타브" → 임시표
    // 덩어리 경계: 음 바뀜, 코드 바뀌는 박(코드 기호를 달 자리)
    const chordAt = new Map();
    for (let b = bar.start; b < bar.start + bar.n; b++) {
      const changed = b === 0 || labels[b] !== labels[b - 1];
      // 마디 첫 박엔 코드를 다시 적어 주되, 'N'(코드 없음)은 바뀌는 곳에만
      if (changed || (b === bar.start && labels[b] !== "N")) {
        const t = opt.chordText(labels[b], b);
        if (t) chordAt.set(b * g, t);
      }
    }
    let c = c0;
    let first = true;
    while (c < c1) {
      let e = c + 1;
      while (e < c1 && owner[e] === owner[c] && !chordAt.has(e)) e++;
      const who = owner[c];
      for (const [ps, pl] of splitDur(c - c0, e - c, g, bar.n)) {
        const cell = c0 + ps;
        if (!first && ps % g === 0) body += " "; // 박마다 꼬리(빔) 끊기
        first = false;
        const char0 = head.length + body.length; // 코드 기호 포함 시작 위치(abcjs startChar가 여기일 수 있음)
        if (chordAt.has(cell)) body += `"${chordAt.get(cell).replace(/"/g, "")}"`;
        const char = head.length + body.length;
        if (who < 0) {
          body += "z" + (pl > 1 ? pl : "");
        } else {
          const sp = abcSpell(mel.notes[who][2] + (mel.shift || 0), sig);
          const id = sp.L + sp.oct;
          const cur = id in state ? state[id] : sig.acc[sp.L];
          let s = "";
          if (sp.a !== cur) s = ACC_MARK[sp.a];
          state[id] = sp.a;
          body += s + abcPitch(sp) + (pl > 1 ? pl : "");
          const end = cell + pl;
          if (end < nCells && owner[end] === who) body += "-"; // 같은 음이 이어지면 붙임줄
        }
        tokens.push({ char0, char, cell, len: pl, beat: Math.floor(cell / g) });
      }
      c = e;
    }
    body += bi === song.bars.length - 1 ? " |]" : " | ";
  });
  return { abc: head + body + "\n", tokens };
}

/** 16분음표 칸 경계 시각(초). 길이 = 칸 수 + 1 */
function cellTimes(song) {
  const g = (song.melody && song.melody.grid) || 4;
  const b = song.beats;
  const d = [];
  for (let i = 1; i < b.length; i++) d.push(b[i] - b[i - 1]);
  d.sort((x, y) => x - y);
  const ibi = d.length ? d[Math.floor(d.length / 2)] : 0.5;
  const bounds = b.concat([Math.min(song.duration, b[b.length - 1] + ibi)]);
  const out = [];
  for (let i = 0; i < b.length; i++) for (let k = 0; k < g; k++) out.push(bounds[i] + ((bounds[i + 1] - bounds[i]) * k) / g);
  out.push(bounds[b.length]);
  return out;
}
