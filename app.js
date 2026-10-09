(() => {
  "use strict";

  const CFG = window.OUR_CINEMA_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const IMG = "https://image.tmdb.org/t/p/";
  const TABS = [
    ["proposed", "Proposed"], ["agreed", "Agreed"], ["watched", "Watched"],
    ["aleks", "Declined by Aleks"], ["alina", "Declined by Alina"], ["both", "Declined by both"],
  ];
  const EMPTY = {
    proposed: ["Nothing proposed right now", "Add a title above. When you both vote Yes it moves to Agreed."],
    agreed: ["No agreed films yet", "Films land here once Aleks and Alina both vote Yes."],
    watched: ["Nothing watched yet", "Tick Watched on any film to move it here."],
    aleks: ["Aleks hasn't declined anything", "Films Aleks votes No on (and Alina doesn't) show up here."],
    alina: ["Alina hasn't declined anything", "Films Alina votes No on (and Aleks doesn't) show up here."],
    both: ["Nothing declined by both", "Films you both vote No on show up here."],
  };

  let sb = null;
  let films = [], loaded = false, started = false;
  let tab = "proposed", query = "", me = "";
  const expanded = new Set();
  const busy = new Set();
  const selected = new Set();
  let visibleIds = [];

  try { const t = localStorage.getItem("oc-tab"); if (TABS.some((x) => x[0] === t)) tab = t; } catch (e) {}
  if (TABS.some((x) => "#" + x[0] === location.hash)) tab = location.hash.slice(1);

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");
  const hash = (s) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.codePointAt(0)) >>> 0; return x; };
  const titleOf = (f) => f.name_en || f.name_ua || "Untitled";
  const isCyr = (s) => /[Ѐ-ӿ]/.test(s);
  const ytUrl = (key) => (key ? "https://www.youtube.com/watch?v=" + key : "");
  function ytId(url) {
    const m = String(url || "").match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : "";
  }
  function posterSrc(p, size) {
    if (!p) return "";
    if (/^https?:\/\//i.test(p)) return p;
    if (p.startsWith("/")) return IMG + size + p;
    return "";
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  function tabOf(f) {
    if (f.watched) return "watched";
    const a = f.aleks || "", b = f.alina || "";
    if (a === "no" && b === "no") return "both";
    if (a === "no") return "aleks";
    if (b === "no") return "alina";
    if (a === "yes" && b === "yes") return "agreed";
    return "proposed";
  }

  let toastTimer;
  function toast(msg, action) {
    const t = $("#toast");
    t.textContent = msg;
    if (action) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "toast-btn"; b.textContent = action.label;
      b.addEventListener("click", () => { t.hidden = true; action.run(); }, { once: true });
      t.append(b);
    }
    t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), action ? 8000 : 4500);
  }
  function setStatus(msg, err) {
    const s = $("#status"); s.textContent = msg || ""; s.hidden = !msg; s.classList.toggle("err", !!err);
  }
  function dbErr(e) {
    if (!e) return "Something went wrong. Try again.";
    if (e.code === "23505") return "That film is already on the list.";
    if (e.code === "42501" || /row-level security/i.test(e.message || "")) return "This account can't change the list.";
    if (/JWT|token/i.test(e.message || "")) return "Your sign-in expired. Reload the page.";
    return "Couldn't save. Check your connection and try again.";
  }

  // ---------- TMDB ----------
  class TmdbError extends Error { constructor(kind) { super(kind); this.kind = kind; } }
  // TMDB is called by a database function that holds the key; the browser never sees it.
  async function tmdb(path, params) {
    let res;
    try { res = await sb.rpc("tmdb", { path, params: params || {} }); }
    catch (e) { throw new TmdbError("network"); }
    if (res.error) {
      const m = res.error.message || "";
      if (/status 401/.test(m)) throw new TmdbError("auth");
      if (/status 429/.test(m)) throw new TmdbError("rate");
      if (/key missing/.test(m)) throw new TmdbError("nokey");
      if (/Failed to fetch|NetworkError/i.test(m)) throw new TmdbError("network");
      throw new TmdbError("http");
    }
    return res.data || {};
  }
  function tmdbMsg(e) {
    switch (e && e.kind) {
      case "nokey": return "The TMDB key isn't set up on the server.";
      case "auth": return "TMDB rejected the server's key.";
      case "rate": return "TMDB is busy. Try again in a few seconds.";
      case "network": return "Couldn't reach TMDB. Check your connection.";
      default: return "TMDB lookup failed. Try again.";
    }
  }

  async function searchTitles(q) {
    const d = await tmdb("/search/multi", { query: q, language: isCyr(q) ? "uk-UA" : "en-US", include_adult: "false" });
    return (d.results || [])
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .slice(0, 7)
      .map((r) => ({
        id: r.id, type: r.media_type,
        title: r.title || r.name || "",
        original: r.original_title || r.original_name || "",
        year: (r.release_date || r.first_air_date || "").slice(0, 4),
        poster: r.poster_path || "",
      }));
  }

  function pickTrailer(vids, lang) {
    const pool = vids.filter((v) => v.site === "YouTube" && v.key && (lang === "uk" ? v.iso_639_1 === "uk" : v.iso_639_1 !== "uk"));
    const score = (v) => (v.type === "Trailer" ? 100 : v.type === "Teaser" ? 50 : 0) + (v.official ? 20 : 0)
      + (lang !== "uk" && v.iso_639_1 === "en" ? 10 : 0) + (/official/i.test(v.name || "") ? 3 : 0);
    const ok = pool.filter((v) => score(v) >= 50);
    ok.sort((a, b) => score(b) - score(a) || String(a.published_at || "").localeCompare(String(b.published_at || "")));
    return ok[0] ? ok[0].key : "";
  }

  async function fetchDetails(type, id) {
    const [en, uk] = await Promise.all([
      tmdb(`/${type}/${id}`, { language: "en-US", append_to_response: "videos", include_video_language: "en,uk,null" }),
      tmdb(`/${type}/${id}`, { language: "uk-UA" }),
    ]);
    const vids = (en.videos && en.videos.results) || [];
    const date = en.release_date || en.first_air_date || "";
    return {
      tmdb_id: id,
      media_type: type,
      name_en: en.title || en.name || "",
      name_ua: uk.title || uk.name || "",
      year: date ? Number(date.slice(0, 4)) : null,
      runtime: type === "movie" ? (en.runtime || null) : ((en.episode_run_time || [])[0] || null),
      genres: (en.genres || []).map((g) => g.name).slice(0, 3),
      desc_en: en.overview || "",
      desc_ua: uk.overview || "",
      poster_path: en.poster_path || uk.poster_path || "",
      trailer_en: ytUrl(pickTrailer(vids, "en")),
      trailer_ua: ytUrl(pickTrailer(vids, "uk")),
      match_state: "done",
    };
  }

  // ---------- rendering ----------
  const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';

  function trailerHTML(f, which, label) {
    const url = which === "en" ? f.trailer_en : f.trailer_ua;
    if (!url) return f.tmdb_id ? `<span class="none">${which === "ua" ? "No UA trailer on TMDB" : "No trailer on TMDB"}</span>` : '<span class="dim">—</span>';
    return `<button type="button" class="trl" data-act="play" data-id="${f.id}" data-which="${which}">${PLAY}<span>${esc(label)}</span></button>`;
  }
  function posterHTML(f) {
    const t = titleOf(f), src = posterSrc(f.poster_path, "w185");
    if (src) return `<button class="poster" data-act="edit" data-id="${f.id}" aria-label="Edit ${esc(t)}"><img src="${esc(src)}" alt="" loading="lazy"></button>`;
    return `<button class="poster" data-act="edit" data-id="${f.id}" aria-label="Edit ${esc(t)}"><span class="pg" style="--h:${hash(t) % 360}"><span class="pg-t">${esc(t)}</span><span class="pg-y">${esc(f.year || "")}</span></span></button>`;
  }
  function metaHTML(f) {
    const bits = [];
    if (f.year) bits.push(f.year);
    if (f.runtime) bits.push(f.runtime + " min");
    if (f.media_type === "tv") bits.push("series");
    if (Array.isArray(f.genres) && f.genres.length) bits.push(f.genres.slice(0, 3).join(", "));
    return bits.length ? `<div class="meta">${esc(bits.join(" · "))}</div>` : "";
  }
  function fillHTML(f) {
    if (busy.has(f.id)) return `<div class="fillstate"><span class="spin"></span>Filling in from TMDB…</div>`;
    if (!f.tmdb_id && f.match_state === "failed") return `<div class="fillstate">Not found on TMDB. <button class="linkbtn" data-act="edit" data-id="${f.id}">Find it</button></div>`;
    return "";
  }
  function descHTML(f, lang) {
    const text = lang === "en" ? f.desc_en : f.desc_ua;
    if (!text) return f.tmdb_id && lang === "ua" ? '<span class="none">No Ukrainian description on TMDB</span>' : '<span class="dim">—</span>';
    const key = f.id + ":" + lang, open = expanded.has(key);
    return `<div class="desc${open ? " open" : ""}" ${lang === "ua" ? 'lang="uk"' : ""} data-act="desc" data-key="${key}" role="button" tabindex="0" aria-expanded="${open}">${esc(text)}</div>`;
  }
  function voteHTML(f, who, showName) {
    const v = f[who] || "", Who = who === "aleks" ? "Aleks" : "Alina";
    return `<div class="vote ${who}" role="group" aria-label="${Who}'s vote">${showName ? `<span class="vote-name">${Who}</span>` : ""}`
      + `<button class="vb yes${v === "yes" ? " on" : ""}" data-act="vote" data-id="${f.id}" data-who="${who}" data-val="yes" aria-pressed="${v === "yes"}">Yes</button>`
      + `<button class="vb no${v === "no" ? " on" : ""}" data-act="vote" data-id="${f.id}" data-who="${who}" data-val="no" aria-pressed="${v === "no"}">No</button></div>`;
  }
  function watchHTML(f, prefix) {
    return `<label class="watch"><input type="checkbox" id="${prefix}-w-${f.id}" data-act="watched" data-id="${f.id}" ${f.watched ? "checked" : ""}><span>Watched</span></label>`;
  }
  const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9zm4 2v8h2v-8h-2zm4 0v8h2v-8h-2z"/></svg>';
  function selHTML(f, prefix) {
    const on = selected.has(f.id);
    return `<input type="checkbox" class="sel" id="${prefix}-s-${f.id}" data-act="select" data-id="${f.id}" ${on ? "checked" : ""} aria-label="Select ${esc(titleOf(f))}">`;
  }
  function delBtnHTML(f) {
    return `<button class="iconbtn del" data-act="delete" data-id="${f.id}" aria-label="Delete ${esc(titleOf(f))}" title="Delete">${TRASH}</button>`;
  }
  function rowHTML(f) {
    return `<tr${selected.has(f.id) ? ' class="is-sel"' : ""}>
      <td class="c-sel">${selHTML(f, "t")}</td>
      <td class="c-poster">${posterHTML(f)}</td>
      <td class="c-name"><div class="title-en">${f.name_en ? esc(f.name_en) : '<span class="dim">—</span>'}</div>${metaHTML(f)}${fillHTML(f)}</td>
      <td class="c-name"><div class="title-ua" lang="uk">${f.name_ua ? esc(f.name_ua) : '<span class="dim">—</span>'}</div></td>
      <td class="c-desc">${descHTML(f, "en")}</td>
      <td class="c-desc">${descHTML(f, "ua")}</td>
      <td class="c-tr">${trailerHTML(f, "en", "Play EN")}</td>
      <td class="c-tr">${trailerHTML(f, "ua", "Play UA")}</td>
      <td class="c-vote">${voteHTML(f, "aleks", false)}</td>
      <td class="c-vote">${voteHTML(f, "alina", false)}</td>
      <td class="c-watch">${watchHTML(f, "t")}</td>
      <td class="c-edit"><div class="row-tools"><button class="iconbtn" data-act="edit" data-id="${f.id}">Edit</button>${delBtnHTML(f)}</div></td>
    </tr>`;
  }
  function cardHTML(f) {
    const tr = [f.trailer_en ? trailerHTML(f, "en", "EN trailer") : "", f.trailer_ua ? trailerHTML(f, "ua", "UA трейлер") : ""].join("");
    return `<article class="card${selected.has(f.id) ? " is-sel" : ""}">
      <label class="card-sel">${selHTML(f, "c")}</label>
      <div>${posterHTML(f)}</div>
      <div class="card-head">
        <div class="title-en">${esc(f.name_en || f.name_ua || "Untitled")}</div>
        ${f.name_en && f.name_ua ? `<div class="title-ua" lang="uk">${esc(f.name_ua)}</div>` : ""}
        ${metaHTML(f)}${fillHTML(f)}
        ${tr ? `<div class="card-trailers">${tr}</div>` : ""}
      </div>
      ${f.desc_en || f.desc_ua ? `<div class="card-desc">
        ${f.desc_en ? `<div><span class="lang">EN</span>${descHTML(f, "en")}</div>` : ""}
        ${f.desc_ua ? `<div><span class="lang">UA</span>${descHTML(f, "ua")}</div>` : ""}
      </div>` : ""}
      <div class="card-actions">
        ${voteHTML(f, "aleks", true)}
        ${voteHTML(f, "alina", true)}
        ${watchHTML(f, "c")}
        <span class="spacer"></span>
        <button class="iconbtn" data-act="edit" data-id="${f.id}">Edit</button>
        ${delBtnHTML(f)}
      </div>
    </article>`;
  }

  function render() {
    const counts = Object.fromEntries(TABS.map(([k]) => [k, 0]));
    for (const f of films) counts[tabOf(f)]++;
    $("#tabs").innerHTML = TABS.map(([k, label]) =>
      `<button class="tab" role="tab" data-tab="${k}" aria-selected="${k === tab}"><span>${label}</span><span class="n">${counts[k]}</span></button>`).join("");
    $("#stats").textContent = loaded ? `${films.length} titles · ${counts.watched} watched` : "";
    if (!loaded) return;
    setStatus("");

    const q = norm(query);
    let list = films.filter((f) => tabOf(f) === tab);
    if (q) list = list.filter((f) => norm(f.name_en).includes(q) || norm(f.name_ua).includes(q));
    const t = (x) => (x ? Date.parse(x) || 0 : 0);
    list.sort((a, b) => tab === "watched" ? t(b.watched_at) - t(a.watched_at) : t(b.created_at) - t(a.created_at));

    visibleIds = list.map((f) => f.id);
    for (const id of [...selected]) if (!visibleIds.includes(id)) selected.delete(id);
    renderBulk();

    const empty = $("#empty");
    if (!list.length) {
      const [h, s] = q ? ["No matches", "No titles in this list match your search."] : EMPTY[tab];
      empty.innerHTML = `<b>${esc(h)}</b>${esc(s)}`;
      empty.hidden = false; $("#tableWrap").hidden = true; $("#cards").hidden = true;
      return;
    }
    empty.hidden = true; $("#tableWrap").hidden = false; $("#cards").hidden = false;
    $("#rows").innerHTML = list.map(rowHTML).join("");
    $("#cards").innerHTML = list.map(cardHTML).join("");
  }

  // ---------- selection & delete (Gmail-style) ----------
  let bulkArmed = false;
  function renderBulk() {
    const n = selected.size, total = visibleIds.length;
    const all = $("#selAll");
    all.checked = n > 0 && n === total;
    all.indeterminate = n > 0 && n < total;
    all.disabled = total === 0;
    $("#bulkCount").textContent = n ? `${n} selected` : "Select";
    $("#bulkDelete").hidden = n === 0;
    $("#bulkClear").hidden = n === 0;
    if (!n) bulkArmed = false;
    $("#bulkDelete").textContent = bulkArmed ? `Confirm: delete ${n}` : `Delete ${n === 1 ? "film" : n + " films"}`;
    $("#bulkDelete").classList.toggle("armed", bulkArmed);
    $("#bulk").classList.toggle("active", n > 0);
  }
  function toggleSelect(id, on) {
    if (on) selected.add(id); else selected.delete(id);
    bulkArmed = false;
    render();
  }
  async function deleteFilms(ids) {
    ids = ids.filter((id) => films.some((f) => f.id === id));
    if (!ids.length) return;
    const removed = films.filter((f) => ids.includes(f.id));
    films = films.filter((f) => !ids.includes(f.id));
    ids.forEach((id) => selected.delete(id));
    bulkArmed = false;
    render();
    const { error } = await sb.from("films").delete().in("id", ids);
    if (error) { films = films.concat(removed); render(); toast(dbErr(error)); return; }
    const label = removed.length === 1 ? `Deleted “${titleOf(removed[0])}”` : `Deleted ${removed.length} films`;
    toast(label, { label: "Undo", run: () => restoreFilms(removed) });
  }
  async function restoreFilms(rows) {
    const { data, error } = await sb.from("films").insert(rows.map((r) => ({ ...r }))).select();
    if (error) { toast(dbErr(error)); return; }
    for (const r of data || []) if (!films.some((f) => f.id === r.id)) films.push(r);
    render();
    toast(rows.length === 1 ? "Restored" : `Restored ${rows.length} films`);
  }
  $("#selAll").addEventListener("change", (e) => {
    if (e.target.checked) visibleIds.forEach((id) => selected.add(id)); else selected.clear();
    bulkArmed = false; render();
  });
  $("#bulkClear").addEventListener("click", () => { selected.clear(); bulkArmed = false; render(); });
  $("#bulkDelete").addEventListener("click", () => {
    if (!bulkArmed) { bulkArmed = true; renderBulk(); return; }
    deleteFilms([...selected]);
  });

  // ---------- data ----------
  async function loadFilms() {
    const { data, error } = await sb.from("films").select("*").order("created_at", { ascending: false });
    if (error) { setStatus("Your list couldn't load. Reload the page to try again.", true); return; }
    films = data || []; loaded = true; render();
  }
  function subscribe() {
    sb.channel("films-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "films" }, (p) => {
        if (p.eventType === "DELETE") films = films.filter((f) => f.id !== (p.old && p.old.id));
        else if (p.new) {
          const i = films.findIndex((f) => f.id === p.new.id);
          if (i >= 0) films[i] = p.new; else films.unshift(p.new);
        }
        render();
      })
      .subscribe();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && started) loadFilms(); });
  }
  async function patchFilm(id, patch) {
    const i = films.findIndex((f) => f.id === id);
    const prev = i >= 0 ? films[i] : null;
    if (prev) { films[i] = { ...prev, ...patch }; render(); }
    const { data, error } = await sb.from("films").update(patch).eq("id", id).select().maybeSingle();
    if (error || !data) {
      const j = films.findIndex((f) => f.id === id);
      if (prev && j >= 0) { films[j] = prev; render(); }
      toast(dbErr(error));
      return false;
    }
    const j = films.findIndex((f) => f.id === id);
    if (j >= 0) films[j] = data;
    render();
    return true;
  }
  async function insertFilm(row) {
    const { data, error } = await sb.from("films").insert(row).select().single();
    if (error) { toast(dbErr(error)); return null; }
    if (!films.some((f) => f.id === data.id)) films.unshift(data);
    render();
    return data;
  }

  // Films added without a TMDB match (e.g. carried over) get matched once.
  let matching = false;
  async function autoMatch() {
    if (matching) return;
    matching = true;
    try {
      for (const f of films.filter((x) => !x.tmdb_id && !x.match_state)) {
        busy.add(f.id); render();
        try {
          const q = f.name_en || f.name_ua;
          const res = await searchTitles(q);
          const same = (r) => [f.name_en, f.name_ua].some((n) => n && (norm(r.title) === norm(n) || norm(r.original) === norm(n)));
          const best = res.find((r) => same(r) && f.year && Number(r.year) === f.year)
            || res.find((r) => f.year && Number(r.year) === f.year) || res.find(same) || res[0];
          if (!best || films.some((x) => x.tmdb_id === best.id && x.media_type === best.type)) throw new TmdbError("none");
          const d = await fetchDetails(best.type, best.id);
          await patchFilm(f.id, d);
        } catch (e) {
          if (e.kind === "auth") { toast(tmdbMsg(e)); break; }
          if (e.kind === "none") await patchFilm(f.id, { match_state: "failed" });
        } finally { busy.delete(f.id); render(); }
      }
    } finally { matching = false; }
  }

  // ---------- suggestions (shared by add bar and editor) ----------
  function makeSuggest(input, list, onPick) {
    let items = [], active = -1, seq = 0;
    const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); active = -1; };
    const paint = (note) => {
      if (note) { list.innerHTML = `<li class="s-note">${esc(note)}</li>`; list.hidden = false; return; }
      if (!items.length) { close(); return; }
      list.innerHTML = items.map((r, i) => {
        const img = r.poster ? `<img src="${esc(IMG + "w92" + r.poster)}" alt="">` : '<span class="noimg"></span>';
        const sub = [r.year, r.type === "tv" ? "series" : "film", r.original && r.original !== r.title ? r.original : ""].filter(Boolean).join(" · ");
        return `<li role="option" data-i="${i}" aria-selected="${i === active}">${img}<div style="min-width:0"><div class="s-t">${esc(r.title)}</div><div class="s-m">${esc(sub)}</div></div></li>`;
      }).join("");
      list.hidden = false; input.setAttribute("aria-expanded", "true");
    };
    const run = debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) { items = []; close(); return; }
      const my = ++seq;
      try { const res = await searchTitles(q); if (my !== seq) return; items = res; active = -1; paint(res.length ? "" : "No matches on TMDB"); }
      catch (e) { if (my === seq) paint(tmdbMsg(e)); }
    }, 300);
    input.addEventListener("input", run);
    input.addEventListener("keydown", (e) => {
      if (list.hidden || !items.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % items.length; paint(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + items.length) % items.length; paint(); }
      else if (e.key === "Escape") { close(); }
      else if (e.key === "Enter" && active >= 0) { e.preventDefault(); const r = items[active]; close(); onPick(r); }
    });
    list.addEventListener("mousedown", (e) => e.preventDefault());
    list.addEventListener("click", (e) => { const li = e.target.closest("li[data-i]"); if (!li) return; const r = items[Number(li.dataset.i)]; close(); onPick(r); });
    input.addEventListener("blur", () => setTimeout(close, 150));
    return { close, top: () => items[0] || null, clear: () => { items = []; seq++; close(); } };
  }

  // ---------- add ----------
  const addInput = $("#addInput"), addMsg = $("#addMsg"), addBtn = $("#addBtn");
  const addSuggest = makeSuggest(addInput, $("#suggest"), (r) => addFromResult(r));
  function showAddMsg(t) { addMsg.textContent = t; addMsg.hidden = !t; }

  async function addFromResult(r) {
    showAddMsg("");
    const dup = films.find((f) => f.tmdb_id === r.id && f.media_type === r.type);
    if (dup) { showAddMsg(`“${titleOf(dup)}” is already on the list (in ${TABS.find((t) => t[0] === tabOf(dup))[1]}).`); return; }
    addBtn.disabled = true; addBtn.textContent = "Adding…";
    try {
      const d = await fetchDetails(r.type, r.id);
      const row = await insertFilm(d);
      if (row) { addInput.value = ""; addSuggest.clear(); if (tab !== "proposed") selectTab("proposed"); toast(`Added ${titleOf(row)}`); }
    } catch (e) { showAddMsg(tmdbMsg(e)); }
    finally { addBtn.disabled = false; addBtn.textContent = "Add film"; }
  }
  $("#addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = addInput.value.trim();
    if (!q) { showAddMsg("Type a title first."); return; }
    addBtn.disabled = true;
    try {
      const res = await searchTitles(q);
      addSuggest.close();
      const exact = res.filter((r) => norm(r.title) === norm(q) || norm(r.original) === norm(q));
      const best = exact.find((r) => r.type === "movie") || exact[0] || res[0];
      if (best) await addFromResult(best);
      else showAddMsg(`No match on TMDB for “${q}”. Check the spelling, or try the other language.`);
    } catch (err) { showAddMsg(tmdbMsg(err)); }
    finally { addBtn.disabled = false; }
  });

  // ---------- interactions ----------
  function selectTab(k) {
    if (k !== tab) { selected.clear(); bulkArmed = false; }
    tab = k;
    try { localStorage.setItem("oc-tab", k); } catch (e) {}
    try { history.replaceState(null, "", "#" + k); } catch (e) {}
    render();
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) selectTab(b.dataset.tab); });
  $("#search").addEventListener("input", (e) => { query = e.target.value; render(); });

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.tagName === "INPUT") return;
    const act = el.dataset.act, id = el.dataset.id;
    if (act === "desc") { const k = el.dataset.key; expanded.has(k) ? expanded.delete(k) : expanded.add(k); render(); }
    else if (act === "vote") {
      const f = films.find((x) => x.id === id); if (!f) return;
      patchFilm(id, { [el.dataset.who]: f[el.dataset.who] === el.dataset.val ? "" : el.dataset.val });
    }
    else if (act === "edit") openEditor(id);
    else if (act === "delete") deleteFilms([id]);
    else if (act === "play") {
      const f = films.find((x) => x.id === id); if (!f) return;
      openPlayer(f, el.dataset.which);
    }
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.act === "select") { toggleSelect(el.dataset.id, el.checked); return; }
    if (el.dataset && el.dataset.act === "watched") patchFilm(el.dataset.id, { watched: el.checked, watched_at: el.checked ? new Date().toISOString() : null });
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches('[data-act="desc"]')) { e.preventDefault(); e.target.click(); }
    if (e.key === "Escape") { if (!$("#player").hidden) closePlayer(); else if (!$("#editor").hidden) closeEditor(); else if (selected.size) { selected.clear(); bulkArmed = false; render(); } }
  });

  function openOverlay(sel) { $(sel).hidden = false; document.body.style.overflow = "hidden"; }
  function closeOverlay(sel) { $(sel).hidden = true; if ([...document.querySelectorAll(".overlay")].every((o) => o.hidden)) document.body.style.overflow = ""; }

  // ---------- trailer player ----------
  function openPlayer(f, which) {
    const url = which === "en" ? f.trailer_en : f.trailer_ua;
    const id = ytId(url);
    if (!id) { if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener"); return; }
    $("#playerTitle").textContent = `${titleOf(f)} · ${which === "en" ? "English trailer" : "Український трейлер"}`;
    $("#playerYt").href = "https://www.youtube.com/watch?v=" + id;
    $("#playerFrame").innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="Trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    openOverlay("#player");
  }
  function closePlayer() { $("#playerFrame").innerHTML = ""; closeOverlay("#player"); }
  $("#playerClose").addEventListener("click", closePlayer);
  $("#player").addEventListener("click", (e) => { if (e.target.id === "player") closePlayer(); });

  // ---------- editor ----------
  let edId = null, edMatch = null, delArmed = false;
  const edMsg = $("#edMsg");
  function edPreview() {
    const p = $("#edPoster").value.trim();
    const src = posterSrc(p, "w185");
    $("#edPosterPrev").innerHTML = src
      ? `<span class="poster"><img src="${esc(src)}" alt=""></span>`
      : `<span class="poster"><span class="pg" style="--h:${hash($("#edEn").value || $("#edUa").value) % 360}"><span class="pg-t">${esc($("#edEn").value || $("#edUa").value)}</span></span></span>`;
  }
  function fillForm(d) {
    $("#edEn").value = d.name_en || ""; $("#edUa").value = d.name_ua || "";
    $("#edYear").value = d.year || ""; $("#edRuntime").value = d.runtime || "";
    $("#edGenres").value = Array.isArray(d.genres) ? d.genres.join(", ") : "";
    $("#edDescEn").value = d.desc_en || ""; $("#edDescUa").value = d.desc_ua || "";
    $("#edTrEn").value = d.trailer_en || ""; $("#edTrUa").value = d.trailer_ua || "";
    $("#edPoster").value = d.poster_path || "";
    edPreview();
  }
  const edSuggest = makeSuggest($("#edMatch"), $("#edSuggest"), async (r) => {
    edMsg.classList.remove("ok"); edMsg.textContent = "Loading from TMDB…";
    try {
      const d = await fetchDetails(r.type, r.id);
      const dup = films.find((f) => f.id !== edId && f.tmdb_id === d.tmdb_id && f.media_type === d.media_type);
      if (dup) { edMsg.textContent = `“${titleOf(dup)}” is already on the list.`; return; }
      edMatch = d; fillForm(d); $("#edMatch").value = "";
      edMsg.classList.add("ok"); edMsg.textContent = "Filled in from TMDB. Tap Save to keep it.";
    } catch (e) { edMsg.textContent = tmdbMsg(e); }
  });
  function openEditor(id) {
    const f = films.find((x) => x.id === id); if (!f) return;
    edId = id; edMatch = null; delArmed = false;
    $("#edDelete").textContent = "Delete film";
    $("#edTitle").textContent = "Edit · " + titleOf(f);
    $("#edMatch").value = ""; edSuggest.clear();
    edMsg.textContent = ""; edMsg.classList.remove("ok");
    fillForm(f);
    openOverlay("#editor");
  }
  function closeEditor() { closeOverlay("#editor"); edId = null; edMatch = null; }
  $("#edCancel").addEventListener("click", closeEditor);
  $("#editor").addEventListener("click", (e) => { if (e.target.id === "editor") closeEditor(); });
  $("#edPoster").addEventListener("input", edPreview);
  $("#edForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = films.find((x) => x.id === edId); if (!f) { closeEditor(); return; }
    edMsg.classList.remove("ok");
    const trEn = $("#edTrEn").value.trim(), trUa = $("#edTrUa").value.trim();
    for (const u of [trEn, trUa]) if (u && !/^https?:\/\//i.test(u)) { edMsg.textContent = "Trailers need a full link starting with https://"; return; }
    const patch = {
      name_en: $("#edEn").value.trim(), name_ua: $("#edUa").value.trim(),
      year: num($("#edYear").value), runtime: num($("#edRuntime").value),
      genres: $("#edGenres").value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5),
      desc_en: $("#edDescEn").value.trim(), desc_ua: $("#edDescUa").value.trim(),
      trailer_en: trEn, trailer_ua: trUa,
      poster_path: $("#edPoster").value.trim(),
    };
    if (!patch.name_en && !patch.name_ua) { edMsg.textContent = "Give the film at least one title."; return; }
    if (edMatch) { patch.tmdb_id = edMatch.tmdb_id; patch.media_type = edMatch.media_type; patch.match_state = "done"; }
    const id = edId; closeEditor();
    if (await patchFilm(id, patch)) toast("Saved");
  });
  $("#edDelete").addEventListener("click", async () => {
    const id = edId; closeEditor();
    deleteFilms([id]);
  });

  $("#logoutBtn").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });

  // ---------- auth ----------
  function showGate(msg, ok) {
    $("#app").hidden = true; $("#gate").hidden = false;
    if (msg != null) { const m = $("#loginMsg"); m.textContent = msg; m.classList.toggle("ok", !!ok); }
  }
  function showApp() { $("#gate").hidden = true; $("#app").hidden = false; }

  // Sign-in button: enabled only for a member email (compared by SHA-256 fingerprint,
  // so the addresses aren't in the public code), then locked for 60 s after each send.
  const COOLDOWN_MS = 60000;
  const loginBtn = $("#loginBtn"), loginEmail = $("#loginEmail"), loginHint = $("#loginHint");
  let emailOk = false, sending = false, cooldownTimer = null, checkSeq = 0;
  function cooldownLeft() {
    let until = 0;
    try { until = Number(localStorage.getItem("oc-login-wait")) || 0; } catch (e) {}
    return Math.max(0, until - Date.now());
  }
  function startCooldown(ms) {
    try { localStorage.setItem("oc-login-wait", String(Date.now() + ms)); } catch (e) {}
    tickLogin();
  }
  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function tickLogin() {
    clearTimeout(cooldownTimer);
    const left = cooldownLeft();
    if (left > 0) {
      loginBtn.disabled = true;
      loginBtn.textContent = `Send again in ${Math.ceil(left / 1000)}s`;
      cooldownTimer = setTimeout(tickLogin, 1000);
      return;
    }
    loginBtn.textContent = "Send sign-in link";
    loginBtn.disabled = sending || !emailOk || !sb;
  }
  async function checkEmail() {
    const my = ++checkSeq;
    const v = loginEmail.value.trim().toLowerCase();
    const looksComplete = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v);
    const ok = looksComplete && (CFG.memberEmailHashes || []).includes(await sha256(v));
    if (my !== checkSeq) return;
    emailOk = ok;
    loginHint.hidden = !looksComplete || ok;
    tickLogin();
  }
  loginEmail.addEventListener("input", checkEmail);
  loginEmail.addEventListener("change", checkEmail);

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!emailOk || sending || cooldownLeft() > 0) return;
    const email = loginEmail.value.trim().toLowerCase();
    sending = true; tickLogin();
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    sending = false;
    if (error) {
      if (error.status === 429) { startCooldown(COOLDOWN_MS); showGate("Too many sign-in emails right now. Wait a bit, then try again."); }
      else { tickLogin(); showGate("Couldn't send the link: " + error.message); }
      return;
    }
    startCooldown(COOLDOWN_MS);
    showGate(`Link sent to ${email}. Open it on any device to sign in.`, true);
  });

  async function onSession(session) {
    if (!session) { started = false; showGate(); return; }
    if (/access_token|refresh_token/.test(location.hash)) { try { history.replaceState(null, "", location.pathname + "#" + tab); } catch (e) {} }
    const { data: name, error } = await sb.rpc("member_name");
    if (error || !name) {
      await sb.auth.signOut();
      showGate(error ? "Couldn't check your access. Try again." : `${session.user.email} doesn't have access to this list.`);
      return;
    }
    me = name;
    $("#whoName").textContent = "Signed in as " + me;
    showApp();
    if (started) return;
    started = true;
    render();
    await loadFilms();
    subscribe();
    autoMatch();
  }

  function boot() {
    if (!window.supabase || !CFG.supabaseUrl || !CFG.supabaseAnonKey || CFG.supabaseAnonKey.startsWith("PASTE")) {
      showGate("This site isn't connected to its database yet.");
      $("#loginBtn").disabled = true;
      return;
    }
    setTimeout(checkEmail, 300);
    tickLogin();
    const hashErr = new URLSearchParams(location.hash.slice(1)).get("error_description");
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
    });
    let seen = false;
    sb.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      seen = true;
      setTimeout(() => onSession(session), 0);
    });
    if (hashErr) setTimeout(() => showGate(/expired|invalid/i.test(hashErr) ? "That sign-in link has expired. Send a new one." : hashErr), 50);
    setTimeout(async () => { if (!seen) { const { data } = await sb.auth.getSession(); onSession(data.session); } }, 1500);
  }
  boot();
})();
