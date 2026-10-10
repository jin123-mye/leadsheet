"use strict";
/* 리드시트 — 홈(곡 목록·추가) / 곡 화면(코드 악보·재생·조옮김·카포·고치기) */

const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mod = (n, m = 12) => ((n % m) + m) % m;
const fmtTime = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/* 데모 모드(GitHub Pages 정적 사이트): 서버 대신 미리 분석한 JSON을 읽고, 내 설정은 이 브라우저에만 저장 */
const DEMO = !!window.LEADSHEET_DEMO;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const mediaUrl = (id, f) => (DEMO ? `demo/media/${id}/${f}` : `/media/${id}/${f}`);

async function demoApi(path, opt) {
  const method = (opt.method || "GET").toUpperCase();
  const getJson = async (u) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error("데모 데이터를 못 불러왔어요");
    return r.json();
  };
  let m;
  if (path === "/api/jobs") return [];
  if (path === "/api/songs" && method === "GET") {
    const list = await getJson("demo/songs.json");
    return list.map((x) => {
      const u = store.get("ls-user-" + x.id) || {};
      return { ...x, title: u.title || x.title, transpose: u.transpose || 0 };
    });
  }
  if ((m = path.match(/^\/api\/songs\/([0-9a-f]{10})\/user$/)) && method === "PUT") {
    store.set("ls-user-" + m[1], JSON.parse(opt.body));
    return { ok: true };
  }
  if ((m = path.match(/^\/api\/songs\/([0-9a-f]{10})$/)) && method === "GET") {
    const song = await getJson(`demo/songs/${m[1]}.json`);
    song.user = store.get("ls-user-" + m[1]) || {};
    return song;
  }
  throw new Error("데모에서는 쓸 수 없는 기능이에요");
}

const api = async (path, opt = {}) => {
  if (DEMO) return demoApi(path, opt);
  const r = await fetch(path, opt);
  if (!r.ok) {
    let msg = `오류 ${r.status}`;
    try { const j = await r.json(); if (j.detail) msg = j.detail; } catch {}
    throw new Error(msg);
  }
  return r.json();
};

let toastTimer;
function toast(msg) {
  let t = $(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.append(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.2-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="14" y="4" width="4.5" height="16" rx="1.2"/></svg>',
};

/* ---------------- 코드 표기 ---------------- */
const SHARP = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FLAT = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1]);
const FLAT_MINOR = new Set([2, 7, 0, 5, 10, 3]);
// 품질 → [기본선 글자, 위첨자]
const QDISP = {
  maj: ["", ""], min: ["m", ""], 7: ["", "7"], maj7: ["", "M7"], min7: ["m", "7"], min6: ["m", "6"], maj6: ["", "6"],
  minmaj7: ["m", "M7"], dim: ["", "dim"], dim7: ["", "dim7"], hdim7: ["m", "7♭5"], aug: ["", "aug"],
  sus2: ["", "sus2"], sus4: ["", "sus4"],
};
const QORDER = ["maj", "min", "7", "min7", "maj7", "sus4", "sus2", "maj6", "min6", "dim", "hdim7", "dim7", "aug", "minmaj7"];
const SIMPLE = { maj: "maj", maj6: "maj", maj7: "maj", 7: "maj", aug: "maj", sus2: "maj", sus4: "maj" };
const MINORISH = new Set(["min", "min6", "min7", "minmaj7", "dim", "dim7", "hdim7"]);
const NUMERAL = ["I", "♭II", "II", "♭III", "III", "IV", "♯IV", "V", "♭VI", "VI", "♭VII", "VII"];
const RN_SUFFIX = { maj: "", min: "", 7: "7", maj7: "M7", min7: "7", min6: "6", maj6: "6", minmaj7: "M7", dim: "°", dim7: "°7", hdim7: "ø7", aug: "+", sus2: "sus2", sus4: "sus4" };

function parse(label) {
  if (!label || label === "N") return null;
  const [main, bass] = label.split("/");
  const [r, q] = main.split(":");
  return { r: +r, q, b: bass === undefined ? null : +bass };
}
const unparse = (c) => (c ? `${c.r}:${c.q}${c.b !== null && c.b !== undefined ? "/" + c.b : ""}` : "N");
function simplify(label) {
  const c = parse(label);
  return c ? `${c.r}:${SIMPLE[c.q] || "min"}` : "N";
}
const usesFlats = (tonic, mode) => (mode === "minor" ? FLAT_MINOR : FLAT_MAJOR).has(mod(tonic));
const noteName = (pc, flats) => (flats ? FLAT : SHARP)[mod(pc)];
const keyName = (tonic, mode) => noteName(tonic, usesFlats(tonic, mode)) + (mode === "minor" ? "m" : "");
const keyNameKo = (tonic, mode) => noteName(tonic, usesFlats(tonic, mode)) + (mode === "minor" ? " 단조" : " 장조");

/** 화면용 HTML. shift=조옮김-카포, flats=표기 기준, numerals면 도수(I·IV·V) */
function chordHTML(label, { shift = 0, flats = false, numerals = false, tonic = 0 } = {}) {
  const c = parse(label);
  if (!c) return { html: "N.C.", nc: true };
  if (numerals) {
    const deg = NUMERAL[mod(c.r - tonic)];
    const d = MINORISH.has(c.q) ? deg.toLowerCase() : deg;
    const suf = RN_SUFFIX[c.q] || "";
    return { html: `${d}${suf ? `<sup>${suf}</sup>` : ""}` };
  }
  const [base, sup] = QDISP[c.q] || ["", c.q];
  let html = noteName(c.r + shift, flats) + base + (sup ? `<sup>${sup}</sup>` : "");
  if (c.b !== null && c.b !== c.r) html += `<span class="slash">/${noteName(c.b + shift, flats)}</span>`;
  return { html };
}
const chordText = (label, o) => chordHTML(label, o).html.replace(/<[^>]+>/g, "");

