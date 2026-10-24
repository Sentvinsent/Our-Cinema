(() => {
  "use strict";

  const CFG = window.OUR_CINEMA_CONFIG || {};
  const $ = (s) => document.querySelector(s);

  // ---------- language: the Ukrainian text is the source, English comes from i18n.js ----------
  const EN = window.OC_EN || {}, EN_PL = window.OC_EN_PL || {}, GENRE_EN = window.OC_GENRE_EN || {};
  let LANG = "uk";
  try { const l = localStorage.getItem("oc-lang"); if (l === "uk" || l === "en") LANG = l; } catch (e) {}
  // T("Додано «{t}»", { t: "Dune" }) → "Додано «Dune»" or "Added “Dune”"
  function T(s, v) {
    let out = LANG === "en" && EN[s] != null ? EN[s] : s;
    if (v) out = out.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
    return out;
  }
  const isEn = () => LANG === "en";
  const LOCALE = () => (LANG === "en" ? "en-GB" : "uk-UA");
  const dec = (x) => (Math.round(x * 10) / 10).toLocaleString(LOCALE());
  // Remember the page's own Ukrainian text so it can be swapped back and forth.
  const STATIC_TEXT = [], STATIC_ATTR = [];
  (function captureStatic() {
    const cyr = /[А-Яа-яІіЇїЄєҐґ]/;
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) if (cyr.test(n.nodeValue)) STATIC_TEXT.push([n, n.nodeValue]);
    for (const el of document.querySelectorAll("[placeholder],[aria-label],[title]"))
      for (const a of ["placeholder", "aria-label", "title"]) { const v = el.getAttribute(a); if (v && cyr.test(v)) STATIC_ATTR.push([el, a, v]); }
  })();
  function applyStatic() {
    for (const [n, uk] of STATIC_TEXT) {
      if (!n.isConnected) continue;
      const m = uk.match(/^(\s*)([\s\S]*?)(\s*)$/);
      n.nodeValue = m[1] + T(m[2]) + m[3];
    }
    for (const [el, a, uk] of STATIC_ATTR) el.setAttribute(a, T(uk));
    document.documentElement.lang = LANG;
    document.title = T("Наше кіно");
    document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === LANG)));
  }
  const IMG = "https://image.tmdb.org/t/p/";
  const TABS = [
    ["proposed", "Запропоновані"], ["agreed", "Погоджені"], ["watching", "Дивимось"], ["watched", "Переглянуті"],
    ["recs", "Рекомендовані"], ["declined", "Відхилені"],
  ];
  // «Відхилені» has its own small filter: everyone / declined by Aleks / by Alina / by both
  const DECL = [["all", "Усі"], ["aleks", "Алекс"], ["alina", "Аліна"], ["both", "Обоє"]];
  const CARDS_ONLY = new Set(["watching", "recs"]); // few items with richer controls: cards on every screen size
  const EMPTY = {
    proposed: ["Поки нічого не запропоновано", "Додайте назву вгорі. Коли ви обоє проголосуєте «Так», фільм перейде до погоджених."],
    agreed: ["Погоджених фільмів ще немає", "Тут з’являються фільми, за які Алекс і Аліна обоє проголосували «Так»."],
    watching: ["Зараз нічого не дивитесь", "Натисніть «Почали дивитись» на серіалі — тут можна буде відмічати сезон і серію."],
    watched: ["Переглянутих ще немає", "Позначте «Переглянуто» на будь-якому фільмі, і він з’явиться тут."],
    declined: ["Відхилених немає", "Тут з’являються назви, за які хтось із вас проголосував «Ні»."],
  };
  const EMPTY_DECL = {
    aleks: ["Алекс нічого не відхилив", "Тут назви, за які Алекс проголосував «Ні» (а Аліна — ні)."],
    alina: ["Аліна нічого не відхилила", "Тут назви, за які Аліна проголосувала «Ні» (а Алекс — ні)."],
    both: ["Обоє нічого не відхилили", "Тут назви, за які ви обоє проголосували «Ні»."],
  };
  const NAME = { Aleks: "Алекс", Alina: "Аліна" };
  const setNames = () => { NAME.Aleks = T("Алекс"); NAME.Alina = T("Аліна"); };
  // TMDB genre names (English) → Ukrainian, for films saved before genres were stored in Ukrainian.
  const GENRE_UA = {
    "Action": "Бойовик", "Adventure": "Пригоди", "Animation": "Анімація", "Comedy": "Комедія", "Crime": "Кримінал",
    "Documentary": "Документальний", "Drama": "Драма", "Family": "Сімейний", "Fantasy": "Фентезі", "History": "Історичний",
    "Horror": "Жахи", "Music": "Музика", "Mystery": "Детектив", "Romance": "Мелодрама", "Science Fiction": "Фантастика",
    "TV Movie": "Телефільм", "Thriller": "Трилер", "War": "Військовий", "Western": "Вестерн",
    "Action & Adventure": "Бойовик і пригоди", "Kids": "Дитячий", "News": "Новини", "Reality": "Реаліті",
    "Sci-Fi & Fantasy": "Фантастика і фентезі", "Soap": "Мильна опера", "Talk": "Ток-шоу", "War & Politics": "Війна і політика",
  };
  const genreUa = (g) => GENRE_UA[g] || g;
  const genreShow = (g) => { const ua = genreUa(g); return isEn() ? GENRE_EN[ua] || (GENRE_UA[g] ? g : ua) : ua; };
  // Ukrainian plural: plural(5, ["фільм", "фільми", "фільмів"]) → "фільмів"
  function plural(n, forms) {
    if (LANG === "en") { const e = EN_PL[forms[0]] || [forms[0], forms[0]]; return n === 1 ? e[0] : e[1]; }
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b === 1) return forms[0];
    if (b >= 2 && b <= 4) return forms[1];
    return forms[2];
  }
  const FILMS = ["фільм", "фільми", "фільмів"];

  let sb = null;
  let films = [], loaded = false, started = false;
  let tab = "proposed", query = "", me = "";
  const expanded = new Set();
  const busy = new Set();
  const selected = new Set();
  let visibleIds = [];
  const PAGE = 10;
  let shown = PAGE, kind = "all";
  try { const k = localStorage.getItem("oc-kind"); if (k === "movie" || k === "tv") kind = k; } catch (e) {}
  const motionOK = () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(.2,.8,.2,1)";

  let decl = "all";
  try { const d = localStorage.getItem("oc-decl"); if (DECL.some((x) => x[0] === d)) decl = d; } catch (e) {}
  const OLD_DECL = { aleks: 1, alina: 1, both: 1 }; // the three declined tabs before they were merged
  function tabFromKey(k) {
    if (OLD_DECL[k]) { decl = k; return "declined"; }
    return TABS.some((x) => x[0] === k) ? k : null;
  }
  try { const t = tabFromKey(localStorage.getItem("oc-tab")); if (t) tab = t; } catch (e) {}
  { const t = tabFromKey(location.hash.slice(1)); if (t) tab = t; }

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");
  const hash = (s) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.codePointAt(0)) >>> 0; return x; };
  const titleOf = (f) => (isEn() ? f.name_en || f.name_ua : f.name_ua || f.name_en) || T("Без назви");
  const otherTitle = (f) => { const o = isEn() ? f.name_ua : f.name_en; return o && norm(o) !== norm(titleOf(f)) ? o : ""; };
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
    if (f.media_type === "tv" && f.next_s != null) return "watching";
    const a = f.aleks || "", b = f.alina || "";
    if (a === "no" || b === "no") return "declined";
    if (a === "yes" && b === "yes") return "agreed";
    return "proposed";
  }
  const declOf = (f) => (f.aleks === "no" && f.alina === "no" ? "both" : f.aleks === "no" ? "aleks" : "alina");

  let toastTimer;
  function toast(msg, action) {
    const t = $("#toast");
    t.textContent = "";
    const text = document.createElement("span");
    text.className = "toast-text"; text.textContent = msg;
    t.append(text);
    if (action) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "toast-btn"; b.textContent = action.label;
      b.addEventListener("click", () => { t.hidden = true; action.run(); }, { once: true });
      t.append(b);
    }
    t.hidden = false;
    if (motionOK()) t.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: EASE });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (!motionOK()) { t.hidden = true; return; }
      t.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(6px)" }], { duration: 160, easing: "ease-in" }).finished.then(() => (t.hidden = true), () => (t.hidden = true));
    }, action ? 8000 : 4500);
  }
  function setStatus(msg, err) {
    const s = $("#status"); s.textContent = msg || ""; s.hidden = !msg; s.classList.toggle("err", !!err);
  }
  function dbErr(e) {
    if (!e) return T("Щось пішло не так. Спробуйте ще раз.");
    if (e.code === "23505") return T("Цей фільм уже є в списку.");
    if (e.code === "42501" || /row-level security/i.test(e.message || "")) return T("Цей обліковий запис не може змінювати список.");
    if (/JWT|token/i.test(e.message || "")) return T("Сеанс завершився. Оновіть сторінку.");
    return T("Не вдалося зберегти. Перевірте з’єднання і спробуйте ще раз.");
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
      case "nokey": return T("Ключ TMDB не налаштований на сервері.");
      case "auth": return T("TMDB не прийняв ключ сервера.");
      case "rate": return T("TMDB перевантажений. Спробуйте за кілька секунд.");
      case "network": return T("Не вдалося зв’язатися з TMDB. Перевірте з’єднання.");
      default: return T("Пошук у TMDB не вдався. Спробуйте ще раз.");
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
      tmdb(`/${type}/${id}`, { language: "en-US", append_to_response: "videos,watch/providers", include_video_language: "en,uk,null" }),
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
      genres: ((uk.genres && uk.genres.length ? uk.genres : en.genres) || []).map((g) => genreUa(g.name)).slice(0, 3),
      desc_en: en.overview || "",
      desc_ua: uk.overview || "",
      poster_path: en.poster_path || uk.poster_path || "",
      trailer_en: ytUrl(pickTrailer(vids, "en")),
      trailer_ua: ytUrl(pickTrailer(vids, "uk")),
      match_state: "done",
      ...metaFrom(type, en),
    };
  }

  // ---------- where to watch (Poland) + series info ----------
  // Variants of the same service ("Netflix basic with Ads", "HBO Max Amazon Channel") collapse into one tag.
  const provName = (n) => String(n || "").replace(/\s+(basic |standard )?with ads$/i, "").replace(/\s+(amazon|apple tv|roku premium) channel$/i, "")
    .replace(/^Amazon Prime Video$/i, "Prime Video").replace(/^Disney Plus$/i, "Disney+").trim();
  function providersFrom(d) {
    const pl = d && d["watch/providers"] && d["watch/providers"].results && d["watch/providers"].results.PL;
    if (!pl) return { sub: [], paid: false };
    const seen = new Set(), sub = [];
    for (const p of [...(pl.flatrate || []), ...(pl.free || []), ...(pl.ads || [])].sort((a, b) => (a.display_priority || 99) - (b.display_priority || 99))) {
      const n = provName(p.provider_name);
      if (!n || seen.has(n.toLowerCase())) continue;
      seen.add(n.toLowerCase()); sub.push({ n, l: p.logo_path || "" });
    }
    return { sub, paid: !!((pl.rent && pl.rent.length) || (pl.buy && pl.buy.length)) };
  }
  function tvInfoFrom(d) {
    const seasons = (d.seasons || []).filter((x) => x.season_number > 0 && x.episode_count > 0)
      .map((x) => ({ s: x.season_number, e: x.episode_count, d: x.air_date || null }));
    const nx = d.next_episode_to_air, la = d.last_episode_to_air;
    return {
      status: d.status || "", seasons,
      next: nx ? { s: nx.season_number, e: nx.episode_number, d: nx.air_date || null } : null,
      last: la ? { s: la.season_number, e: la.episode_number } : null,
    };
  }
  // fields refreshed from one TMDB details response (fetched with append_to_response=watch/providers)
  function metaFrom(type, d) {
    const m = { providers: providersFrom(d), meta_at: new Date().toISOString() };
    if (type === "tv") m.tv_info = tvInfoFrom(d);
    return m;
  }
  const airedSeasons = (f) => (f.tv_info && f.tv_info.last && f.tv_info.last.s) || 0;

  // ---------- rendering ----------
  const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';

  const FILM_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4V4zm2 2v2h2V6H6zm10 0v2h2V6h-2zM6 10v4h2v-4H6zm10 0v4h2v-4h-2zM6 16v2h2v-2H6zm10 0v2h2v-2h-2zM10 6v12h4V6h-4z"/></svg>';
  const TV_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2l4 4 4-4 1.4 1.4L14.8 6H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5.2L6.6 3.4 8 2zM4 8v10h16V8H4z"/></svg>';
  function kindHTML(f) {
    return f.media_type === "tv"
      ? `<span class="kind kind-tv">${TV_ICON}${T("Серіал")}</span>`
      : `<span class="kind kind-movie">${FILM_ICON}${T("Фільм")}</span>`;
  }
  function trailerHTML(f, which, label) {
    const url = which === "en" ? f.trailer_en : f.trailer_ua;
    if (!url) return f.tmdb_id ? `<span class="none">${T(which === "ua" ? "Українського трейлера на TMDB немає" : "Трейлера на TMDB немає")}</span>` : '<span class="dim">—</span>';
    return `<button type="button" class="trl" data-act="play" data-id="${f.id}" data-which="${which}">${PLAY}<span>${esc(label)}</span></button>`;
  }
  function posterHTML(f) {
    const t = titleOf(f), src = posterSrc(f.poster_path, "w185");
    if (src) return `<button class="poster" data-act="edit" data-id="${f.id}" aria-label="${T("Редагувати: {t}", { t: esc(t) })}"><img src="${esc(src)}" alt="" loading="lazy"></button>`;
    return `<button class="poster" data-act="edit" data-id="${f.id}" aria-label="${T("Редагувати: {t}", { t: esc(t) })}"><span class="pg" style="--h:${hash(t) % 360}"><span class="pg-t">${esc(t)}</span><span class="pg-y">${esc(f.year || "")}</span></span></button>`;
  }
  function metaHTML(f) {
    const bits = [];
    if (f.year) bits.push(f.year);
    if (f.runtime) bits.push(f.runtime + T(f.media_type === "tv" ? " хв/серія" : " хв"));
    if (Array.isArray(f.genres) && f.genres.length) bits.push(f.genres.slice(0, 3).map(genreShow).join(", "));
    return bits.length ? `<div class="meta">${esc(bits.join(" · "))}</div>` : "";
  }
  function fillHTML(f) {
    if (busy.has(f.id)) return `<div class="fillstate"><span class="spin"></span>${T("Заповнюємо з TMDB…")}</div>`;
    if (!f.tmdb_id && f.match_state === "failed") return `<div class="fillstate">${T("Не знайдено на TMDB.")} <button class="linkbtn" data-act="edit" data-id="${f.id}">${T("Знайти")}</button></div>`;
    return "";
  }
  function descHTML(f, lang) {
    const text = lang === "en" ? f.desc_en : f.desc_ua;
    if (!text) return f.tmdb_id && lang === "ua" ? '<span class="none">' + T("Українського опису на TMDB немає") + '</span>' : '<span class="dim">—</span>';
    const key = f.id + ":" + lang, open = expanded.has(key);
    return `<div class="desc${open ? " open" : ""}" ${lang === "ua" ? 'lang="uk"' : ""} data-act="desc" data-key="${key}" role="button" tabindex="0" aria-expanded="${open}">${esc(text)}</div>`;
  }
  // You vote only for yourself (the column is picked from who is signed in); your partner's vote is shown read-only.
  const myKey = () => (me === "Alina" ? "alina" : "aleks");
  const theirKey = () => (me === "Alina" ? "aleks" : "alina");
  function voteHTML(f, who, showName) {
    const v = f[who] || "", Who = who === "aleks" ? NAME.Aleks : NAME.Alina;
    if (who !== myKey()) {
      const txt = T(v === "yes" ? "Так" : v === "no" ? "Ні" : (who === "alina" ? "Ще не вирішила" : "Ще не вирішив"));
      return `<div class="vote ${who}">${showName ? `<span class="vote-name">${Who}</span>` : ""}`
        + `<div class="vote-ro ${v || "none"}" aria-label="${Who}: ${txt}">${v ? (v === "yes" ? CHECK : CROSS) : ""}<span>${txt}</span></div></div>`;
    }
    return `<div class="vote ${who} mine" role="group" aria-label="${T("Хочеш подивитися?")}">${showName ? `<span class="vote-name">${T("Хочеш подивитися?")}</span>` : ""}`
      + `<div class="seg"><button class="vb yes${v === "yes" ? " on" : ""}" data-act="vote" data-id="${f.id}" data-who="${who}" data-val="yes" aria-pressed="${v === "yes"}">${T("Так")}</button>`
      + `<button class="vb no${v === "no" ? " on" : ""}" data-act="vote" data-id="${f.id}" data-who="${who}" data-val="no" aria-pressed="${v === "no"}">${T("Ні")}</button></div></div>`;
  }
  function watchHTML(f, prefix) {
    return `<label class="watch${f.watched ? " on" : ""}"><input type="checkbox" id="${prefix}-w-${f.id}" data-act="watched" data-id="${f.id}" ${f.watched ? "checked" : ""}><span>${T("Переглянуто")}</span></label>`;
  }
  // Star ratings (1–10) replace the Так/Ні votes once a title is watched.
  // One row of ten stars per person; on phones the two people stack, so each row gets the full card width.
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.8 5.9 6.5.8-4.8 4.5 1.2 6.4L12 17.1l-5.7 3.1 1.2-6.4-4.8-4.5 6.5-.8z"/></svg>';
  const STAR_WORD = ["зірка", "зірки", "зірок"];
  function starsHTML(f, who, showName) {
    const r = f[who + "_rating"] || 0, Who = who === "aleks" ? NAME.Aleks : NAME.Alina;
    let s = "";
    for (let i = 1; i <= 10; i++) {
      s += `<button type="button" class="st${i <= r ? " on" : ""}" data-act="rate" data-id="${f.id}" data-who="${who}" data-val="${i}" role="radio" aria-checked="${i === r}" aria-label="${T("{n} {w} з 10", { n: i, w: plural(i, STAR_WORD) })}">${STAR}</button>`;
    }
    const val = `<span class="rate-val${r ? "" : " none"}">${r ? `${r}<small>/10</small>` : "—<small>/10</small>"}</span>`;
    return `<div class="vote rate ${who}">`
      + (showName ? `<div class="rate-head"><span class="vote-name">${Who}</span>${val}</div>` : "")
      + `<div class="stars" role="radiogroup" aria-label="${T("Оцінка: {who}", { who: Who })}">${s}</div>`
      + (showName ? "" : val) + `</div>`;
  }
  function scoreOf(f) {
    const rs = [f.aleks_rating, f.alina_rating].filter((x) => x >= 1);
    return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  }
  function scoreHTML(f) {
    const sc = f.watched ? scoreOf(f) : null;
    if (sc == null) return "";
    return `<span class="score" title="${T("Середня оцінка з 10")}">${STAR}${dec(sc)}</span>`;
  }
  const rateOrVote = (f, who, showName) => f.watched ? starsHTML(f, who, showName) : voteHTML(f, who, showName);
  // ---------- where to watch, series progress, "new" badges ----------
  const fmtDate = (d) => { const t = d ? new Date(d + "T12:00:00") : null; return t && !isNaN(t) ? t.toLocaleDateString(LOCALE(), { day: "numeric", month: "short" }) : T("скоро"); };
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z"/></svg>';
  const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>';
  // mode "row": label + chips with logo and name (cards, picker); "icons": logos only (narrow table column)
  function provHTML(f, mode = "row") {
    const p = f.providers;
    if (!p || f.watched) return "";
    const subs = p.sub || [];
    const label = mode === "row" ? `<span class="prov-l">${T("Де дивитись")}</span>` : "";
    if (!subs.length) return `<div class="prov prov-${mode}">${label}<span class="ptag none">${T(p.paid ? "Лише оренда або купівля" : "Немає на стрімінгах у Польщі")}</span></div>`;
    const top = subs.slice(0, mode === "icons" ? 5 : 4), more = subs.length - top.length;
    const logo = (x) => (x.l ? `<img src="${esc(IMG + "w45" + x.l)}" alt="" loading="lazy">` : `<span class="plogo">${esc(x.n.charAt(0))}</span>`);
    const chip = (x) => mode === "icons"
      ? `<span class="ptag icon" role="listitem" title="${esc(x.n)}" aria-label="${esc(x.n)}">${logo(x)}</span>`
      : `<span class="ptag" role="listitem">${logo(x)}<span>${esc(x.n)}</span></span>`;
    return `<div class="prov prov-${mode}" role="list" aria-label="${T("Де дивитись у Польщі")}">${label}${top.map(chip).join("")}`
      + (more > 0 ? `<span class="ptag more" role="listitem" title="${esc(subs.slice(top.length).map((x) => x.n).join(", "))}">+${more}</span>` : "") + `</div>`;
  }
  // next_s / next_e = the next episode you are going to watch. Past the end of a season it rolls
  // over to episode 1 of the next season as soon as TMDB lists that season.
  function progOf(f) {
    let s = f.next_s || 1, e = f.next_e || 1;
    const seasons = (f.tv_info && f.tv_info.seasons) || [];
    const cur = seasons.find((x) => x.s === s);
    if (cur && e > cur.e) {
      const after = seasons.filter((x) => x.s > s).sort((a, b) => a.s - b.s)[0];
      if (after) { s = after.s; e = 1; }
    }
    return { s, e };
  }
  function caughtUp(f) {
    const la = f.tv_info && f.tv_info.last;
    if (!la || f.next_s == null) return false;
    const p = progOf(f);
    return p.s > la.s || (p.s === la.s && p.e > la.e);
  }
  function nextEp(f) {
    const p = progOf(f), seasons = (f.tv_info && f.tv_info.seasons) || [];
    const cur = seasons.find((x) => x.s === p.s);
    if (cur && p.e >= cur.e) {
      const after = seasons.filter((x) => x.s > p.s).sort((a, b) => a.s - b.s)[0];
      if (after) return { next_s: after.s, next_e: 1 };
    }
    return { next_s: p.s, next_e: p.e + 1 };
  }
  const watchedPatch = (f, on) => {
    const p = { watched: on, watched_at: on ? new Date().toISOString() : null };
    if (on && f.media_type === "tv") Object.assign(p, { seen_s: airedSeasons(f) || f.next_s || null, next_s: null, next_e: null });
    return p;
  };
  function seasonBadgeHTML(f) {
    if (f.media_type !== "tv" || !f.tv_info) return "";
    const nx = f.tv_info.next, aired = airedSeasons(f);
    if (f.watched) {
      if (f.seen_s && aired > f.seen_s) return `<span class="sbadge hot">${T("Новий сезон {n}", { n: aired })}</span>`;
      if (nx && nx.e === 1 && nx.s > (f.seen_s || aired)) return `<span class="sbadge">${T("Сезон {s} · {d}", { s: nx.s, d: fmtDate(nx.d) })}</span>`;
      return "";
    }
    if (f.next_s != null) return caughtUp(f) && nx ? `<span class="sbadge">${T("Нова серія · {d}", { d: fmtDate(nx.d) })}</span>` : "";
    return nx && nx.e === 1 && nx.s > 1 ? `<span class="sbadge">${T("Сезон {s} · {d}", { s: nx.s, d: fmtDate(nx.d) })}</span>` : "";
  }
  let seenAt = 0; // titles your partner added after this moment get a "Нове" badge
  const isNew = (f) => seenAt > 0 && f.created_by && me && f.created_by !== me && Date.parse(f.created_at) > seenAt;
  const newHTML = (f) => (isNew(f) ? `<span class="nbadge">${T("Нове")}</span>` : "");
  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 10.6 19.7C5.4 15 2 11.9 2 8.1 2 5 4.4 2.6 7.5 2.6c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1C19.6 2.6 22 5 22 8.1c0 3.8-3.4 6.9-8.6 11.6L12 21z"/></svg>';
  const partnerWants = (f) => !f.watched && f[theirKey()] === "yes" && !f[myKey()];
  const wantHTML = (f) => (partnerWants(f) ? `<span class="wbadge">${HEART}${T("{name} хоче", { name: NAME[partner()] })}</span>` : "");
  function startHTML(f) {
    if (f.media_type !== "tv") return "";
    if (f.watched) {
      const aired = airedSeasons(f);
      return f.seen_s && aired > f.seen_s
        ? `<button type="button" class="startbtn" data-act="newseason" data-id="${f.id}">${PLAY}${T("Дивитись сезон {n}", { n: f.seen_s + 1 })}</button>` : "";
    }
    return f.next_s == null ? `<button type="button" class="startbtn" data-act="start" data-id="${f.id}">${PLAY}${T("Почали дивитись")}</button>` : "";
  }
  function progressHTML(f) {
    if (f.media_type !== "tv" || f.next_s == null || f.watched) return "";
    const ti = f.tv_info || {}, seasons = ti.seasons && ti.seasons.length ? ti.seasons : null;
    const { s: cs, e: ce } = progOf(f);
    const epsIn = (n) => { const x = seasons && seasons.find((y) => y.s === n); return x ? x.e : null; };
    const maxS = seasons ? Math.max(cs, ...seasons.map((x) => x.s)) : Math.max(cs + 2, 5);
    const total = epsIn(cs), maxE = Math.max(total || 30, ce);
    const opt = (n, cur) => `<option value="${n}"${n === cur ? " selected" : ""}>${n}</option>`;
    const sOpts = Array.from({ length: maxS }, (_, i) => opt(i + 1, cs)).join("");
    const eOpts = Array.from({ length: maxE }, (_, i) => opt(i + 1, ce)).join("");
    const cu = caughtUp(f), ended = /ended|canceled/i.test(ti.status || "");
    let action;
    if (cu && ended) action = `<button type="button" class="btn primary epbtn" data-act="finish" data-id="${f.id}">${CHECK}${T("Усе переглянули — позначити серіал")}</button>`;
    else if (cu) action = `<div class="prog-note">${T("Ви наздогнали серіал.")} ${ti.next ? T("Наступна серія вийде {d}.", { d: fmtDate(ti.next.d) }) : T("Нових серій поки не оголошено.")}</div>`;
    else action = `<button type="button" class="btn primary epbtn" data-act="ep-done" data-id="${f.id}">${CHECK}${T("Переглянули серію {e}", { e: ce })}${seasons && seasons.length > 1 ? " " + T("(сезон {s})", { s: cs }) : ""}</button>`;
    const pct = total ? Math.min(100, Math.round(((Math.min(ce, total + 1) - 1) / total) * 100)) : 0;
    return `<div class="prog">
      <div class="prog-top"><span class="prog-h">${T("Наступна серія")}</span><button type="button" class="linkbtn prog-stop" data-act="stop" data-id="${f.id}">${T("Перестали дивитись")}</button></div>
      <div class="prog-sel">
        <label><span>${T("Сезон")}</span><select data-act="prog-s" data-id="${f.id}" aria-label="${T("Сезон")}">${sOpts}</select></label>
        <label><span>${T("Серія")}</span><select data-act="prog-e" data-id="${f.id}" aria-label="${T("Серія")}">${eOpts}</select></label>
        ${total ? `<span class="prog-of">${T("з {n} у сезоні", { n: total })}</span>` : ""}
      </div>
      ${total ? `<div class="prog-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>` : ""}
      ${action}
    </div>`;
  }
  const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm17.7-10.2a1 1 0 0 0 0-1.42l-2.33-2.33a1 1 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
  function editBtnHTML(f, iconOnly) {
    return iconOnly
      ? `<button class="iconbtn sq" data-act="edit" data-id="${f.id}" aria-label="${T("Редагувати: {t}", { t: esc(titleOf(f)) })}" title="${T("Редагувати")}">${PENCIL}</button>`
      : `<button class="iconbtn" data-act="edit" data-id="${f.id}">${T("Змінити")}</button>`;
  }
  const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9zm4 2v8h2v-8h-2zm4 0v8h2v-8h-2z"/></svg>';
  function selHTML(f, prefix) {
    const on = selected.has(f.id);
    return `<input type="checkbox" class="sel" id="${prefix}-s-${f.id}" data-act="select" data-id="${f.id}" ${on ? "checked" : ""} aria-label="${T("Вибрати: {t}", { t: esc(titleOf(f)) })}">`;
  }
  function delBtnHTML(f) {
    return `<button class="iconbtn sq del" data-act="delete" data-id="${f.id}" aria-label="${T("Видалити: {t}", { t: esc(titleOf(f)) })}" title="${T("Видалити")}">${TRASH}</button>`;
  }
  function rowHTML(f) {
    return `<tr data-key="${f.id}"${selected.has(f.id) ? ' class="is-sel"' : ""}>
      <td class="c-sel">${selHTML(f, "t")}</td>
      <td class="c-poster">${posterHTML(f)}</td>
      <td class="c-name"><div class="badges">${kindHTML(f)}${scoreHTML(f)}${seasonBadgeHTML(f)}${newHTML(f)}</div><div class="title-en">${f.name_en ? esc(f.name_en) : '<span class="dim">—</span>'}</div>${metaHTML(f)}${fillHTML(f)}</td>
      <td class="c-name"><div class="title-ua" lang="uk">${f.name_ua ? esc(f.name_ua) : '<span class="dim">—</span>'}</div>${provHTML(f, "icons")}${startHTML(f)}</td>
      <td class="c-desc">${descHTML(f, "en")}</td>
      <td class="c-desc">${descHTML(f, "ua")}</td>
      <td class="c-tr">${trailerHTML(f, "en", T("Англ."))}</td>
      <td class="c-tr">${trailerHTML(f, "ua", T("Укр."))}</td>
      <td class="c-vote">${rateOrVote(f, myKey(), false)}</td>
      <td class="c-vote">${f.watched ? rateOrVote(f, theirKey(), false) : wantHTML(f) || '<span class="dim">—</span>'}</td>
      <td class="c-watch">${watchHTML(f, "t")}</td>
      <td class="c-edit"><div class="row-tools">${editBtnHTML(f, true)}${delBtnHTML(f)}</div></td>
    </tr>`;
  }
  // trailer buttons, primary language first
  function trailersHTML(f) {
    const ua = f.trailer_ua ? trailerHTML(f, "ua", T("Трейлер укр.")) : "", en = f.trailer_en ? trailerHTML(f, "en", T("Трейлер англ.")) : "";
    return isEn() ? en + ua : ua + en;
  }
  function cardHTML(f) {
    const tr = trailersHTML(f);
    const main = titleOf(f), second = otherTitle(f);
    return `<article data-key="${f.id}" class="card${selected.has(f.id) ? " is-sel" : ""}${f.media_type === "tv" ? " is-tv" : ""}">
      <label class="card-sel">${selHTML(f, "c")}</label>
      <div class="card-poster">${posterHTML(f)}</div>
      <div class="card-head">
        <div class="badges">${kindHTML(f)}${scoreHTML(f)}${seasonBadgeHTML(f)}${newHTML(f)}${wantHTML(f)}</div>
        <div class="title-ua">${esc(main)}</div>
        ${second ? `<div class="title-en">${esc(second)}</div>` : ""}
        ${metaHTML(f)}${fillHTML(f)}
      </div>
      ${provHTML(f) ? `<div class="card-prov">${provHTML(f)}</div>` : ""}
      ${progressHTML(f) ? `<div class="card-prog">${progressHTML(f)}</div>` : ""}
      ${tr ? `<div class="card-trailers">${tr}</div>` : ""}
      ${f.desc_en || f.desc_ua ? `<div class="card-desc">
        ${(isEn() ? ["en", "ua"] : ["ua", "en"]).map((l) => (l === "ua" ? f.desc_ua : f.desc_en)
          ? `<div${l === "en" ? ' lang="en"' : ""}><span class="lang">${T(l === "ua" ? "Укр." : "Англ.")}</span>${descHTML(f, l)}</div>` : "").join("")}
      </div>` : ""}
      ${startHTML(f) ? `<div class="card-start">${startHTML(f)}</div>` : ""}
      <div class="card-actions">
        <div class="card-votes${f.watched ? " is-rate" : " is-mine"}">
          ${f.watched ? rateOrVote(f, myKey(), true) + rateOrVote(f, theirKey(), true) : voteHTML(f, myKey(), true)}
        </div>
        <div class="card-tools">
          ${watchHTML(f, "c")}
          ${editBtnHTML(f, true)}
          ${delBtnHTML(f)}
        </div>
      </div>
    </article>`;
  }

  const kindOK = (f) => kind === "all" || (kind === "tv" ? f.media_type === "tv" : f.media_type !== "tv");
  // Remember where each visible item sits, so after re-rendering we can slide items into
  // their new places (FLIP) and fade in only the ones that are new.
  function snapshot() {
    const pos = new Map();
    document.querySelectorAll("[data-key]").forEach((el) => { if (el.offsetParent) pos.set(el.dataset.key + "|" + el.tagName, el.getBoundingClientRect().top); });
    return pos;
  }
  function play(before) {
    if (!motionOK() || !before) return;
    let n = 0;
    document.querySelectorAll("[data-key]").forEach((el) => {
      if (!el.offsetParent) return;
      const k = el.dataset.key + "|" + el.tagName, top = el.getBoundingClientRect().top;
      if (before.has(k)) {
        const dy = before.get(k) - top;
        if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 240, easing: EASE });
      } else if (top < window.innerHeight + 200) {
        el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
          { duration: 220, easing: EASE, delay: Math.min(n++ * 28, 220), fill: "backwards" });
      }
    });
  }
  // Fade an item out before it leaves the current list (delete, vote moves it to another tab…).
  function animateOut(ids) {
    if (!motionOK()) return Promise.resolve();
    const els = [...document.querySelectorAll("[data-key]")].filter((el) => ids.includes(el.dataset.key) && el.offsetParent);
    if (!els.length) return Promise.resolve();
    return Promise.all(els.map((el) => el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.98)" }],
      { duration: 160, easing: "ease-in", fill: "forwards" }).finished.catch(() => {}))).then(() => {});
  }

  function render(animate = true) {
    const before = animate && loaded ? snapshot() : null;
    const counts = Object.fromEntries(TABS.map(([k]) => [k, 0])), fresh = {};
    for (const f of films) if (kindOK(f)) { const k = tabOf(f); counts[k]++; if (isNew(f)) fresh[k] = true; }
    if (recs.status === "ready") counts.recs = recItems().length;
    const showN = (k) => !(k === "recs" && recs.status !== "ready");
    $("#tabs").innerHTML = TABS.map(([k, label]) =>
      `<button class="tab" role="tab" data-tab="${k}" aria-selected="${k === tab}"><span>${T(label)}</span>`
      + (showN(k) ? `<span class="n">${counts[k]}</span>` : "")
      + (fresh[k] ? `<span class="tdot" title="${T("Є нові")}"></span>` : "") + `</button>`).join("");
    // phones: one button showing the current list; tapping it opens all lists in a panel
    const cur = TABS.find((t) => t[0] === tab);
    $("#listLabel").textContent = cur ? T(cur[1]) : "";
    $("#listCount").textContent = showN(tab) ? counts[tab] : "";
    $("#listCount").hidden = !showN(tab);
    $("#listDot").hidden = !Object.keys(fresh).some((k) => k !== tab);
    $("#listBtn").setAttribute("aria-label", T("Список: {l}. Змінити список", { l: (cur ? T(cur[1]) : "") + (showN(tab) ? ", " + counts[tab] : "") }));
    $("#listGrid").innerHTML = TABS.map(([k, label]) =>
      `<button type="button" class="ls-item" data-tab="${k}" aria-current="${k === tab}">`
      + `<span class="ls-n">${showN(k) ? counts[k] : "…"}</span><span class="ls-l">${T(label)}</span>`
      + (fresh[k] ? `<span class="tdot" title="${T("Є нові")}"></span>` : "") + `</button>`).join("");
    // «Відхилені»: who declined
    const dc = { all: 0, aleks: 0, alina: 0, both: 0 };
    for (const f of films) if (kindOK(f) && tabOf(f) === "declined") { dc.all++; dc[declOf(f)]++; }
    const df = $("#declFilter");
    df.hidden = tab !== "declined";
    df.innerHTML = DECL.map(([k, label]) =>
      `<button type="button" data-decl="${k}" aria-pressed="${k === decl}">${k === "aleks" ? NAME.Aleks : k === "alina" ? NAME.Alina : T(label)}<span class="n">${dc[k]}</span></button>`).join("");
    $("#app").classList.toggle("cards-only", CARDS_ONLY.has(tab));
    const watchedAll = films.filter((f) => f.watched).length;
    $("#stats").textContent = loaded ? T("{n} {w} · переглянуто {k}", { n: films.length, w: plural(films.length, ["назва", "назви", "назв"]), k: watchedAll }) : "";
    document.querySelectorAll("#kindFilter [data-kind]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === kind)));
    if (!loaded) return;
    setStatus("");
    if (tab === "recs") { renderRecs(before); return; }

    const q = norm(query);
    let list = films.filter((f) => tabOf(f) === tab && kindOK(f) && (tab !== "declined" || decl === "all" || declOf(f) === decl));
    if (q) list = list.filter((f) => norm(f.name_en).includes(q) || norm(f.name_ua).includes(q));
    const t = (x) => (x ? Date.parse(x) || 0 : 0);
    const grp = (f) => (f[myKey()] ? 2 : f[theirKey()] === "yes" ? 0 : 1); // 0–1: needs your vote, 2: waiting for partner
    list.sort((a, b) => tab === "watched" ? t(b.watched_at) - t(a.watched_at)
      : tab === "proposed" ? grp(a) - grp(b) || t(b.created_at) - t(a.created_at)
      : t(b.created_at) - t(a.created_at));

    const page = list.slice(0, shown);
    visibleIds = page.map((f) => f.id);
    for (const id of [...selected]) if (!visibleIds.includes(id)) selected.delete(id);
    renderBulk();

    const left = list.length - page.length, more = $("#more");
    more.hidden = left <= 0;
    if (left > 0) $("#moreBtn").textContent = T("Показати ще {a} · залишилось {b}", { a: Math.min(PAGE, left), b: left });
    $("#pageInfo").textContent = list.length > PAGE ? T("Показано {a} з {b}", { a: page.length, b: list.length }) : "";

    const empty = $("#empty");
    if (!list.length) {
      const what = kind === "tv" ? "серіалів" : kind === "movie" ? "фільмів" : "";
      const [h, s] = q ? [T("Нічого не знайдено"), T("У цьому списку немає назв, що відповідають пошуку.")]
        : what && films.some((f) => tabOf(f) === tab) ? [T("Тут порожньо"), T("У цьому списку немає {what}. Змініть фільтр «Усі / Фільми / Серіали».", { what: T(what) })]
        : (tab === "declined" && decl !== "all" ? EMPTY_DECL[decl] : EMPTY[tab]).map((x) => T(x));
      empty.innerHTML = `<b>${esc(h)}</b>${esc(s)}`;
      empty.hidden = false; $("#tableWrap").hidden = true; $("#cards").hidden = true;
      if (before && motionOK()) empty.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: EASE });
      return;
    }
    empty.hidden = true; $("#tableWrap").hidden = false; $("#cards").hidden = false;
    $("#tableWrap").classList.toggle("tab-watched", tab === "watched"); // star rows need a little more room
    // section headers in Запропоновані: "waiting for your vote" / "waiting for your partner"
    let rowsH = "", cardsH = "", lastG = null;
    const mineN = list.filter((f) => !f[myKey()]).length, theirsN = list.length - mineN;
    for (const f of page) {
      if (tab === "proposed") {
        const g = f[myKey()] ? "theirs" : "mine";
        if (g !== lastG) {
          const label = g === "mine" ? `${T("Чекає на ваш голос")} · ${mineN}` : `${T(partner() === "Alina" ? "Чекає на Аліну" : "Чекає на Алекса")} · ${theirsN}`;
          rowsH += `<tr class="grp"><td colspan="12">${label}</td></tr>`;
          cardsH += `<div class="grp">${label}</div>`;
          lastG = g;
        }
      }
      rowsH += rowHTML(f); cardsH += cardHTML(f);
    }
    $("#rows").innerHTML = rowsH;
    $("#cards").innerHTML = cardsH;
    play(before);
  }
  // ---------- recommendations ----------
  // Built from TMDB's "recommendations" for titles you rated 7+ (or both said «Так» to), weighted by how
  // much you liked the source. Cached for 12 hours; recomputed when the source titles change.
  let recs = { status: "idle", items: [], sig: "", at: 0 };
  let recHidden = new Set(), hiddenLoaded = false;
  const recKey = (type, id) => type + ":" + id;
  function recSources() {
    const out = [];
    for (const f of films) {
      if (!f.tmdb_id) continue;
      let w = 0;
      if (f.watched) {
        const sc = scoreOf(f);
        w = sc == null ? (f.aleks === "yes" && f.alina === "yes" ? 1 : 0) : sc >= 9 ? 3 : sc >= 7 ? 2 : 0;
      } else if (tabOf(f) === "agreed" || tabOf(f) === "watching") w = 1;
      if (w) out.push({ f, w });
    }
    const when = (f) => String(f.watched_at || f.created_at || "");
    return out.sort((a, b) => b.w - a.w || when(b.f).localeCompare(when(a.f))).slice(0, 14);
  }
  function recItems() {
    const have = new Set(films.filter((f) => f.tmdb_id).map((f) => recKey(f.media_type, f.tmdb_id)));
    return recs.items.filter((r) => !have.has(recKey(r.type, r.id)) && !recHidden.has(recKey(r.type, r.id))
      && (kind === "all" || (kind === "tv" ? r.type === "tv" : r.type === "movie")));
  }
  async function loadHidden() {
    if (hiddenLoaded) return;
    const { data, error } = await sb.from("rec_hidden").select("media_type,tmdb_id");
    if (!error) { recHidden = new Set((data || []).map((r) => recKey(r.media_type, r.tmdb_id))); hiddenLoaded = true; }
  }
  async function ensureRecs(force) {
    if (recs.status === "loading" || !loaded) return;
    const src = recSources();
    const sig = LANG + "|" + src.map((x) => recKey(x.f.media_type, x.f.tmdb_id) + "*" + x.w).sort().join(",");
    if (!force && recs.status === "ready" && recs.sig === sig && Date.now() - recs.at < 12 * 3600e3) return;
    if (!force) {
      try {
        const c = JSON.parse(localStorage.getItem("oc-recs") || "null");
        if (c && c.sig === sig && Date.now() - c.at < 12 * 3600e3) { await loadHidden(); recs = { status: "ready", items: c.items, sig, at: c.at }; render(false); return; }
      } catch (e) {}
    }
    recs = { status: "loading", items: recs.items, sig, at: 0 };
    if (tab === "recs") render(false);
    try {
      await loadHidden();
      const agg = new Map();
      let i = 0;
      const worker = async () => {
        while (i < src.length) {
          const { f, w } = src[i++];
          try {
            const d = await tmdb(`/${f.media_type}/${f.tmdb_id}/recommendations`, { language: isEn() ? "en-US" : "uk-UA", page: "1" });
            for (const r of d.results || []) {
              const type = r.media_type || f.media_type;
              if ((type !== "movie" && type !== "tv") || (r.vote_count || 0) < 30) continue;
              const k = recKey(type, r.id);
              let a = agg.get(k);
              if (!a) {
                a = { id: r.id, type, title: r.title || r.name || "", original: r.original_title || r.original_name || "",
                  year: (r.release_date || r.first_air_date || "").slice(0, 4), poster: r.poster_path || "", overview: r.overview || "",
                  vote: r.vote_average || 0, pop: r.popularity || 0, score: 0, because: [] };
                agg.set(k, a);
              }
              a.score += w * (1 + (r.vote_average || 0) / 10);
              if (a.because.length < 3 && !a.because.includes(titleOf(f))) a.because.push(titleOf(f));
            }
          } catch (e) { /* one failed source shouldn't stop the rest */ }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      const items = [...agg.values()].sort((a, b) => b.score - a.score || b.pop - a.pop).slice(0, 80);
      recs = { status: "ready", items, sig, at: Date.now() };
      try { localStorage.setItem("oc-recs", JSON.stringify({ sig, at: recs.at, items })); } catch (e) {}
    } catch (e) { recs = { status: "error", items: [], sig: "", at: 0 }; }
    render(false);
  }
  function recCardHTML(r) {
    const key = "rec-" + r.type + "-" + r.id, dk = key + ":ua", open = expanded.has(dk);
    const img = r.poster
      ? `<span class="poster"><img src="${esc(IMG + "w185" + r.poster)}" alt="" loading="lazy"></span>`
      : `<span class="poster"><span class="pg" style="--h:${hash(r.title) % 360}"><span class="pg-t">${esc(r.title)}</span></span></span>`;
    const kindB = r.type === "tv" ? `<span class="kind kind-tv">${TV_ICON}${T("Серіал")}</span>` : `<span class="kind kind-movie">${FILM_ICON}${T("Фільм")}</span>`;
    const vote = r.vote ? `<span class="score" title="${T("Оцінка на TMDB")}">TMDB ${dec(r.vote)}</span>` : "";
    const sub = r.original && norm(r.original) !== norm(r.title) ? r.original : "";
    return `<article class="card rec" data-key="${key}">
      <div class="card-poster">${img}</div>
      <div class="card-head">
        <div class="badges">${kindB}${vote}</div>
        <div class="title-ua">${esc(r.title)}</div>
        ${sub ? `<div class="title-en">${esc(sub)}</div>` : ""}
        ${r.year ? `<div class="meta">${esc(r.year)}</div>` : ""}
        <div class="because">${T("Бо вам сподобалось:")} ${r.because.map((b) => (isEn() ? "“" + esc(b) + "”" : "«" + esc(b) + "»")).join(", ")}</div>
      </div>
      ${r.overview ? `<div class="card-desc"><div><div class="desc${open ? " open" : ""}" lang="uk" data-act="desc" data-key="${dk}" role="button" tabindex="0" aria-expanded="${open}">${esc(r.overview)}</div></div></div>` : ""}
      <div class="rec-actions">
        <button type="button" class="btn primary" data-act="rec-add" data-type="${r.type}" data-tid="${r.id}" data-key2="${key}">${T("+ Додати до списку")}</button>
        <button type="button" class="btn" data-act="rec-hide" data-type="${r.type}" data-tid="${r.id}" data-key2="${key}">${T("Не цікаво")}</button>
      </div>
    </article>`;
  }
  function renderRecs(before) {
    const empty = $("#empty"), more = $("#more");
    visibleIds = []; selected.clear(); renderBulk();
    $("#tableWrap").hidden = true;
    const show = (h, t, spin) => {
      empty.innerHTML = `<b>${spin ? '<span class="spin"></span>' : ""}${esc(T(h))}</b>${esc(T(t))}`;
      empty.hidden = false; $("#cards").hidden = true; more.hidden = true;
    };
    if (recs.status !== "ready") {
      if (recs.status === "error") { show("Не вдалося отримати рекомендації", "Перевірте з’єднання і відкрийте вкладку ще раз."); recs.status = "idle"; return; }
      show("Шукаємо рекомендації…", "Дивимось, що схоже на фільми й серіали, які вам сподобались.", true);
      ensureRecs();
      return;
    }
    const q = norm(query);
    let list = recItems();
    if (q) list = list.filter((r) => norm(r.title).includes(q) || norm(r.original).includes(q));
    if (!list.length) {
      if (q) show("Нічого не знайдено", "Серед рекомендацій немає назв, що відповідають пошуку.");
      else if (!recSources().length) show("Поки не з чого рекомендувати", "Оцініть переглянуте на 7+ або погодьте кілька назв — і тут з’являться схожі фільми й серіали.");
      else show("Рекомендацій більше немає", "Ви вже все додали або сховали. Нові з’являться, коли оціните ще щось.");
      return;
    }
    const page = list.slice(0, shown), left = list.length - page.length;
    more.hidden = left <= 0;
    if (left > 0) $("#moreBtn").textContent = T("Показати ще {a} · залишилось {b}", { a: Math.min(PAGE, left), b: left });
    $("#pageInfo").textContent = list.length > PAGE ? T("Показано {a} з {b}", { a: page.length, b: list.length }) : "";
    empty.hidden = true; $("#cards").hidden = false;
    $("#cards").innerHTML = page.map(recCardHTML).join("");
    play(before);
  }
  function resetPage() { shown = PAGE; }

  // ---------- selection & delete (Gmail-style) ----------
  let bulkArmed = false;
  // Selection bar lives at the bottom of the screen and only appears while something is ticked.
  function renderBulk() {
    const n = selected.size, total = visibleIds.length;
    for (const all of [$("#selAll"), $("#selAllHead")]) {
      all.checked = n > 0 && n === total;
      all.indeterminate = n > 0 && n < total;
      all.disabled = total === 0;
    }
    if (!n) bulkArmed = false;
    $("#bulkCount").textContent = T("Вибрано: {n}", { n });
    $("#bulkDelete").textContent = T(bulkArmed ? "Точно видалити?" : "Видалити");
    $("#bulkDelete").classList.toggle("armed", bulkArmed);
    const bar = $("#bulk"), show = n > 0 && !$("#app").hidden;
    document.body.classList.toggle("has-bulk", show);
    if (show && bar.hidden) {
      bar.hidden = false;
      if (motionOK()) bar.animate([{ transform: "translate(-50%, 120%)" }, { transform: "translate(-50%, 0)" }], { duration: 220, easing: EASE });
    } else if (!show && !bar.hidden) {
      if (motionOK()) bar.animate([{ transform: "translate(-50%, 0)" }, { transform: "translate(-50%, 120%)" }], { duration: 160, easing: "ease-in" }).finished.then(() => { if (!selected.size) bar.hidden = true; }, () => {});
      else bar.hidden = true;
    }
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
    ids.forEach((id) => myDeletes.add(id));
    await animateOut(ids);
    films = films.filter((f) => !ids.includes(f.id));
    ids.forEach((id) => selected.delete(id));
    bulkArmed = false;
    render();
    const { error } = await sb.from("films").delete().in("id", ids);
    if (error) { films = films.concat(removed); render(); toast(dbErr(error)); return; }
    const label = removed.length === 1 ? T("Видалено «{t}»", { t: titleOf(removed[0]) }) : T("Видалено {n} {w}", { n: removed.length, w: plural(removed.length, FILMS) });
    toast(label, { label: T("Скасувати"), run: () => restoreFilms(removed) });
  }
  async function restoreFilms(rows) {
    const { data, error } = await sb.from("films").insert(rows.map((r) => ({ ...r }))).select();
    if (error) { toast(dbErr(error)); return; }
    for (const r of data || []) if (!films.some((f) => f.id === r.id)) films.push(r);
    render();
    toast(rows.length === 1 ? T("Відновлено") : T("Відновлено {n} {w}", { n: rows.length, w: plural(rows.length, FILMS) }));
  }
  for (const id of ["#selAll", "#selAllHead"]) $(id).addEventListener("change", (e) => {
    if (e.target.checked) visibleIds.forEach((x) => selected.add(x)); else selected.clear();
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
    if (error) { setStatus(T("Не вдалося завантажити список. Оновіть сторінку."), true); return; }
    films = data || []; loaded = true; render();
  }
  // ---------- partner activity: short toasts while the site is open ----------
  const partner = () => (me === "Alina" ? "Aleks" : "Alina");
  const said = (who, m, f) => (who === "Alina" ? f : m); // Ukrainian past tense agrees with gender
  const myDeletes = new Set();
  const q2 = (t) => (isEn() ? `“${t}”` : `«${t}»`);
  function describe(prev, next) {
    const who = next.updated_by, W = NAME[who] || T("Хтось"), t = q2(titleOf(next));
    for (const col of ["aleks", "alina"]) {
      if ((prev[col] || "") === (next[col] || "")) continue;
      if (!next[col]) return T(said(who, "{w} зняв голос: {t}", "{w} зняла голос: {t}"), { w: W, t });
      if (next.aleks === "yes" && next.alina === "yes" && !next.watched) return T("Збіг! {t} → «Погоджені»", { t });
      return T(said(who, "{w} проголосував «{v}»: {t}", "{w} проголосувала «{v}»: {t}"), { w: W, t, v: T(next[col] === "yes" ? "Так" : "Ні") });
    }
    if (!prev.watched && next.watched) return T(said(who, "{w} позначив {t} переглянутим", "{w} позначила {t} переглянутим"), { w: W, t });
    for (const col of ["aleks_rating", "alina_rating"]) {
      if ((prev[col] || null) === (next[col] || null) || !next[col]) continue;
      const forOther = col !== String(who || "").toLowerCase() + "_rating" ? " " + T(col === "aleks_rating" ? "(за Алекса)" : "(за Аліну)") : "";
      return T(said(who, "{w} оцінив {t} на {r}/10", "{w} оцінила {t} на {r}/10"), { w: W, t, r: next[col] }) + forOther;
    }
    if (prev.next_s == null && next.next_s != null) return T(said(who, "{w} почав відстежувати {t}", "{w} почала відстежувати {t}"), { w: W, t });
    if (next.next_s != null && (prev.next_s !== next.next_s || prev.next_e !== next.next_e)) return T("{t}: далі сезон {s}, серія {e}", { t, s: next.next_s, e: next.next_e });
    return "";
  }
  let actQueue = [], actTimer = null;
  function notifyAct(msg) {
    actQueue.push(msg);
    clearTimeout(actTimer);
    actTimer = setTimeout(() => {
      const q = actQueue; actQueue = [];
      toast(q.length === 1 ? q[0] : T("{last} (і ще {n} {w})", { last: q[q.length - 1], n: q.length - 1, w: plural(q.length - 1, ["зміна", "зміни", "змін"]) }));
    }, 700);
  }

  function subscribe() {
    sb.channel("films-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "films" }, (p) => {
        if (p.eventType === "DELETE") {
          const id = p.old && p.old.id, prev = films.find((f) => f.id === id);
          films = films.filter((f) => f.id !== id);
          if (prev && !myDeletes.has(id)) notifyAct(T(said(partner(), "{w} видалив {t}", "{w} видалила {t}"), { w: NAME[partner()], t: q2(titleOf(prev)) }));
        } else if (p.new) {
          const i = films.findIndex((f) => f.id === p.new.id), prev = i >= 0 ? films[i] : null;
          if (i >= 0) films[i] = p.new; else films.unshift(p.new);
          if (p.new.updated_by && p.new.updated_by !== me) {
            const msg = prev ? describe(prev, p.new)
              : p.eventType === "INSERT" ? T(said(p.new.updated_by, "{w} додав {t}", "{w} додала {t}"), { w: NAME[p.new.updated_by] || T("Хтось"), t: q2(titleOf(p.new)) }) : "";
            if (msg) notifyAct(msg);
          }
        }
        scheduleRender();
      })
      .subscribe();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && started) loadFilms().then(refreshMeta);
      if (document.visibilityState === "hidden") markSeen();
    });
    window.addEventListener("pagehide", markSeen);
  }
  // Remember when you last had the site open; your partner's additions after that get a "Нове" badge next time.
  function markSeen() { if (me) try { localStorage.setItem("oc-seen-" + me, String(Date.now())); } catch (e) {} }
  let renderTimer = null;
  function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(() => render(), 120); }

  // ---------- keep "where to watch" and series data fresh ----------
  // A few TMDB lookups in the background after the list loads: series daily, films every 4 days.
  let refreshing = false;
  async function refreshMeta() {
    if (refreshing || !loaded) return;
    refreshing = true;
    try {
      const now = Date.now(), DAY = 864e5;
      const age = (f) => (f.meta_at ? now - Date.parse(f.meta_at) : Infinity);
      const due = films.filter((f) => f.tmdb_id && !(f.watched && f.media_type === "movie")
        && age(f) > (f.media_type === "tv" ? 1 : 4) * DAY).sort((a, b) => age(b) - age(a)).slice(0, 60);
      let i = 0, stop = false;
      const worker = async () => {
        while (i < due.length && !stop && document.visibilityState !== "hidden") {
          const f = due[i++];
          try {
            const d = await tmdb(`/${f.media_type}/${f.tmdb_id}`, { language: "en-US", append_to_response: "watch/providers" });
            const m = metaFrom(f.media_type, d);
            if (f.media_type === "tv" && f.watched && f.seen_s == null) m.seen_s = (m.tv_info.last && m.tv_info.last.s) || null;
            const { data } = await sb.from("films").update(m).eq("id", f.id).select().maybeSingle();
            const j = data ? films.findIndex((x) => x.id === f.id) : -1;
            if (j >= 0) { films[j] = data; scheduleRender(); }
          } catch (e) { if (e.kind === "auth" || e.kind === "nokey") stop = true; }
        }
      };
      await Promise.all([worker(), worker()]);
    } finally { refreshing = false; }
  }
  async function patchFilm(id, patch) {
    const i = films.findIndex((f) => f.id === id);
    const prev = i >= 0 ? films[i] : null;
    if (prev) {
      const next = { ...prev, ...patch };
      if (tabOf(prev) === tab && tabOf(next) !== tab) await animateOut([id]);
      const k = films.findIndex((f) => f.id === id);
      if (k >= 0) films[k] = next;
      render();
    }
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
        const sub = [r.year, r.original && r.original !== r.title ? r.original : ""].filter(Boolean).join(" · ");
        const kind = r.type === "tv" ? `<span class="kind kind-tv">${TV_ICON}${T("Серіал")}</span>` : `<span class="kind kind-movie">${FILM_ICON}${T("Фільм")}</span>`;
        return `<li role="option" data-i="${i}" aria-selected="${i === active}">${img}<div style="min-width:0"><div class="s-t">${esc(r.title)}</div><div class="s-m">${kind}<span>${esc(sub)}</span></div></div></li>`;
      }).join("");
      list.hidden = false; input.setAttribute("aria-expanded", "true");
    };
    const run = debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) { items = []; close(); return; }
      const my = ++seq;
      try { const res = await searchTitles(q); if (my !== seq) return; items = res; active = -1; paint(res.length ? "" : T("На TMDB нічого не знайдено")); }
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

  async function addFromResult(r, opts = {}) {
    showAddMsg("");
    const dup = films.find((f) => f.tmdb_id === r.id && f.media_type === r.type);
    if (dup) { showAddMsg(T("«{t}» уже є в списку (вкладка «{tab}»).", { t: titleOf(dup), tab: T(TABS.find((t) => t[0] === tabOf(dup))[1]) })); return; }
    addBtn.disabled = true; addBtn.classList.add("busy");
    try {
      const d = await fetchDetails(r.type, r.id);
      const row = await insertFilm(d);
      if (row && opts.stay) toast(T("Додано «{t}» до «Запропонованих»", { t: titleOf(row) }), { label: T("Відкрити"), run: () => selectTab("proposed") });
      else if (row) { addInput.value = ""; addSuggest.clear(); if (tab !== "proposed") selectTab("proposed"); toast(T("Додано «{t}»", { t: titleOf(row) })); }
      return !!row;
    } catch (e) { if (opts.stay) toast(tmdbMsg(e)); else showAddMsg(tmdbMsg(e)); return false; }
    finally { addBtn.disabled = false; addBtn.classList.remove("busy"); }
  }
  $("#addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = addInput.value.trim();
    if (!q) { showAddMsg(T("Спершу введіть назву.")); return; }
    addBtn.disabled = true;
    try {
      const res = await searchTitles(q);
      addSuggest.close();
      const exact = res.filter((r) => norm(r.title) === norm(q) || norm(r.original) === norm(q));
      const best = exact.find((r) => r.type === "movie") || exact[0] || res[0];
      if (best) await addFromResult(best);
      else showAddMsg(T("На TMDB немає збігів для «{q}». Перевірте написання або спробуйте іншою мовою.", { q }));
    } catch (err) { showAddMsg(tmdbMsg(err)); }
    finally { addBtn.disabled = false; }
  });

  // ---------- interactions ----------
  function selectTab(k) {
    k = tabFromKey(k) || k;
    if (k !== tab) { selected.clear(); bulkArmed = false; resetPage(); }
    tab = k;
    if (!$("#listSheet").hidden) closeOverlay("#listSheet");
    try { localStorage.setItem("oc-tab", k); } catch (e) {}
    try { history.replaceState(null, "", "#" + k); } catch (e) {}
    render();
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) selectTab(b.dataset.tab); });
  $("#listBtn").addEventListener("click", () => openOverlay("#listSheet"));
  $("#listGrid").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) selectTab(b.dataset.tab); });
  $("#listClose").addEventListener("click", () => closeOverlay("#listSheet"));
  $("#listSheet").addEventListener("click", (e) => { if (e.target.id === "listSheet") closeOverlay("#listSheet"); });
  $("#declFilter").addEventListener("click", (e) => {
    const b = e.target.closest("[data-decl]"); if (!b || b.dataset.decl === decl) return;
    decl = b.dataset.decl;
    try { localStorage.setItem("oc-decl", decl); } catch (err) {}
    selected.clear(); bulkArmed = false; resetPage(); render();
  });
  $("#search").addEventListener("input", (e) => { query = e.target.value; resetPage(); render(); });
  $("#kindFilter").addEventListener("click", (e) => {
    const b = e.target.closest("[data-kind]"); if (!b || b.dataset.kind === kind) return;
    kind = b.dataset.kind;
    try { localStorage.setItem("oc-kind", kind); } catch (err) {}
    selected.clear(); bulkArmed = false; resetPage(); render();
  });
  $("#moreBtn").addEventListener("click", () => {
    const firstNew = shown;
    shown += PAGE; render();
    // move keyboard focus to the first newly shown item for screen-reader and keyboard users
    const el = document.querySelectorAll(window.innerWidth > 900 ? "#rows tr[data-key]" : "#cards .card")[firstNew];
    const target = el && el.querySelector("input.sel");
    if (target) target.focus({ preventScroll: true });
  });

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.tagName === "INPUT") return;
    const act = el.dataset.act, id = el.dataset.id;
    if (act === "desc") { const k = el.dataset.key; expanded.has(k) ? expanded.delete(k) : expanded.add(k); render(); }
    else if (act === "vote") {
      const f = films.find((x) => x.id === id); if (!f) return;
      const who = el.dataset.who;
      if (who !== myKey()) return;
      const val = f[who] === el.dataset.val ? "" : el.dataset.val;
      patchFilm(id, { [who]: val }).then((ok) => {
        if (ok && val === "yes" && f[theirKey()] === "yes" && !f.watched)
          toast(T("Збіг! {t} → «Погоджені»", { t: q2(titleOf(f)) }), { label: T("Відкрити"), run: () => selectTab("agreed") });
      });
      // small press feedback on the re-rendered switch (only if the film stays in this list)
      if (motionOK()) requestAnimationFrame(() => document.querySelectorAll(`[data-act="vote"][data-id="${id}"][data-who="${who}"].on`)
        .forEach((b) => b.animate([{ transform: "scale(.92)" }, { transform: "none" }], { duration: 180, easing: EASE })));
    }
    else if (act === "rate") {
      const f = films.find((x) => x.id === id); if (!f) return;
      const col = el.dataset.who + "_rating", val = Number(el.dataset.val);
      patchFilm(id, { [col]: f[col] === val ? null : val }); // tapping the current star again clears it
      if (motionOK()) requestAnimationFrame(() => document.querySelectorAll(`[data-act="rate"][data-id="${id}"][data-who="${el.dataset.who}"][data-val="${val}"]`)
        .forEach((b) => b.animate([{ transform: "scale(.8)" }, { transform: "scale(1.15)" }, { transform: "none" }], { duration: 220, easing: EASE })));
    }
    else if (act === "start" || act === "newseason") {
      const f = films.find((x) => x.id === id); if (!f) return;
      const patch = act === "start" ? { next_s: 1, next_e: 1 } : { watched: false, watched_at: null, next_s: (f.seen_s || 0) + 1, next_e: 1 };
      patchFilm(id, patch).then((ok) => { if (ok && tab !== "watching") toast(T("«{t}» тепер у «Дивимось»", { t: titleOf(f) }), { label: T("Відкрити"), run: () => selectTab("watching") }); });
    }
    else if (act === "ep-done") {
      const f = films.find((x) => x.id === id); if (!f) return;
      patchFilm(id, nextEp(f));
      if (motionOK()) requestAnimationFrame(() => document.querySelectorAll(`.card[data-key="${id}"] .prog-bar span`)
        .forEach((b) => b.animate([{ filter: "brightness(1.6)" }, { filter: "none" }], { duration: 400, easing: "ease-out" })));
    }
    else if (act === "finish") { const f = films.find((x) => x.id === id); if (f) patchFilm(id, watchedPatch(f, true)); }
    else if (act === "stop") patchFilm(id, { next_s: null, next_e: null });
    else if (act === "rec-add") {
      if (el.disabled) return;
      el.disabled = true; el.classList.add("busy");
      const key = el.dataset.key2;
      addFromResult({ id: Number(el.dataset.tid), type: el.dataset.type }, { stay: true })
        .then(async (ok) => { if (ok) { await animateOut([key]); render(); } else { el.disabled = false; el.classList.remove("busy"); } });
    }
    else if (act === "rec-hide") {
      const type = el.dataset.type, tid = Number(el.dataset.tid), k = recKey(type, tid);
      animateOut([el.dataset.key2]).then(() => { recHidden.add(k); render(); });
      sb.from("rec_hidden").insert({ media_type: type, tmdb_id: tid }).then(({ error }) => {
        if (error && error.code !== "23505") { recHidden.delete(k); render(); toast(dbErr(error)); return; }
        toast(T("Сховано з рекомендацій"), { label: T("Скасувати"), run: async () => {
          await sb.from("rec_hidden").delete().eq("media_type", type).eq("tmdb_id", tid);
          recHidden.delete(k); render();
        } });
      });
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
    if (el.dataset && el.dataset.act === "watched") {
      const f = films.find((x) => x.id === el.dataset.id); if (!f) return;
      patchFilm(f.id, watchedPatch(f, el.checked));
    }
    if (el.dataset && (el.dataset.act === "prog-s" || el.dataset.act === "prog-e")) {
      const v = Number(el.value);
      patchFilm(el.dataset.id, el.dataset.act === "prog-s" ? { next_s: v, next_e: 1 } : { next_e: v });
    }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches('[data-act="desc"]')) { e.preventDefault(); e.target.click(); }
    if (e.key === "Escape") { if (!$("#listSheet").hidden) closeOverlay("#listSheet"); else if (!$("#player").hidden) closePlayer(); else if (!$("#picker").hidden) closeOverlay("#picker"); else if (!$("#statsView").hidden) closeOverlay("#statsView"); else if (!$("#editor").hidden) closeEditor(); else if (selected.size) { selected.clear(); bulkArmed = false; render(); } }
  });

  function openOverlay(sel) {
    const o = $(sel); o.hidden = false; document.body.style.overflow = "hidden";
    if (motionOK()) {
      o.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
      const box = o.firstElementChild;
      if (box) box.animate([{ opacity: 0, transform: "translateY(12px) scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 200, easing: EASE });
    }
  }
  function closeOverlay(sel) {
    const o = $(sel);
    const done = () => { o.hidden = true; if ([...document.querySelectorAll(".overlay")].every((x) => x.hidden)) document.body.style.overflow = ""; };
    if (!motionOK() || o.hidden) { done(); return; }
    o.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "ease-in" }).finished.then(done, done);
  }

  // ---------- random pick from Погоджені (follows the Усі / Фільми / Серіали filter) ----------
  let pickLast = null;
  const pickPool = () => films.filter((f) => tabOf(f) === "agreed" && kindOK(f));
  function pickCardHTML(f) {
    const src = posterSrc(f.poster_path, "w342");
    const tr = trailersHTML(f), second = otherTitle(f);
    return `<div class="pick-card">
      <div class="pick-poster">${src ? `<img src="${esc(src)}" alt="">` : `<span class="pg" style="--h:${hash(titleOf(f)) % 360}"><span class="pg-t">${esc(titleOf(f))}</span></span>`}</div>
      <div class="pick-info">
        <div class="badges">${kindHTML(f)}</div>
        <div class="pick-title">${esc(titleOf(f))}</div>
        ${second ? `<div class="pick-en">${esc(second)}</div>` : ""}
        ${metaHTML(f)}${provHTML(f)}
        ${f.desc_ua || f.desc_en ? `<p class="pick-desc">${esc((isEn() ? f.desc_en || f.desc_ua : f.desc_ua || f.desc_en))}</p>` : ""}
        ${tr ? `<div class="pick-trailers">${tr}</div>` : ""}
      </div>
    </div>`;
  }
  let pickSeq = 0;
  function rollPick() {
    const pool = pickPool(), what = kind === "tv" ? "серіалів" : kind === "movie" ? "фільмів" : "назв";
    $("#pickSub").textContent = pool.length ? T("Випадково з {n} {w}", { n: pool.length, w: plural(pool.length, kind === "tv" ? ["погодженого серіалу", "погоджених серіалів", "погоджених серіалів"] : kind === "movie" ? ["погодженого фільму", "погоджених фільмів", "погоджених фільмів"] : ["погодженої назви", "погоджених назв", "погоджених назв"]) }) : "";
    $("#pickAgain").hidden = pool.length < 2;
    if (!pool.length) {
      $("#pickBody").innerHTML = `<div class="pick-empty"><b>${T("У «Погоджених» немає {what}", { what: T(what) })}</b>${T("Проголосуйте обоє «Так» за кілька назв — і тут буде з чого вибрати.")}</div>`;
      return;
    }
    const others = pool.length > 1 ? pool.filter((f) => !pickLast || f.id !== pickLast) : pool;
    const f = others[Math.floor(Math.random() * others.length)];
    pickLast = f.id;
    const body = $("#pickBody"), my = ++pickSeq;
    if (!motionOK() || pool.length < 2) { body.innerHTML = pickCardHTML(f); return; }
    // a quick shuffle through a few titles before landing on the pick
    let n = 0;
    const spin = () => {
      if (my !== pickSeq) return;
      if (n++ < 7) {
        const x = pool[Math.floor(Math.random() * pool.length)];
        body.innerHTML = `<div class="pick-spin"><span>${esc(titleOf(x))}</span></div>`;
        setTimeout(spin, 55 + n * 12);
      } else {
        body.innerHTML = pickCardHTML(f);
        const card = body.firstElementChild;
        if (card) card.animate([{ opacity: 0, transform: "scale(.97)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: EASE });
      }
    };
    spin();
  }
  $("#pickBtn").addEventListener("click", () => { pickLast = null; openOverlay("#picker"); rollPick(); });
  $("#pickAgain").addEventListener("click", rollPick);
  $("#pickClose").addEventListener("click", () => closeOverlay("#picker"));
  $("#picker").addEventListener("click", (e) => { if (e.target.id === "picker") closeOverlay("#picker"); });

  // ---------- stats ----------
  const fmt1 = dec;
  const monthName = (y, m) => new Date(y, m, 15).toLocaleDateString(LOCALE(), { month: "short" }).replace(".", "");
  function episodesSeen(f) { // rough count of episodes watched, for the hours estimate
    const seasons = (f.tv_info && f.tv_info.seasons) || [], la = f.tv_info && f.tv_info.last;
    const airedEps = (upTo) => seasons.filter((x) => x.s <= upTo).reduce((n, x) => n + (la && x.s === la.s ? la.e : x.e), 0);
    if (f.watched) return airedEps(f.seen_s || (la && la.s) || 0);
    if (f.next_s != null) { const p = progOf(f); return airedEps(p.s - 1) + (p.e - 1); }
    return 0;
  }
  function statsHTML() {
    const watched = films.filter((f) => f.watched), year = new Date().getFullYear();
    const wMovies = watched.filter((f) => f.media_type !== "tv").length, wTv = watched.length - wMovies;
    const thisYear = watched.filter((f) => f.watched_at && new Date(f.watched_at).getFullYear() === year).length;
    let minutes = 0;
    for (const f of films) {
      if (!f.runtime) continue;
      if (f.media_type === "tv") minutes += f.runtime * episodesSeen(f);
      else if (f.watched) minutes += f.runtime;
    }
    const waiting = films.filter((f) => !f.watched && ["proposed", "agreed", "watching"].includes(tabOf(f))).length;
    const tile = (n, label, sub) => `<div class="st-tile"><div class="st-n">${n}</div><div class="st-l">${label}</div>${sub ? `<div class="st-s">${sub}</div>` : ""}</div>`;
    let h = `<div class="st-tiles">
      ${tile(watched.length, T("Переглянуто"), `${wMovies} ${plural(wMovies, FILMS)} · ${wTv} ${plural(wTv, ["серіал", "серіали", "серіалів"])}`)}
      ${tile(thisYear, T("Цього року"), T("у {y}", { y: year }))}
      ${tile("≈ " + Math.round(minutes / 60), T("Годин перед екраном"), T("фільми й переглянуті серії"))}
      ${tile(waiting, T("Чекають перегляду"), T("усього у списку {n}", { n: films.length }))}
    </div>`;

    // ratings
    const rated = watched.filter((f) => f.aleks_rating || f.alina_rating);
    const avg = (col) => { const v = watched.map((f) => f[col]).filter(Boolean); return v.length ? { a: v.reduce((x, y) => x + y, 0) / v.length, n: v.length } : null; };
    const ra = avg("aleks_rating"), rb = avg("alina_rating");
    const both = watched.filter((f) => f.aleks_rating && f.alina_rating);
    if (rated.length) {
      const close = both.filter((f) => Math.abs(f.aleks_rating - f.alina_rating) <= 1).length;
      const diff = both.length ? both.reduce((n, f) => n + Math.abs(f.aleks_rating - f.alina_rating), 0) / both.length : 0;
      h += `<h3>${T("Оцінки")}</h3><div class="st-tiles">
        ${tile(ra ? fmt1(ra.a) : "—", T("Середня в Алекса"), ra ? `${ra.n} ${plural(ra.n, ["оцінка", "оцінки", "оцінок"])}` : T("ще не оцінював"))}
        ${tile(rb ? fmt1(rb.a) : "—", T("Середня в Аліни"), rb ? `${rb.n} ${plural(rb.n, ["оцінка", "оцінки", "оцінок"])}` : T("ще не оцінювала"))}
        ${both.length ? tile(Math.round((close / both.length) * 100) + "%", T("Збіг смаків"), T("оцінки різняться не більше ніж на 1 · середня різниця {d}", { d: fmt1(diff) })) : ""}
      </div>`;
      const best = rated.map((f) => ({ f, s: scoreOf(f) })).filter((x) => x.s >= 7).sort((a, b) => b.s - a.s).slice(0, 5);
      h += `<div class="st-cols"><div><h4>${T("Найкраще оцінене")}</h4>${best.length ? `<ol class="st-list">${best.map(({ f, s: sc }) =>
        `<li><span class="st-t">${esc(titleOf(f))}</span><span class="st-v">${STAR}${fmt1(sc)}</span></li>`).join("")}</ol>` : `<p class="st-none">${T("Поки нічого не отримало 7 і вище.")}</p>`}</div>`;
      const fights = both.map((f) => ({ f, d: Math.abs(f.aleks_rating - f.alina_rating) })).filter((x) => x.d >= 2).sort((a, b) => b.d - a.d).slice(0, 5);
      h += `<div><h4>${T("Найбільше розійшлися")}</h4>${fights.length ? `<ol class="st-list">${fights.map(({ f }) =>
        `<li><span class="st-t">${esc(titleOf(f))}</span><span class="st-v st-pair">${NAME.Aleks} <b>${f.aleks_rating}</b> · ${NAME.Alina} <b>${f.alina_rating}</b></span></li>`).join("")}</ol>`
        : `<p class="st-none">${T("Поки ви ні разу не розійшлися більше ніж на 1 бал.")}</p>`}</div></div>`;
    }

    // genres among watched titles
    const g = new Map();
    for (const f of watched) for (const x of (f.genres || []).map(genreShow)) g.set(x, (g.get(x) || 0) + 1);
    const top = [...g.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (top.length) {
      const max = top[0][1];
      h += `<h3>${T("Улюблені жанри")}</h3><div class="st-bars" role="list">${top.map(([name, n]) =>
        `<div class="st-bar" role="listitem" title="${esc(name)}: ${n}"><span class="st-bl">${esc(name)}</span><span class="st-track"><span style="width:${Math.max(4, (n / max) * 100)}%"></span></span><span class="st-bn">${n}</span></div>`).join("")}</div>`;
    }

    // watched per month, last 12 months
    const now = new Date(), months = [];
    for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ y: d.getFullYear(), m: d.getMonth(), n: 0 }); }
    for (const f of watched) {
      if (!f.watched_at) continue;
      const d = new Date(f.watched_at), b = months.find((x) => x.y === d.getFullYear() && x.m === d.getMonth());
      if (b) b.n++;
    }
    const mMax = Math.max(1, ...months.map((x) => x.n));
    if (months.some((x) => x.n)) {
      h += `<h3>${T("Переглянуто по місяцях")}</h3><div class="st-months" role="list">${months.map((x) =>
        `<div class="st-m" role="listitem" title="${monthName(x.y, x.m)} ${x.y}: ${x.n}" aria-label="${monthName(x.y, x.m)} ${x.y}: ${x.n}"><span class="st-mv">${x.n || ""}</span><span class="st-mb"><span style="height:${x.n ? Math.max(6, (x.n / mMax) * 100) : 0}%"></span></span><span class="st-ml">${monthName(x.y, x.m)}</span></div>`).join("")}</div>`;
    }

    // votes and who suggests more
    const votes = (col) => { const v = films.map((f) => f[col]).filter((x) => x === "yes" || x === "no"); return v.length ? { yes: v.filter((x) => x === "yes").length, n: v.length } : null; };
    const va = votes("aleks"), vb = votes("alina");
    const added = (who) => films.filter((f) => f.created_by === who).length;
    h += `<h3>${T("Голоси і пропозиції")}</h3><div class="st-tiles">
      ${tile(va ? Math.round((va.yes / va.n) * 100) + "%" : "—", T("Алекс каже «Так»"), va ? T("з {n} {w}", { n: va.n, w: plural(va.n, ["голосу", "голосів", "голосів"]) }) : "")}
      ${tile(vb ? Math.round((vb.yes / vb.n) * 100) + "%" : "—", T("Аліна каже «Так»"), vb ? T("з {n} {w}", { n: vb.n, w: plural(vb.n, ["голосу", "голосів", "голосів"]) }) : "")}
      ${tile(added("Aleks"), T("Додав Алекс"), T("назв у списку"))}
      ${tile(added("Alina"), T("Додала Аліна"), T("назв у списку"))}
    </div>`;
    return h;
  }
  $("#statsBtn").addEventListener("click", () => { setMenu(false); $("#statsBody").innerHTML = statsHTML(); openOverlay("#statsView"); });
  $("#statsClose").addEventListener("click", () => closeOverlay("#statsView"));
  $("#statsView").addEventListener("click", (e) => { if (e.target.id === "statsView") closeOverlay("#statsView"); });

  // ---------- trailer player ----------
  function openPlayer(f, which) {
    const url = which === "en" ? f.trailer_en : f.trailer_ua;
    const id = ytId(url);
    if (!id) { if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener"); return; }
    $("#playerTitle").textContent = titleOf(f);
    $("#playerSub").textContent = T(which === "en" ? "Англійський трейлер" : "Український трейлер") + (f.year ? " · " + f.year : "");
    // Android: an intent link opens the YouTube app, falling back to the web page if the app isn't installed.
    // iPhone: the normal https link opens the app through universal links.
    const web = "https://www.youtube.com/watch?v=" + id;
    const yt = $("#playerYt");
    if (/Android/i.test(navigator.userAgent)) {
      yt.href = `intent://www.youtube.com/watch?v=${id}#Intent;scheme=https;package=com.google.android.youtube;S.browser_fallback_url=${encodeURIComponent(web)};end`;
      yt.removeAttribute("target");
    } else { yt.href = web; yt.target = "_blank"; }
    $("#playerFrame").style.backgroundImage = `url("https://i.ytimg.com/vi/${id}/hqdefault.jpg")`;
    $("#playerFrame").innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="${T("Трейлер")}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    openOverlay("#player");
  }
  function closePlayer() { $("#playerFrame").innerHTML = ""; $("#playerFrame").style.backgroundImage = ""; closeOverlay("#player"); }
  $("#playerClose").addEventListener("click", closePlayer);
  $("#playerYt").addEventListener("click", () => setTimeout(closePlayer, 300)); // stop the embedded copy once YouTube opens
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
    $("#edGenres").value = Array.isArray(d.genres) ? d.genres.map(genreShow).join(", ") : "";
    $("#edDescEn").value = d.desc_en || ""; $("#edDescUa").value = d.desc_ua || "";
    $("#edTrEn").value = d.trailer_en || ""; $("#edTrUa").value = d.trailer_ua || "";
    $("#edPoster").value = d.poster_path || "";
    edPreview();
  }
  const edSuggest = makeSuggest($("#edMatch"), $("#edSuggest"), async (r) => {
    edMsg.classList.remove("ok"); edMsg.textContent = T("Завантажуємо з TMDB…");
    try {
      const d = await fetchDetails(r.type, r.id);
      const dup = films.find((f) => f.id !== edId && f.tmdb_id === d.tmdb_id && f.media_type === d.media_type);
      if (dup) { edMsg.textContent = T("«{t}» уже є в списку.", { t: titleOf(dup) }); return; }
      edMatch = d; fillForm(d); $("#edMatch").value = "";
      edMsg.classList.add("ok"); edMsg.textContent = T("Заповнено з TMDB. Натисніть «Зберегти», щоб залишити.");
    } catch (e) { edMsg.textContent = tmdbMsg(e); }
  });
  function openEditor(id) {
    const f = films.find((x) => x.id === id); if (!f) return;
    edId = id; edMatch = null; delArmed = false;
    $("#edDelete").textContent = T("Видалити");
    $("#edTitle").textContent = T("Редагування · {t}", { t: titleOf(f) });
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
    for (const u of [trEn, trUa]) if (u && !/^https?:\/\//i.test(u)) { edMsg.textContent = T("Трейлер має бути повним посиланням, що починається з https://"); return; }
    const patch = {
      name_en: $("#edEn").value.trim(), name_ua: $("#edUa").value.trim(),
      year: num($("#edYear").value), runtime: num($("#edRuntime").value),
      genres: $("#edGenres").value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5),
      desc_en: $("#edDescEn").value.trim(), desc_ua: $("#edDescUa").value.trim(),
      trailer_en: trEn, trailer_ua: trUa,
      poster_path: $("#edPoster").value.trim(),
    };
    if (!patch.name_en && !patch.name_ua) { edMsg.textContent = T("Вкажіть хоча б одну назву."); return; }
    if (edMatch) { patch.tmdb_id = edMatch.tmdb_id; patch.media_type = edMatch.media_type; patch.match_state = "done"; }
    const id = edId; closeEditor();
    if (await patchFilm(id, patch)) toast(T("Збережено"));
  });
  $("#edDelete").addEventListener("click", async () => {
    const id = edId; closeEditor();
    deleteFilms([id]);
  });

  $("#logoutBtn").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });

  // ---------- account menu ----------
  const acctBtn = $("#acctBtn"), acctMenu = $("#acctMenu");
  function setMenu(open) {
    if (open === !acctMenu.hidden) return;
    acctBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      acctMenu.hidden = false;
      if (motionOK()) acctMenu.animate([{ opacity: 0, transform: "translateY(-4px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 150, easing: EASE });
      acctMenu.querySelector("[role=menuitem]").focus({ preventScroll: true });
    } else acctMenu.hidden = true;
  }
  acctBtn.addEventListener("click", (e) => { e.stopPropagation(); setMenu(acctMenu.hidden); });
  document.addEventListener("click", (e) => { if (!acctMenu.hidden && !e.target.closest(".acct")) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !acctMenu.hidden) { setMenu(false); acctBtn.focus(); } });

  // ---------- search: an icon on phones that opens into a field ----------
  const tools = $("#tools"), searchInput = $("#search");
  function setSearch(open) {
    tools.classList.toggle("searching", open);
    $("#searchOpen").setAttribute("aria-expanded", String(open));
    if (open) { searchInput.focus(); if (motionOK()) searchInput.animate([{ opacity: 0, transform: "scaleX(.96)" }, { opacity: 1, transform: "none" }], { duration: 160, easing: EASE }); }
    else if (searchInput.value) { searchInput.value = ""; query = ""; resetPage(); render(); }
  }
  $("#searchOpen").addEventListener("click", () => setSearch(true));
  $("#searchClose").addEventListener("click", () => setSearch(false));
  searchInput.addEventListener("keydown", (e) => { if (e.key === "Escape") setSearch(false); });

  // ---------- installable app + phone notifications ----------
  const swReady = "serviceWorker" in navigator
    ? navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).catch(() => null)
    : Promise.resolve(null);
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.type === "open-tab" && tabFromKey(e.data.tab)) selectTab(e.data.tab);
  });
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("#installBtn").hidden = false; });
  window.addEventListener("appinstalled", () => { installEvt = null; $("#installBtn").hidden = true; toast(T("Застосунок встановлено")); });
  $("#installBtn").addEventListener("click", async () => {
    setMenu(false);
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch (e) {}
    installEvt = null; $("#installBtn").hidden = true;
  });

  const pushOK = () => "PushManager" in window && "Notification" in window && "serviceWorker" in navigator && !!CFG.vapidPublicKey;
  const b64u = (str) => { const s = (str + "===".slice((str.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
  async function currentSub() { const reg = await swReady; return reg ? reg.pushManager.getSubscription() : null; }
  async function saveSub(sub) {
    const j = sub.toJSON();
    const { error } = await sb.from("push_subs").upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, lang: LANG });
    return !error;
  }
  async function paintPush() {
    const b = $("#pushBtn");
    if (!pushOK()) { b.hidden = true; return; }
    b.hidden = false;
    const on = Notification.permission === "granted" && !!(await currentSub());
    b.textContent = T(on ? "Сповіщення на телефоні: увімкнено ✓" : Notification.permission === "denied" ? "Сповіщення заблоковані в браузері" : "Увімкнути сповіщення на телефоні");
    b.dataset.on = on ? "1" : "";
  }
  async function enablePush() {
    if (!pushOK()) return;
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { toast(T("Сповіщення не дозволено. Їх можна ввімкнути в налаштуваннях сайту в браузері.")); paintPush(); return; }
    try {
      const reg = await swReady;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(CFG.vapidPublicKey) });
      toast(await saveSub(sub) ? T("Готово: сповіщення про зміни від {who} приходитимуть на цей пристрій", { who: T(partner() === "Alina" ? "Аліни" : "Алекса") }) : T("Не вдалося зберегти підписку. Спробуйте ще раз."));
    } catch (e) { toast(T("Цей браузер не дав підписатися на сповіщення.")); }
    paintPush();
  }
  async function disablePush() {
    const sub = await currentSub();
    if (sub) { await sb.from("push_subs").delete().eq("endpoint", sub.endpoint); try { await sub.unsubscribe(); } catch (e) {} }
    toast(T("Сповіщення на цьому пристрої вимкнено"));
    paintPush();
  }
  $("#pushBtn").addEventListener("click", () => { setMenu(false); ($("#pushBtn").dataset.on ? disablePush : enablePush)(); });
  // On each visit: keep the saved subscription current, and offer notifications once per device.
  async function initPush() {
    if (!pushOK()) return;
    await paintPush();
    if (Notification.permission === "granted") { const sub = await currentSub(); if (sub) saveSub(sub); return; }
    let asked = false; try { asked = !!localStorage.getItem("oc-push-asked"); } catch (e) {}
    if (Notification.permission === "default" && !asked) {
      try { localStorage.setItem("oc-push-asked", "1"); } catch (e) {}
      setTimeout(() => toast(T("Сповіщати на цьому пристрої, коли {who} щось додає, голосує чи оцінює?", { who: NAME[partner()] }), { label: T("Увімкнути"), run: enablePush }), 2500);
    }
  }

  // ---------- language picker ----------
  function setVoteHeaders() {
    if (!me) return;
    const [h1, h2] = document.querySelectorAll("thead .c-vote");
    h1.className = `c-vote th-${myKey()}`; h1.textContent = T("Ви · {name}", { name: NAME[me] });
    h2.className = `c-vote th-${theirKey()}`; h2.textContent = NAME[partner()];
  }
  function setLang(l, opts = {}) {
    if (l !== "uk" && l !== "en") return;
    const changed = l !== LANG;
    LANG = l;
    try { localStorage.setItem("oc-lang", l); } catch (e) {}
    setNames(); applyStatic();
    if (!changed) return;
    // text the app draws itself
    if (me) { $("#whoName").textContent = T("Ви увійшли як {name}", { name: NAME[me] }); setVoteHeaders(); }
    document.querySelectorAll(".pwtoggle").forEach((b) => setPwVisible(b, b.getAttribute("aria-pressed") === "true"));
    if (!$("#pwGate").hidden) {
      $("#pwTitle").textContent = T(pwFirst ? "Створіть пароль" : "Змінити пароль");
      $("#pwSub").textContent = T(pwFirst ? "Надалі ви входитимете з електронною поштою і цим паролем." : "Використовуйте його для наступного входу на будь-якому пристрої.");
    }
    tickLogin(); paintPush();
    recs = { status: "idle", items: [], sig: "", at: 0 }; // recommendations come back in the new language
    if (!$("#statsView").hidden) $("#statsBody").innerHTML = statsHTML();
    if (!$("#picker").hidden) closeOverlay("#picker");
    render(false);
    if (loaded) ensureRecs();
    // follow you to your other devices, and phone notifications switch language too
    if (opts.save !== false && sb && me) {
      try { sb.auth.updateUser({ data: { lang: l } }).catch(() => {}); } catch (e) {}
      currentSub().then((sub) => { if (sub) saveSub(sub); }).catch(() => {});
    }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lang]");
    if (b) { e.preventDefault(); setLang(b.dataset.lang); }
  });

  // ---------- sticky header gets a hairline shadow once the page scrolls ----------
  const appbar = $("#appbar");
  // …and a back-to-top button slides in once you've scrolled about a screen down
  const toTop = $("#toTop");
  const onScroll = () => {
    appbar.classList.toggle("stuck", window.scrollY > 8);
    const show = window.scrollY > Math.max(500, window.innerHeight * 0.8);
    if (show !== document.body.classList.contains("show-top")) {
      document.body.classList.toggle("show-top", show);
      toTop.tabIndex = show ? 0 : -1;
      toTop.setAttribute("aria-hidden", String(!show));
    }
  };
  toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: motionOK() ? "smooth" : "auto" }));
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  // ---------- auth ----------
  // Sign in with email + password. A one-time email link is used only to set the
  // first password (proves the address is yours) or to reset a forgotten one.
  const LINK_COOLDOWN_MS = 60000;
  const loginBtn = $("#loginBtn"), linkBtn = $("#linkBtn"), loginEmail = $("#loginEmail"), loginPassword = $("#loginPassword"), loginHint = $("#loginHint");
  let emailOk = false, sending = false, cooldownTimer = null, checkSeq = 0, pwFirst = false;

  function hideAll() { $("#app").hidden = true; $("#gate").hidden = true; $("#pwGate").hidden = true; }
  function showGate(msg, ok) {
    hideAll(); $("#gate").hidden = false;
    if (msg != null) { const m = $("#loginMsg"); m.textContent = msg; m.classList.toggle("ok", !!ok); }
  }
  function fadeIn(el) { if (motionOK()) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" }); }
  function showApp() { const wasHidden = $("#app").hidden; hideAll(); $("#app").hidden = false; if (wasHidden) fadeIn($("#app")); }
  function showPwGate(first, email) {
    pwFirst = first;
    hideAll(); $("#pwGate").hidden = false;
    $("#pwTitle").textContent = T(first ? "Створіть пароль" : "Змінити пароль");
    $("#pwSub").textContent = T(first ? "Надалі ви входитимете з електронною поштою і цим паролем." : "Використовуйте його для наступного входу на будь-якому пристрої.");
    $("#pwUser").value = email || "";
    $("#pwNew").value = ""; $("#pwRepeat").value = "";
    $("#pwMsg").textContent = ""; $("#pwMsg").classList.remove("ok");
    hideAllPw();
    $("#pwCancel").hidden = first;
    setTimeout(() => $("#pwNew").focus(), 50);
  }

  // Eye button next to each password field: show / hide what you typed.
  function setPwVisible(btn, show) {
    const input = document.getElementById(btn.dataset.for); if (!input) return;
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-pressed", String(show));
    btn.setAttribute("aria-label", T(show ? "Сховати пароль" : "Показати пароль"));
  }
  const hideAllPw = () => document.querySelectorAll(".pwtoggle").forEach((b) => setPwVisible(b, false));
  document.querySelectorAll(".pwtoggle").forEach((b) => {
    b.addEventListener("pointerdown", (e) => e.preventDefault()); // keep the keyboard open on phones
    b.addEventListener("click", () => {
      const input = document.getElementById(b.dataset.for), end = input.value.length;
      setPwVisible(b, b.getAttribute("aria-pressed") !== "true");
      if (document.activeElement === input) try { input.setSelectionRange(end, end); } catch (e) {}
    });
  });

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
    loginBtn.disabled = !sb || sending || !emailOk || !loginPassword.value;
    const left = cooldownLeft();
    if (left > 0) {
      linkBtn.disabled = true;
      linkBtn.textContent = T("Надіслати посилання (знову через {s} с)", { s: Math.ceil(left / 1000) });
      cooldownTimer = setTimeout(tickLogin, 1000);
      return;
    }
    linkBtn.textContent = T("Надіслати посилання на пошту");
    linkBtn.disabled = !sb || sending || !emailOk;
  }
  // The button only wakes up for a member email, compared by SHA-256 fingerprint so the
  // addresses aren't in the public code. The server enforces membership on its own.
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
  loginPassword.addEventListener("input", tickLogin);
  loginPassword.addEventListener("change", tickLogin);

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (loginBtn.disabled) return;
    const email = loginEmail.value.trim().toLowerCase();
    sending = true; tickLogin();
    const { error } = await sb.auth.signInWithPassword({ email, password: loginPassword.value });
    sending = false; tickLogin();
    if (error) {
      if (error.status === 429) showGate(T("Забагато спроб. Зачекайте кілька хвилин і спробуйте ще раз."));
      else if (error.status === 400) showGate(T("Неправильна пошта або пароль. Ще не створили пароль? Скористайтеся посиланням нижче."));
      else showGate(T("Не вдалося увійти: {m}", { m: error.message }));
      return;
    }
    loginPassword.value = ""; hideAllPw();
  });

  linkBtn.addEventListener("click", async () => {
    if (linkBtn.disabled) return;
    const email = loginEmail.value.trim().toLowerCase();
    sending = true; tickLogin();
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    sending = false;
    if (error) {
      if (error.status === 429) { startCooldown(LINK_COOLDOWN_MS); showGate(T("Забагато листів. Зачекайте трохи і спробуйте ще раз.")); }
      else { tickLogin(); showGate(T("Не вдалося надіслати посилання: {m}", { m: error.message })); }
      return;
    }
    startCooldown(LINK_COOLDOWN_MS);
    showGate(T("Посилання надіслано на {email}. Відкрийте його і створіть пароль.", { email }), true);
  });

  $("#pwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#pwMsg"); msg.classList.remove("ok");
    const p1 = $("#pwNew").value, p2 = $("#pwRepeat").value;
    if (p1.length < 10) { msg.textContent = T("Пароль має містити щонайменше 10 символів."); return; }
    if (p1 !== p2) { msg.textContent = T("Паролі не збігаються."); return; }
    const btn = $("#pwSave"); btn.disabled = true;
    const { error } = await sb.auth.updateUser({ password: p1, data: { password_set: true } });
    btn.disabled = false;
    if (error) {
      if (error.code === "same_password") msg.textContent = T("Це ваш поточний пароль. Виберіть інший.");
      else if (error.code === "weak_password") msg.textContent = T("Пароль надто слабкий. Зробіть його довшим або менш поширеним.");
      else if (error.code === "reauthentication_needed" || error.status === 401) msg.textContent = T("З міркувань безпеки вийдіть і змініть пароль через посилання на пошту.");
      else msg.textContent = T("Не вдалося зберегти пароль: {m}", { m: error.message });
      return;
    }
    $("#pwNew").value = ""; $("#pwRepeat").value = "";
    const { data } = await sb.auth.getSession();
    toast(T("Пароль збережено"));
    if (pwFirst) onSession(data.session); else showApp();
  });
  $("#pwCancel").addEventListener("click", () => showApp());
  $("#pwSignOut").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });
  $("#changePwBtn").addEventListener("click", async () => {
    setMenu(false);
    const { data } = await sb.auth.getSession();
    showPwGate(false, data.session && data.session.user.email);
  });

  async function onSession(session) {
    if (!session) { started = false; showGate(); return; }
    if (/access_token|refresh_token/.test(location.hash)) { try { history.replaceState(null, "", location.pathname + "#" + tab); } catch (e) {} }
    const { data: name, error } = await sb.rpc("member_name");
    if (error || !name) {
      await sb.auth.signOut();
      showGate(T(error ? "Не вдалося перевірити доступ. Спробуйте ще раз." : "Цей обліковий запис не має доступу до списку."));
      return;
    }
    me = name;
    { const ml = (session.user.user_metadata || {}).lang; if ((ml === "uk" || ml === "en") && ml !== LANG) setLang(ml, { save: false }); }
    $("#whoName").textContent = T("Ви увійшли як {name}", { name: NAME[me] || me });
    const av = $("#acctBtn"); av.classList.toggle("is-alina", me === "Alina"); av.classList.toggle("is-aleks", me !== "Alina");
    $("#avatarLetter").textContent = (NAME[me] || me || "?").charAt(0);
    setVoteHeaders();
    const meta = session.user.user_metadata || {};
    if (!meta.password_set) { showPwGate(true, session.user.email); return; }
    showApp();
    if (started) return;
    started = true;
    try {
      seenAt = Number(localStorage.getItem("oc-seen-" + me)) || 0;
      if (!seenAt) markSeen(); // first visit on this device: nothing is "new" yet
    } catch (e) {}
    render();
    await loadFilms();
    subscribe();
    autoMatch();
    setTimeout(() => { refreshMeta().then(() => ensureRecs()); }, 1500);
    initPush();
  }

  function boot() {
    setNames(); applyStatic();
    if (!window.supabase || !CFG.supabaseUrl || !CFG.supabaseAnonKey || CFG.supabaseAnonKey.startsWith("PASTE")) {
      showGate(T("Сайт ще не під’єднаний до бази даних."));
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
    if (hashErr) setTimeout(() => showGate(/expired|invalid/i.test(hashErr) ? T("Посилання застаріло. Надішліть нове.") : T("Помилка входу: {m}", { m: hashErr })), 50);
    setTimeout(async () => { if (!seen) { const { data } = await sb.auth.getSession(); onSession(data.session); } }, 1500);
  }
  boot();
})();