/** 마디 안 코드 이름이 다음 코드나 마디선을 넘으면 글자를 줄인다 */
function fitChords(grid) {
  grid.querySelectorAll(".bar").forEach((bar) => {
    const cs = [...bar.querySelectorAll(".chord")];
    const bw = bar.getBoundingClientRect();
    cs.forEach((c, j) => {
      const limit = j < cs.length - 1 ? cs[j + 1].getBoundingClientRect().left : bw.right;
      let size = parseFloat(getComputedStyle(c).fontSize);
      while (c.getBoundingClientRect().right > limit - 1 && size > 10) {
        size -= 1;
        c.style.fontSize = size + "px";
      }
    });
  });
}

/* ---------------- 라우터 ---------------- */
let cleanup = null;
function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const m = location.hash.match(/^#\/s\/([0-9a-f]{10})/);
  if (m) cleanup = renderSong(m[1]);
  else cleanup = renderHome();
}
window.addEventListener("hashchange", route);
route();

/* ---------------- 홈 ---------------- */
function renderHome() {
  document.title = DEMO ? "리드시트 데모" : "리드시트";
  app.innerHTML = `
  <div class="wrap">
    <header class="home-head">
      <h1>리드시트${DEMO ? " <small class=\"demo-tag\">데모</small>" : ""}</h1>
      <p>유튜브 링크나 음원을 넣으면 박자별 코드표와 멜로디 오선보로.</p>
    </header>
    ${DEMO ? `
    <div class="add demo-card">
      <p><b>공개 데모예요.</b> 실제 버전은 맥에서 도는 분석 엔진에 유튜브 링크나 음원 파일을 넣으면 1분 안팎에 코드표·오선보를 만들어요(개인용이라 업로드는 막아 뒀어요).</p>
      <p>아래 세 곡은 저작권 보호기간이 끝난 <b>유명 곡(공유저작물)</b>이고, 연주·녹음·코드 반주는 <b>직접 합성</b>해서 음원 권리 문제도 없어요. 화면은 엔진이 분석한 결과 그대로이고, 곡 이름 아래 초록 숫자는 정답 악보 대비 정확도예요.
      합성 목소리는 악기 분리(Demucs)가 보컬로 잘 못 빼서, 멜로디는 멜로디 트랙을 같은 엔진으로 받아적었어요.</p>
      ${window.LEADSHEET_REPO ? `<p><a href="${esc(window.LEADSHEET_REPO)}" target="_blank" rel="noopener">소스 코드·설명 보기 →</a></p>` : ""}
    </div>` : `
    <form class="add" id="addForm" autocomplete="off">
      <div class="add-row">
        <input type="url" name="url" id="urlIn" placeholder="유튜브 링크 붙여넣기" inputmode="url" enterkeyhint="go">
        <button class="btn" id="goBtn" type="submit">분석</button>
      </div>
      <div class="file-row">
        <span class="hint">곡당 1분 안팎 걸려요 · 15분 이하</span>
        <button class="linkbtn" type="button" id="fileBtn">파일에서 고르기</button>
        <input type="file" id="fileIn" accept="audio/*,video/*,.mp3,.m4a,.wav,.flac,.aac,.ogg" hidden>
      </div>
    </form>`}
    <div id="jobs"></div>
    <div class="section-title">${DEMO ? "데모 곡" : "내 악보"}</div>
    <ul class="songs" id="songs"><li class="empty">불러오는 중…</li></ul>
  </div>`;

  let pollTimer = null;
  let alive = true;
  let lastActive = 0;

  async function loadSongs() {
    const songs = await api("/api/songs").catch(() => null);
    if (!alive || !songs) return;
    const ul = $("#songs");
    if (!songs.length) { ul.innerHTML = `<li class="empty">아직 악보가 없어요. 위에 링크를 넣어 보세요.</li>`; return; }
    ul.innerHTML = songs.map((s) => {
      const k = s.key || { tonic: 0, mode: "major" };
      const segs = (s.keys && s.keys.length > 1) ? [s.keys[0], s.keys[s.keys.length - 1]] : [k];
      const badge = segs.map((x) => keyName(mod(x.tonic + (s.transpose || 0)), x.mode)).join("→");
      return `<li><a class="song-item" href="#/s/${s.id}">
        <span class="key${segs.length > 1 ? " multi" : ""}">${esc(badge)}</span>
        <span class="meta"><div class="t">${esc(s.title)}</div>
        <div class="a">${esc([s.artist, `${Math.round(s.tempo)} BPM`, fmtTime(s.duration)].filter(Boolean).join(" · "))}</div>
        ${s.accuracy ? `<div class="acc">정답 대비 코드 ${Math.round(s.accuracy.chord_root * 100)}% · 조 ${Math.round(s.accuracy.key_time * 100)}% · 박자표 ${Math.round(s.accuracy.bars_meter * 100)}% · 멜로디 ${Math.round(s.accuracy.melody_onset_f * 100)}%</div>` : ""}</span>
      </a></li>`;
    }).join("");
  }

  async function loadJobs() {
    const jobs = await api("/api/jobs").catch(() => []);
    if (!alive) return;
    const active = jobs.filter((j) => j.state !== "error").length;
    $("#jobs").innerHTML = jobs.length ? `<div class="section-title">분석 중</div>` + jobs.map((j) => `
      <div class="job" data-id="${j.id}">
        <div class="t">${esc(j.title || "곡")}</div>
        ${j.state === "error"
          ? `<div class="s err"><span>실패: ${esc(j.error || "")}</span><button class="linkbtn" data-del="${j.id}">지우기</button></div>`
          : `<div class="s"><span>${esc(j.label || "대기 중")}</span><span>${Math.round((j.progress || 0) * 100)}%</span></div>
             <div class="bar-track"><div class="bar-fill" style="width:${(j.progress || 0) * 100}%"></div></div>`}
      </div>`).join("") : "";
    if (active < lastActive) loadSongs(); // 하나 끝났으면 목록 갱신
    lastActive = active;
    clearTimeout(pollTimer);
    if (active) pollTimer = setTimeout(loadJobs, 1500);
  }

  $("#jobs").addEventListener("click", async (e) => {
    const id = e.target.dataset?.del;
    if (!id) return;
    await api(`/api/songs/${id}`, { method: "DELETE" }).catch((err) => toast(err.message));
    loadJobs();
  });

  async function submit(fd) {
    $("#goBtn").disabled = true;
    try {
      const r = await api("/api/jobs", { method: "POST", body: fd });
      if (r.existing) { location.hash = `#/s/${r.song_id}`; return; }
      toast("분석을 시작했어요");
      $("#urlIn").value = "";
      loadJobs();
    } catch (err) {
      toast(err.message);
    } finally {
      const b = $("#goBtn"); if (b) b.disabled = false;
    }
  }
  if (!DEMO) $("#addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const url = $("#urlIn").value.trim();
    if (!url) { $("#urlIn").focus(); return; }
    const fd = new FormData(); fd.append("url", url);
    submit(fd);
  });
  if (!DEMO) $("#fileBtn").addEventListener("click", () => $("#fileIn").click());
  if (!DEMO) $("#fileIn").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    toast("파일 올리는 중…");
    const fd = new FormData(); fd.append("file", f);
    submit(fd);
    e.target.value = "";
  });

  loadSongs();
  loadJobs();
  return () => { alive = false; clearTimeout(pollTimer); };
}

/* ---------------- 곡 화면 ---------------- */
function renderSong(id) {
  app.innerHTML = `<div class="loading">악보 여는 중…</div>`;
  let alive = true;
  let raf = 0;
  let wakeLock = null;
  const audio = new Audio();
  audio.preload = "metadata";

  const S = {
    song: null, view: "full", transpose: 0, capo: 0, numerals: false, edits: {},
    editing: false, src: "mix", rate: 1, follow: true, cur: -1, sheet: "chords", melSound: false,
  };

  api(`/api/songs/${id}`).then((song) => {
    if (!alive) return;
    S.song = song;
    const u = song.user || {};
    Object.assign(S, {
      view: u.view || "full", transpose: u.transpose || 0, capo: u.capo || 0,
      numerals: !!u.numerals, edits: u.edits || {}, title: u.title || song.title, sheet: u.sheet || "chords",
    });
    computeBarMaps();
    computeKeyMap();
    cells = cellTimes(song);
    audio.src = mediaUrl(id, song.audio.mix);
    build();
  }).catch(() => { app.innerHTML = `<div class="loading">악보를 찾을 수 없어요. <a href="#/">목록으로</a></div>`; });

  let saveTimer;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      api(`/api/songs/${id}/user`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edits: S.edits, transpose: S.transpose, capo: S.capo, view: S.view, numerals: S.numerals, title: S.title, sheet: S.sheet }),
      }).catch(() => toast("저장 실패"));
    }, 400);
  };

  // 사용자가 고친 코드를 반영한 박별 라벨(고친 박부터 원래 코드가 바뀌는 지점까지 이어짐)
  function labels() {
    const base = S.song.chords[S.view === "simple" ? "simple" : "full"];
    const out = base.slice();
    let over = null;
    for (let i = 0; i < out.length; i++) {
      if (S.edits[i] !== undefined) over = S.edits[i];
      else if (i > 0 && base[i] !== base[i - 1]) over = null;
      if (over !== null) out[i] = S.view === "simple" ? simplify(over) : over;
    }
    return out;
  }
  const editedFrom = () => {
    const set = new Set();
    const base = S.song.chords[S.view === "simple" ? "simple" : "full"];
    let on = false;
    for (let i = 0; i < base.length; i++) {
      if (S.edits[i] !== undefined) on = true;
      else if (i > 0 && base[i] !== base[i - 1]) on = false;
      if (on) set.add(i);
    }
    return set;
  };

  const shapeKey = () => mod(S.song.key.tonic + S.transpose - S.capo);
  // 조바꿈 곡: 박마다 그 구간의 조(표기 ♯/♭, 도수 기준)
  let keyOfBeat = [];
  function computeKeyMap() {
    const segs = (S.song.keys && S.song.keys.length) ? S.song.keys : [{ bar: 0, ...S.song.key }];
    keyOfBeat = [];
    S.song.bars.forEach((bar, bi) => {
      let k = segs[0];
      for (const sg of segs) if (sg.bar <= bi) k = sg;
      for (let i = bar.start; i < bar.start + bar.n; i++) keyOfBeat[i] = k;
    });
  }
  const localKey = (i) => (i !== undefined && keyOfBeat[i]) || S.song.key;
  const opts = (i) => {
    const k = localKey(i);
    return {
      shift: S.transpose - S.capo,
      flats: usesFlats(mod(k.tonic + S.transpose - S.capo), k.mode),
      numerals: S.numerals,
      tonic: k.tonic,
    };
  };

  // 기타 쉬운 모양 키로 만드는 카포
  function capoSuggest() {
    const real = mod(S.song.key.tonic + S.transpose);
    const easy = S.song.key.mode === "minor" ? [9, 4, 2] : [0, 7, 2, 9, 4];
    for (let c = 0; c <= 7; c++) if (easy.includes(mod(real - c))) return c;
    return null;
  }

  function build() {
    const song = S.song;
    document.title = `${S.title} — 리드시트`;
    app.innerHTML = `
    <div class="topbar"><div class="wrap row">
      <button class="iconbtn" id="backBtn" aria-label="뒤로">${ICON.back}</button>
      <div class="title"><div class="t">${esc(S.title)}</div><div class="a">${esc(song.artist || "")}</div></div>
      <button class="iconbtn" id="moreBtn" aria-label="더보기">${ICON.more}</button>
    </div></div>
    <div class="wrap">
      <div class="sheet-head">
        <div class="info" id="info"></div>
      </div>
      <div class="seg" role="tablist">
        <button data-sheet="chords" role="tab">코드표</button>
        <button data-sheet="staff" role="tab">오선보</button>
      </div>
      <div class="controls">
        <div class="ctl"><div><div class="lbl">조옮김</div><div class="val" id="tVal"></div></div>
          <div class="stepper"><button data-t="-1" aria-label="반음 내리기">−</button><button data-t="1" aria-label="반음 올리기">+</button></div></div>
        <div class="ctl"><div><div class="lbl">카포</div><div class="val" id="cVal"></div></div>
          <div class="stepper"><button data-c="-1" aria-label="카포 내리기">−</button><button data-c="1" aria-label="카포 올리기">+</button></div></div>
      </div>
      <p class="capo-hint" id="capoHint"></p>
      <div class="toggles">
        <button class="chip" data-view="simple">간단히</button>
        <button class="chip" data-view="full">자세히</button>
        <button class="chip" id="numBtn">도수</button>
        <button class="chip edit" id="editBtn">✎ 고치기</button>
      </div>
      <p class="edit-note" id="editNote" hidden>고칠 박을 누르세요. 고친 코드는 다음 코드가 바뀌는 곳까지 이어져요.</p>
      <div class="grid" id="grid"></div>
      <div class="staff" id="staff" hidden></div>
    </div>
    <div class="player"><div class="wrap">
      <div class="row1">
        <button class="play" id="playBtn" aria-label="재생">${ICON.play}</button>
        <div class="seek"><input type="range" id="seek" min="0" max="${song.duration}" step="0.1" value="0">
          <div class="times"><span id="tCur">0:00</span><span id="tBar"></span><span>${fmtTime(song.duration)}</span></div></div>
      </div>
      <div class="row2">
        <button class="chip on" data-src="mix">원곡</button>
        <button class="chip" data-src="accomp">반주만</button>
        <button class="chip" id="melBtn">멜로디 소리</button>
        <button class="chip" id="rateBtn">속도 1×</button>
        <button class="chip on" id="followBtn">따라가기</button>
      </div>
    </div></div>`;

    $("#backBtn").onclick = () => { location.hash = "#/"; };
    $("#moreBtn").onclick = moreMenu;
    app.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => { S.transpose = Math.max(-11, Math.min(11, S.transpose + +b.dataset.t)); save(); refresh(); }));
    app.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => { S.capo = Math.max(0, Math.min(11, S.capo + +b.dataset.c)); save(); refresh(); }));
    app.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => { S.view = b.dataset.view; save(); refresh(); }));
    $("#numBtn").onclick = () => { S.numerals = !S.numerals; save(); refresh(); };
    $("#editBtn").onclick = () => { S.editing = !S.editing; refresh(); };
    app.querySelectorAll("[data-sheet]").forEach((b) => (b.onclick = () => { S.sheet = b.dataset.sheet; save(); refresh(); }));
    $("#melBtn").onclick = () => {
      S.melSound = !S.melSound;
      $("#melBtn").classList.toggle("on", S.melSound);
      if (S.melSound) { melodyInit(); if (!(S.song.melody && S.song.melody.notes.length)) toast("이 곡은 받아적은 멜로디가 없어요"); }
      else melodyStop();
    };
    $("#playBtn").onclick = togglePlay;
    app.querySelectorAll("[data-src]").forEach((b) => (b.onclick = () => switchSrc(b.dataset.src)));
    $("#rateBtn").onclick = () => {
      const rates = [1, 0.85, 0.7];
      S.rate = rates[(rates.indexOf(S.rate) + 1) % rates.length];
      audio.playbackRate = S.rate;
      $("#rateBtn").textContent = `속도 ${S.rate}×`;
      $("#rateBtn").classList.toggle("on", S.rate !== 1);
    };
    $("#followBtn").onclick = () => { S.follow = !S.follow; $("#followBtn").classList.toggle("on", S.follow); };
    const seek = $("#seek");
    seek.oninput = () => { audio.currentTime = +seek.value; melodyStop(); tick(true); };
    $("#grid").addEventListener("click", onGridTap);

    audio.onplay = () => { $("#playBtn").innerHTML = ICON.pause; loop(); lockScreen(true); };
    audio.onpause = () => { $("#playBtn").innerHTML = ICON.play; cancelAnimationFrame(raf); lockScreen(false); melodyStop(); };
    audio.onended = audio.onpause;
    if ("mediaSession" in navigator) {
      try { navigator.mediaSession.metadata = new MediaMetadata({ title: S.title, artist: song.artist || "리드시트" }); } catch {}
    }
    refresh();
  }

  function keysText() {
    const segs = (S.song.keys && S.song.keys.length) ? S.song.keys : [S.song.key];
    return segs.map((sg) => esc(keyNameKo(mod(sg.tonic + S.transpose), sg.mode))).join(" → ");
  }
  function metersText() {
    // 4마디 이상 이어진 박자만(한두 마디 불규칙은 생략)
    const out = [];
    let run = null;
    S.song.bars.forEach((b) => {
      if (b.pickup) return;
      if (run && run.n === b.n) run.len++;
      else { run = { n: b.n, len: 1 }; out.push(run); }
    });
    const main = out.filter((r) => r.len >= 4).map((r) => `${r.n}/4`);
    const uniq = main.filter((m, i) => i === 0 || m !== main[i - 1]);
    return uniq.length ? uniq.join(" → ") : `${S.song.beats_per_bar}/4`;
  }

  function refresh() {
    const song = S.song;
    const k = song.key;
    const real = mod(k.tonic + S.transpose);
    $("#info").innerHTML = [
      `<span><b>${keysText()}</b>${S.transpose ? ` (원래 ${esc(keyName(k.tonic, k.mode))})` : ""}</span>`,
      `<span>${Math.round(song.tempo)} BPM</span>`,
      `<span>${metersText()}</span>`,
      `<span>${fmtTime(song.duration)}</span>`,
    ].join("");
    $("#tVal").innerHTML = `${esc(keyName(real, k.mode))}<small>${S.transpose > 0 ? "+" : ""}${S.transpose || "원래 키"}</small>`;
    $("#cVal").innerHTML = S.capo ? `${S.capo}<small>${esc(keyName(shapeKey(), k.mode))} 모양</small>` : `없음`;
    const cs = capoSuggest();
    $("#capoHint").innerHTML = cs && cs !== S.capo
      ? `기타라면 <button id="capoApply">카포 ${cs}</button> → ${esc(keyName(mod(real - cs), k.mode))} 모양으로 쉽게 칠 수 있어요`
      : "";
    if ($("#capoApply")) $("#capoApply").onclick = () => { S.capo = cs; save(); refresh(); };
    app.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === S.view));
    $("#numBtn").classList.toggle("on", S.numerals);
    $("#editBtn").classList.toggle("on", S.editing);
    $("#editNote").hidden = !S.editing;
    $("#editNote").textContent = S.sheet === "staff"
      ? "코드를 고칠 음표(쉼표)를 누르세요. 그 박부터 코드가 바뀌어요."
      : "고칠 박을 누르세요. 고친 코드는 다음 코드가 바뀌는 곳까지 이어져요.";
    app.querySelectorAll("[data-sheet]").forEach((b) => b.classList.toggle("on", b.dataset.sheet === S.sheet));
    const staffMode = S.sheet === "staff";
    $("#grid").hidden = staffMode;
    $("#staff").hidden = !staffMode;
    if (staffMode) { $("#grid").innerHTML = ""; beatEls = []; barEls = []; lineEls = []; renderStaff(); }
    else { $("#staff").innerHTML = ""; staffTok = []; renderGrid(); }
    S.cur = -1;
    staffCur = -1;
    tick(true);
  }

  /* ---------- 마디 번호 ---------- */
  function computeBarMaps() {
    beatBar = []; barNos = [];
    let no = 0;
    S.song.bars.forEach((bar, bi) => {
      if (!bar.pickup) no++;
      barNos[bi] = bar.pickup ? 0 : no;
      for (let i = bar.start; i < bar.start + bar.n; i++) beatBar[i] = bi;
    });
  }

  /* ---------- 오선보 ---------- */
  let cells = [], staffTok = [], staffCur = -1, staffLineY = null, staffByChar = new Map();
  function staffChord(label, beat) {
    const o = opts(beat);
    if (o.numerals) return label === "N" ? "N.C." : chordText(label, o);
    const c = parse(label);
    if (!c) return "N.C.";
    // 카포 모양은 미리 빼 두고, 조옮김은 abcjs visualTranspose가 음표·코드 함께 처리
    const lk = localKey(beat);
    const flats = usesFlats(mod(lk.tonic - S.capo), lk.mode);
    const nm = (pc) => noteName(pc - S.capo, flats).replace("♭", "b").replace("♯", "#");
    const [base, sup] = QDISP[c.q] || ["", c.q];
    return nm(c.r) + base + sup + (c.b !== null && c.b !== c.r ? "/" + nm(c.b) : "");
  }
  function renderStaff() {
    const host = $("#staff");
    if (typeof ABCJS === "undefined") { host.innerHTML = `<p class="empty">악보 그리기 모듈을 못 불러왔어요.</p>`; return; }
    // abcjs 반응형 모드는 그리는 상자의 padding을 덮어쓰므로 안쪽 상자에 그린다(바깥 아래 여백 유지)
    host.innerHTML = `<div class="staff-svg"></div>`;
    const el = host.firstElementChild;
    const song = S.song;
    const { abc, tokens } = buildAbc(song, labels(), { chordText: staffChord, keyNames: noteName, usesFlats });
    const w = host.clientWidth || 343;
    const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#1e1b16";
    const visual = ABCJS.renderAbc(el, abc, {
      add_classes: true, responsive: "resize", staffwidth: Math.max(280, w - 8), scale: 1,
      paddingleft: 0, paddingright: 2, paddingtop: 4, paddingbottom: 24,
      wrap: { minSpacing: 1.5, maxSpacing: 2.6, preferredMeasuresPerLine: w < 500 ? 2 : 4 },
      visualTranspose: S.transpose,
      foregroundColor: ink,
      format: { gchordfont: "Georgia 16 bold", tempofont: "Georgia 12", vocalfont: "Georgia 13" },
      clickListener: (abcelem) => onStaffClick(abcelem),
    })[0];
    // 내가 만든 토큰(칸 정보) ↔ 그려진 음표·쉼표 SVG 연결.
    // 둘 다 악보 순서대로라 개수가 같으면 순서로 짝짓고, 아니면 문자 위치(앞 공백 2칸 허용)로 찾는다.
    const elems = [];
    (visual.lines || []).forEach((line) => (line.staff || []).forEach((st) => (st.voices || []).forEach((voice) => voice.forEach((e) => {
      if (e.el_type === "note") elems.push(e);
    }))));
    tokens.forEach((t) => (t.els = []));
    staffByChar = new Map();
    const link = (e, i) => {
      if (e.abselem && e.abselem.elemset) tokens[i].els.push(...e.abselem.elemset);
      staffByChar.set(e.startChar, i);
    };
    if (elems.length === tokens.length) elems.forEach(link);
    else {
      const byChar = new Map();
      tokens.forEach((t, i) => { for (let d = 0; d <= 2; d++) { byChar.set(t.char0 - d, i); byChar.set(t.char - d, i); } });
      elems.forEach((e) => { if (byChar.has(e.startChar)) link(e, byChar.get(e.startChar)); });
    }
    staffTok = tokens;
    if (!(song.melody && song.melody.notes.length)) {
      host.insertAdjacentHTML("afterbegin", `<p class="empty">보컬 멜로디를 찾지 못해 코드만 표시해요.</p>`);
    }
  }
  function onStaffClick(abcelem) {
    const t = staffTok[staffByChar.get(abcelem.startChar)];
    if (!t) return;
    if (S.editing) { openPicker(t.beat); return; }
    audio.currentTime = Math.max(0, cells[t.cell] - 0.03);
    melodyStop();
    tick(true);
  }
  function tokenAt(cell) {
    let lo = 0, hi = staffTok.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (staffTok[m].cell <= cell) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans;
  }
  function staffTick(t, force) {
    if (!staffTok.length) return;
    let lo = 0, hi = cells.length - 2, cell = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (cells[m] <= t) { cell = m; lo = m + 1; } else hi = m - 1; }
    const k = cell >= 0 ? tokenAt(cell) : -1;
    if (k === staffCur && !force) return;
    if (staffCur >= 0 && staffTok[staffCur]) staffTok[staffCur].els.forEach((e) => e.classList.remove("cur-n"));
    staffCur = k;
    const tok = staffTok[k];
    if (!tok || !tok.els.length) return;
    tok.els.forEach((e) => e.classList.add("cur-n"));
    if (S.follow && !audio.paused) {
      const r = tok.els[0].getBoundingClientRect();
      if (staffLineY === null || Math.abs(r.top - staffLineY) > 30) {
        staffLineY = r.top;
        const top = $(".topbar").getBoundingClientRect().bottom;
        const bottom = $(".player").getBoundingClientRect().top;
        if (r.top < top + 40 || r.bottom > bottom - 110) {
          window.scrollBy({ top: r.top - (top + (bottom - top) * 0.3), behavior: "smooth" });
          staffLineY = null;
        }
      }
    }
  }

  /* ---------- 멜로디 소리(받아적은 음을 합성음으로) ---------- */
  let actx = null, voices = [], nextNote = 0;
  function melodyInit() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
    } catch { actx = null; }
  }
  function melodyStop() {
    voices.forEach((v) => { try { v.stop(); } catch {} });
    voices = [];
    nextNote = -1;
  }
  function melodyTick() {
    if (!S.melSound || !actx || audio.paused) return;
    const notes = (S.song.melody && S.song.melody.notes) || [];
    if (!notes.length) return;
    const now = audio.currentTime, rate = audio.playbackRate || 1, ahead = 0.35;
    if (nextNote < 0) { // 현재 위치 다음 음부터
      nextNote = notes.findIndex(([s]) => cells[s] >= now - 0.01);
      if (nextNote < 0) nextNote = notes.length;
    }
    while (nextNote < notes.length && cells[notes[nextNote][0]] < now + ahead * rate) {
      const [s, n, p] = notes[nextNote++];
      const t0 = cells[s], t1 = cells[Math.min(cells.length - 1, s + n)];
      if (t0 < now - 0.05) continue;
      const when = actx.currentTime + (t0 - now) / rate;
      const dur = Math.max(0.05, (t1 - t0) / rate * 0.95);
      const osc = actx.createOscillator();
      const g = actx.createGain();
      osc.type = "triangle";
      osc.frequency.value = 440 * Math.pow(2, (p - 69) / 12);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.22, when + 0.015);
      g.gain.setValueAtTime(0.22, when + dur - 0.04);
      g.gain.linearRampToValueAtTime(0, when + dur);
      osc.connect(g).connect(actx.destination);
      osc.start(when);
      osc.stop(when + dur + 0.02);
      voices.push(osc);
      osc.onended = () => { voices = voices.filter((v) => v !== osc); };
    }
  }

  let beatEls = [], barEls = [], beatBar = [], lineEls = [], barNos = [];
  function renderGrid() {
    const song = S.song;
    const L = labels();
    const edited = editedFrom();
    const o = opts();
    const bars = song.bars;
    let html = "";
    let no = 0;
    for (let li = 0; li < bars.length; li += 4) {
      html += `<div class="line" data-line="${li / 4}">`;
      for (let bi = li; bi < Math.min(li + 4, bars.length); bi++) {
        const bar = bars[bi];
        if (!bar.pickup) no++;
        const changes = [];
        for (let i = bar.start; i < bar.start + bar.n; i++) {
          const isChange = i === 0 || L[i] !== L[i - 1];
          if (i === bar.start || isChange) changes.push({ i, label: L[i], cont: !isChange });
        }
        const adjacent = changes.some((c, j) => j > 0 && c.i - changes[j - 1].i === 1);
        const dense = changes.length >= 3 ? "dense3" : adjacent ? "dense" : "";
        const chordsHtml = changes.map((c) => {
          const h = chordHTML(c.label, opts(c.i));
          const left = ((c.i - bar.start) / bar.n) * 100;
          const cls = ["chord", h.nc ? "nc" : "", edited.has(c.i) ? "edited" : ""].join(" ");
          const style = `left:${left}%;${c.cont ? "opacity:.38" : ""}`;
          return `<span class="${cls}" style="${style}">${h.html}</span>`;
        }).join("");
        const beatsHtml = Array.from({ length: bar.n }, (_, j) => `<span class="beat" data-i="${bar.start + j}"></span>`).join("");
        html += `<div class="bar ${dense} ${bar.pickup ? "pickup" : ""}" data-bar="${bi}">
          ${bi === li ? `<span class="no">${bar.pickup ? "" : no}</span>` : ""}
          <div class="chords">${chordsHtml}</div>
          <div class="beats" style="grid-template-columns:repeat(${bar.n},1fr)">${beatsHtml}</div></div>`;
      }
      html += `</div>`;
    }
    const grid = $("#grid");
    grid.className = "grid" + (S.editing ? " editing" : "");
    grid.innerHTML = html + `<div class="end-mark">— 끝 —</div>`;
    fitChords(grid);
    beatEls = [...grid.querySelectorAll(".beat")];
    barEls = [...grid.querySelectorAll(".bar")];
    lineEls = [...grid.querySelectorAll(".line")];
    S.cur = -1;
  }

  function onGridTap(e) {
    const beat = e.target.closest(".beat");
    const bar = e.target.closest(".bar");
    if (!bar) return;
    if (S.editing) {
      const i = beat ? +beat.dataset.i : S.song.bars[+bar.dataset.bar].start;
      openPicker(i);
      return;
    }
    melodyStop();
    // 마디(또는 박)를 누르면 그 위치로 이동
    const i = beat ? +beat.dataset.i : S.song.bars[+bar.dataset.bar].start;
    audio.currentTime = Math.max(0, S.song.beats[i] - 0.05);
    tick(true);
  }

  function beatAt(t) {
    const b = S.song.beats;
    let lo = 0, hi = b.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (b[m] <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans;
  }

  function tick(force) {
    const t = audio.currentTime || 0;
    const seek = $("#seek");
    if (seek && document.activeElement !== seek) seek.value = t;
    if ($("#tCur")) $("#tCur").textContent = fmtTime(t);
    if (S.sheet === "staff") staffTick(t, force);
    const i = beatAt(t + 0.04);
    if (i === S.cur && !force) return;
    const prev = S.cur;
    S.cur = i;
    if (prev >= 0 && beatEls[prev]) beatEls[prev].classList.remove("on");
    const pb = prev >= 0 ? beatBar[prev] : -1;
    const nb = i >= 0 ? beatBar[i] : -1;
    if (pb !== nb || force) {
      barEls.forEach((el) => el.classList.remove("cur"));
      if (nb >= 0 && barEls[nb]) barEls[nb].classList.add("cur");
      if ($("#tBar")) $("#tBar").textContent = nb >= 0 ? (barNos[nb] ? `${barNos[nb]}마디` : "못갖춘마디") : "";
      if (nb >= 0 && S.follow && !audio.paused) followLine(Math.floor(nb / 4));
    }
    if (i >= 0 && beatEls[i]) beatEls[i].classList.add("on");
  }

  function followLine(li) {
    const el = lineEls[li];
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = $(".topbar").getBoundingClientRect().bottom;
    const bottom = $(".player").getBoundingClientRect().top;
    // 화면 위쪽 1/3 근처에 현재 줄이 오도록
    if (r.top < top + 8 || r.bottom > bottom - 90) {
      window.scrollBy({ top: r.top - (top + (bottom - top) * 0.28), behavior: "smooth" });
    }
  }

  function loop() {
    tick(false);
    melodyTick();
    raf = requestAnimationFrame(loop);
  }

  function togglePlay() {
    if (audio.paused) audio.play().catch((e) => toast("재생 실패: " + e.message));
    else audio.pause();
  }

  function switchSrc(src) {
    if (S.src === src) return;
    const t = audio.currentTime, playing = !audio.paused;
    S.src = src;
    audio.src = mediaUrl(id, S.song.audio[src]);
    audio.playbackRate = S.rate;
    audio.addEventListener("loadedmetadata", () => {
      audio.currentTime = t;
      audio.playbackRate = S.rate;
      if (playing) audio.play();
    }, { once: true });
    audio.load();
    app.querySelectorAll("[data-src]").forEach((b) => b.classList.toggle("on", b.dataset.src === src));
  }

  async function lockScreen(on) {
    try {
      if (on && "wakeLock" in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request("screen");
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch {}
  }

  function moreMenu() {
    const choice = prompt(DEMO ? "1: 제목 바꾸기\n2: 고친 코드 모두 되돌리기\n(데모: 설정은 이 브라우저에만 저장돼요)" : "1: 제목 바꾸기\n2: 고친 코드 모두 되돌리기\n3: 이 악보 지우기", "");
    if (choice === "1") {
      const t = prompt("새 제목", S.title);
      if (t && t.trim()) { S.title = t.trim(); save(); build(); }
    } else if (choice === "2") {
      if (confirm("고친 코드를 모두 원래대로 돌릴까요?")) { S.edits = {}; save(); refresh(); }
    } else if (choice === "3" && !DEMO) {
      if (confirm(`'${S.title}' 악보를 지울까요?`)) {
        audio.pause();
        api(`/api/songs/${id}`, { method: "DELETE" }).then(() => { location.hash = "#/"; }).catch((e) => toast(e.message));
      }
    }
  }

  /* 코드 고르기 시트 */
  function openPicker(i) {
    const o = opts(i);
    const shift = o.shift;
    const curLabel = labels()[i];
    const c = parse(curLabel) || { r: S.song.key.tonic, q: "maj", b: null };
    let sel = { r: mod(c.r + shift), q: c.q, b: c.b === null ? null : mod(c.b + shift) }; // 화면(조옮김 후) 기준
    const flats = o.flats;
    const scrim = document.createElement("div");
    scrim.className = "scrim";
    const sheet = document.createElement("div");
    sheet.className = "picker";
    document.body.append(scrim, sheet);
    const close = () => { scrim.remove(); sheet.remove(); };
    scrim.onclick = close;
    const barNo = barNos[beatBar[i]] || 0;
    const beatNo = i - S.song.bars[beatBar[i]].start + 1;
    const qLabel = (q) => {
      const [b, s] = QDISP[q];
      return noteName(sel.r, flats) + b + (s ? `<sup>${s}</sup>` : "");
    };
    const draw = () => {
      const now = { r: sel.r, q: sel.q, b: sel.b };
      sheet.innerHTML = `
        <div class="head"><span class="now chord" style="position:static;padding:0">${chordHTML(unparse(now), { flats }).html}</span>
          <span class="where">${barNo}마디 ${beatNo}박 · 원래 ${esc(chordText(S.song.chords[S.view === "simple" ? "simple" : "full"][i], o))}</span></div>
        <h4>근음</h4>
        <div class="pgrid r">${Array.from({ length: 12 }, (_, r) => `<button class="pbtn ${r === sel.r ? "on" : ""}" data-r="${r}">${noteName(r, flats)}</button>`).join("")}</div>
        <h4>종류</h4>
        <div class="pgrid q">${QORDER.map((q) => `<button class="pbtn ${q === sel.q ? "on" : ""}" data-q="${q}" style="font-size:15px">${qLabel(q)}</button>`).join("")}</div>
        <h4>베이스(슬래시 코드)</h4>
        <div class="pgrid r"><button class="pbtn ${sel.b === null ? "on" : ""}" data-b="none" style="font-size:14px">없음</button>${
          Array.from({ length: 12 }, (_, r) => r).filter((r) => r !== sel.r).slice(0, 11)
            .map((r) => `<button class="pbtn ${r === sel.b ? "on" : ""}" data-b="${r}">/${noteName(r, flats)}</button>`).join("")}</div>
        <div class="actions">
          <button class="btn ghost" data-act="nc">N.C.</button>
          <button class="btn ghost" data-act="reset">원래대로</button>
          <button class="btn" data-act="ok">적용</button>
        </div>`;
    };
    draw();
    sheet.onclick = (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      if (t.dataset.r !== undefined) { sel.r = +t.dataset.r; sel.b = null; draw(); }
      else if (t.dataset.q !== undefined) { sel.q = t.dataset.q; draw(); }
      else if (t.dataset.b !== undefined) { sel.b = t.dataset.b === "none" ? null : +t.dataset.b; draw(); }
      else if (t.dataset.act) {
        if (t.dataset.act === "reset") delete S.edits[i];
        else if (t.dataset.act === "nc") S.edits[i] = "N";
        else S.edits[i] = unparse({ r: mod(sel.r - shift), q: sel.q, b: sel.b === null ? null : mod(sel.b - shift) });
        save();
        close();
        if (S.sheet === "staff") renderStaff(); else renderGrid();
        tick(true);
      }
    };
  }

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    lockScreen(false);
    melodyStop();
    if (actx) actx.close().catch(() => {});
    document.querySelectorAll(".scrim,.picker").forEach((el) => el.remove());
  };
}
