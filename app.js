(() => {
  "use strict";

  const CFG = window.OUR_CINEMA_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const IMG = "https://image.tmdb.org/t/p/";
  const TABS = [
    ["proposed", "Запропоновані"], ["agreed", "Погоджені"], ["watched", "Переглянуті"],
    ["aleks", "Відхилив Алекс"], ["alina", "Відхилила Аліна"], ["both", "Відхилили обоє"],
  ];
  const EMPTY = {
    proposed: ["Поки нічого не запропоновано", "Додайте назву вгорі. Коли ви обоє проголосуєте «Так», фільм перейде до погоджених."],
    agreed: ["Погоджених фільмів ще немає", "Тут з’являються фільми, за які Алекс і Аліна обоє проголосували «Так»."],
    watched: ["Переглянутих ще немає", "Позначте «Переглянуто» на будь-якому фільмі, і він з’явиться тут."],
    aleks: ["Алекс нічого не відхилив", "Тут фільми, за які Алекс проголосував «Ні» (а Аліна — ні)."],
    alina: ["Аліна нічого не відхилила", "Тут фільми, за які Аліна проголосувала «Ні» (а Алекс — ні)."],
    both: ["Обоє нічого не відхилили", "Тут фільми, за які ви обоє проголосували «Ні»."],
  };
  const NAME = { Aleks: "Алекс", Alina: "Аліна" };
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
  // Ukrainian plural: plural(5, ["фільм", "фільми", "фільмів"]) → "фільмів"
  function plural(n, forms) {
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

  try { const t = localStorage.getItem("oc-tab"); if (TABS.some((x) => x[0] === t)) tab = t; } catch (e) {}
  if (TABS.some((x) => "#" + x[0] === location.hash)) tab = location.hash.slice(1);

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");
  const hash = (s) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.codePointAt(0)) >>> 0; return x; };
  const titleOf = (f) => f.name_ua || f.name_en || "Без назви";
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
    if (motionOK()) t.animate([{ opacity: 0, transform: "translate(-50%, 10px)" }, { opacity: 1, transform: "translate(-50%, 0)" }], { duration: 180, easing: EASE });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (!motionOK()) { t.hidden = true; return; }
      t.animate([{ opacity: 1 }, { opacity: 0, transform: "translate(-50%, 6px)" }], { duration: 160, easing: "ease-in" }).finished.then(() => (t.hidden = true), () => (t.hidden = true));
    }, action ? 8000 : 4500);
  }
  function setStatus(msg, err) {
    const s = $("#status"); s.textContent = msg || ""; s.hidden = !msg; s.classList.toggle("err", !!err);
  }
  function dbErr(e) {
    if (!e) return "Щось пішло не так. Спробуйте ще раз.";
    if (e.code === "23505") return "Цей фільм уже є в списку.";
    if (e.code === "42501" || /row-level security/i.test(e.message || "")) return "Цей обліковий запис не може змінювати список.";
    if (/JWT|token/i.test(e.message || "")) return "Сеанс завершився. Оновіть сторінку.";
    return "Не вдалося зберегти. Перевірте з’єднання і спробуйте ще раз.";
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
      case "nokey": return "Ключ TMDB не налаштований на сервері.";
      case "auth": return "TMDB не прийняв ключ сервера.";
      case "rate": return "TMDB перевантажений. Спробуйте за кілька секунд.";
      case "network": return "Не вдалося зв’язатися з TMDB. Перевірте з’єднання.";
      default: return "Пошук у TMDB не вдався. Спробуйте ще раз.";
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
      genres: ((uk.genres && uk.genres.length ? uk.genres : en.genres) || []).map((g) => genreUa(g.name)).slice(0, 3),
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

  const FILM_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4V4zm2 2v2h2V6H6zm10 0v2h2V6h-2zM6 10v4h2v-4H6zm10 0v4h2v-4h-2zM6 16v2h2v-2H6zm10 0v2h2v-2h-2zM10 6v12h4V6h-4z"/></svg>';
  const TV_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2l4 4 4-4 1.4 1.4L14.8 6H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5.2L6.6 3.4 8 2zM4 8v10h16V8H4z"/></svg>';
  function kindHTML(f) {
    return f.media_type === "tv"
      ? `<span class="kind kind-tv">${TV_ICON}Серіал</span>`
      : `<span class="kind kind-movie">${FILM_ICON}Фільм</span>`;
  }
  function trailerHTML(f, which, label) {
    const url = which === "en" ? f.trailer_en : f.trailer_ua;
    if (!url) return f.tmdb_id ? `<span class="none">${which === "ua" ? "Українського трейлера на TMDB немає" : "Трейлера на TMDB немає"}</span>` : '<span class="dim">—</span>';
    return `<button type="button" class="trl" data-act="play" data-id="${f.id}" data-which="${which}">${PLAY}<span>${esc(label)}</span></button>`;
  }
  function posterHTML(f) {
    const t = titleOf(f), src = posterSrc(f.poster_path, "w185");
    if (src) return `<button class="poster" data-act="edit" data-id="${f.id}" aria-label="Редагувати: ${esc(t)}"><img src="${esc(src)}" alt="" loading="lazy"></button>`;
    return `<button class="poster" data-act="edit" data-id="${f.id}" aria-label="Редагувати: ${esc(t)}"><span class="pg" style="--h:${hash(t) % 360}"><span class="pg-t">${esc(t)}</span><span class="pg-y">${esc(f.year || "")}</span></span></button>`;
  }
  function metaHTML(f) {
    const bits = [];
    if (f.year) bits.push(f.year);
    if (f.runtime) bits.push(f.runtime + (f.media_type === "tv" ? " хв/серія" : " хв"));
    if (Array.isArray(f.genres) && f.genres.length) bits.push(f.genres.slice(0, 3).map(genreUa).join(", "));
    return bits.length ? `<div class="meta">${esc(bits.join(" · "))}</div>` : "";
  }
  function fillHTML(f) {
    if (busy.has(f.id)) return `<div class="fillstate"><span class="spin"></span>Заповнюємо з TMDB…</div>`;
    if (!f.tmdb_id && f.match_state === "failed") return `<div class="fillstate">Не знайдено на TMDB. <button class="linkbtn" data-act="edit" data-id="${f.id}">Знайти</button></div>`;
    return "";
  }
  function descHTML(f, lang) {
    const text = lang === "en" ? f.desc_en : f.desc_ua;
    if (!text) return f.tmdb_id && lang === "ua" ? '<span class="none">Українського опису на TMDB немає</span>' : '<span class="dim">—</span>';
    const key = f.id + ":" + lang, open = expanded.has(key);
    return `<div class="desc${open ? " open" : ""}" ${lang === "ua" ? 'lang="uk"' : ""} data-act="desc" data-key="${key}" role="button" tabindex="0" aria-expanded="${open}">${esc(text)}</div>`;
  }
  function voteHTML(f, who, showName) {
    const v = f[who] || "", Who = who === "aleks" ? "Алекс" : "Аліна";
    return `<div class="vote ${who}" role="group" aria-label="Голос: ${Who}">${showName ? `<span class="vote-name">${Who}</span>` : ""}`
      + `<div class="seg"><button class="vb yes${v === "yes" ? " on" : ""}" data-act="vote" data-id="${f.id}" data-who="${who}" data-val="yes" aria-pressed="${v === "yes"}">Так</button>`
      + `<button class="vb no${v === "no" ? " on" : ""}" data-act="vote" data-id="${f.id}" data-who="${who}" data-val="no" aria-pressed="${v === "no"}">Ні</button></div></div>`;
  }
  function watchHTML(f, prefix) {
    return `<label class="watch${f.watched ? " on" : ""}"><input type="checkbox" id="${prefix}-w-${f.id}" data-act="watched" data-id="${f.id}" ${f.watched ? "checked" : ""}><span>Переглянуто</span></label>`;
  }
  const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm17.7-10.2a1 1 0 0 0 0-1.42l-2.33-2.33a1 1 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
  function editBtnHTML(f, iconOnly) {
    return iconOnly
      ? `<button class="iconbtn sq" data-act="edit" data-id="${f.id}" aria-label="Редагувати: ${esc(titleOf(f))}" title="Редагувати">${PENCIL}</button>`
      : `<button class="iconbtn" data-act="edit" data-id="${f.id}">Змінити</button>`;
  }
  const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9zm4 2v8h2v-8h-2zm4 0v8h2v-8h-2z"/></svg>';
  function selHTML(f, prefix) {
    const on = selected.has(f.id);
    return `<input type="checkbox" class="sel" id="${prefix}-s-${f.id}" data-act="select" data-id="${f.id}" ${on ? "checked" : ""} aria-label="Вибрати: ${esc(titleOf(f))}">`;
  }
  function delBtnHTML(f) {
    return `<button class="iconbtn sq del" data-act="delete" data-id="${f.id}" aria-label="Видалити: ${esc(titleOf(f))}" title="Видалити">${TRASH}</button>`;
  }
  function rowHTML(f) {
    return `<tr data-key="${f.id}"${selected.has(f.id) ? ' class="is-sel"' : ""}>
      <td class="c-sel">${selHTML(f, "t")}</td>
      <td class="c-poster">${posterHTML(f)}</td>
      <td class="c-name">${kindHTML(f)}<div class="title-en">${f.name_en ? esc(f.name_en) : '<span class="dim">—</span>'}</div>${metaHTML(f)}${fillHTML(f)}</td>
      <td class="c-name"><div class="title-ua" lang="uk">${f.name_ua ? esc(f.name_ua) : '<span class="dim">—</span>'}</div></td>
      <td class="c-desc">${descHTML(f, "en")}</td>
      <td class="c-desc">${descHTML(f, "ua")}</td>
      <td class="c-tr">${trailerHTML(f, "en", "Англ.")}</td>
      <td class="c-tr">${trailerHTML(f, "ua", "Укр.")}</td>
      <td class="c-vote">${voteHTML(f, "aleks", false)}</td>
      <td class="c-vote">${voteHTML(f, "alina", false)}</td>
      <td class="c-watch">${watchHTML(f, "t")}</td>
      <td class="c-edit"><div class="row-tools">${editBtnHTML(f, true)}${delBtnHTML(f)}</div></td>
    </tr>`;
  }
  function cardHTML(f) {
    const tr = [f.trailer_ua ? trailerHTML(f, "ua", "Трейлер укр.") : "", f.trailer_en ? trailerHTML(f, "en", "Трейлер англ.") : ""].join("");
    const main = f.name_ua || f.name_en || "Без назви";
    const second = f.name_ua && f.name_en && norm(f.name_ua) !== norm(f.name_en) ? f.name_en : "";
    return `<article data-key="${f.id}" class="card${selected.has(f.id) ? " is-sel" : ""}${f.media_type === "tv" ? " is-tv" : ""}">
      <label class="card-sel">${selHTML(f, "c")}</label>
      <div class="card-poster">${posterHTML(f)}</div>
      <div class="card-head">
        ${kindHTML(f)}
        <div class="title-ua" lang="uk">${esc(main)}</div>
        ${second ? `<div class="title-en" lang="en">${esc(second)}</div>` : ""}
        ${metaHTML(f)}${fillHTML(f)}
      </div>
      ${tr ? `<div class="card-trailers">${tr}</div>` : ""}
      ${f.desc_en || f.desc_ua ? `<div class="card-desc">
        ${f.desc_ua ? `<div><span class="lang">Укр.</span>${descHTML(f, "ua")}</div>` : ""}
        ${f.desc_en ? `<div lang="en"><span class="lang">Англ.</span>${descHTML(f, "en")}</div>` : ""}
      </div>` : ""}
      <div class="card-actions">
        <div class="card-votes">
          ${voteHTML(f, "aleks", true)}
          ${voteHTML(f, "alina", true)}
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
    const counts = Object.fromEntries(TABS.map(([k]) => [k, 0]));
    for (const f of films) if (kindOK(f)) counts[tabOf(f)]++;
    $("#tabs").innerHTML = TABS.map(([k, label]) =>
      `<button class="tab" role="tab" data-tab="${k}" aria-selected="${k === tab}"><span>${label}</span><span class="n">${counts[k]}</span></button>`).join("");
    const watchedAll = films.filter((f) => f.watched).length;
    $("#stats").textContent = loaded ? `${films.length} ${plural(films.length, ["назва", "назви", "назв"])} · переглянуто ${watchedAll}` : "";
    document.querySelectorAll("#kindFilter [data-kind]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === kind)));
    if (!loaded) return;
    setStatus("");

    const q = norm(query);
    let list = films.filter((f) => tabOf(f) === tab && kindOK(f));
    if (q) list = list.filter((f) => norm(f.name_en).includes(q) || norm(f.name_ua).includes(q));
    const t = (x) => (x ? Date.parse(x) || 0 : 0);
    list.sort((a, b) => tab === "watched" ? t(b.watched_at) - t(a.watched_at) : t(b.created_at) - t(a.created_at));

    const page = list.slice(0, shown);
    visibleIds = page.map((f) => f.id);
    for (const id of [...selected]) if (!visibleIds.includes(id)) selected.delete(id);
    renderBulk();

    const left = list.length - page.length, more = $("#more");
    more.hidden = left <= 0;
    if (left > 0) $("#moreBtn").textContent = `Показати ще ${Math.min(PAGE, left)} · залишилось ${left}`;
    $("#pageInfo").textContent = list.length > PAGE ? `Показано ${page.length} з ${list.length}` : "";

    const empty = $("#empty");
    if (!list.length) {
      const what = kind === "tv" ? "серіалів" : kind === "movie" ? "фільмів" : "";
      const [h, s] = q ? ["Нічого не знайдено", "У цьому списку немає назв, що відповідають пошуку."]
        : what && films.some((f) => tabOf(f) === tab) ? ["Тут порожньо", `У цьому списку немає ${what}. Змініть фільтр «Усі / Фільми / Серіали».`]
        : EMPTY[tab];
      empty.innerHTML = `<b>${esc(h)}</b>${esc(s)}`;
      empty.hidden = false; $("#tableWrap").hidden = true; $("#cards").hidden = true;
      if (before && motionOK()) empty.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: EASE });
      return;
    }
    empty.hidden = true; $("#tableWrap").hidden = false; $("#cards").hidden = false;
    $("#rows").innerHTML = page.map(rowHTML).join("");
    $("#cards").innerHTML = page.map(cardHTML).join("");
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
    $("#bulkCount").textContent = `Вибрано: ${n}`;
    $("#bulkDelete").textContent = bulkArmed ? "Точно видалити?" : "Видалити";
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
    await animateOut(ids);
    films = films.filter((f) => !ids.includes(f.id));
    ids.forEach((id) => selected.delete(id));
    bulkArmed = false;
    render();
    const { error } = await sb.from("films").delete().in("id", ids);
    if (error) { films = films.concat(removed); render(); toast(dbErr(error)); return; }
    const label = removed.length === 1 ? `Видалено «${titleOf(removed[0])}»` : `Видалено ${removed.length} ${plural(removed.length, FILMS)}`;
    toast(label, { label: "Скасувати", run: () => restoreFilms(removed) });
  }
  async function restoreFilms(rows) {
    const { data, error } = await sb.from("films").insert(rows.map((r) => ({ ...r }))).select();
    if (error) { toast(dbErr(error)); return; }
    for (const r of data || []) if (!films.some((f) => f.id === r.id)) films.push(r);
    render();
    toast(rows.length === 1 ? "Відновлено" : `Відновлено ${rows.length} ${plural(rows.length, FILMS)}`);
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
    if (error) { setStatus("Не вдалося завантажити список. Оновіть сторінку.", true); return; }
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
        const kind = r.type === "tv" ? `<span class="kind kind-tv">${TV_ICON}Серіал</span>` : `<span class="kind kind-movie">${FILM_ICON}Фільм</span>`;
        return `<li role="option" data-i="${i}" aria-selected="${i === active}">${img}<div style="min-width:0"><div class="s-t">${esc(r.title)}</div><div class="s-m">${kind}<span>${esc(sub)}</span></div></div></li>`;
      }).join("");
      list.hidden = false; input.setAttribute("aria-expanded", "true");
    };
    const run = debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) { items = []; close(); return; }
      const my = ++seq;
      try { const res = await searchTitles(q); if (my !== seq) return; items = res; active = -1; paint(res.length ? "" : "На TMDB нічого не знайдено"); }
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
    if (dup) { showAddMsg(`«${titleOf(dup)}» уже є в списку (вкладка «${TABS.find((t) => t[0] === tabOf(dup))[1]}»).`); return; }
    addBtn.disabled = true; addBtn.classList.add("busy");
    try {
      const d = await fetchDetails(r.type, r.id);
      const row = await insertFilm(d);
      if (row) { addInput.value = ""; addSuggest.clear(); if (tab !== "proposed") selectTab("proposed"); toast(`Додано «${titleOf(row)}»`); }
    } catch (e) { showAddMsg(tmdbMsg(e)); }
    finally { addBtn.disabled = false; addBtn.classList.remove("busy"); }
  }
  $("#addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = addInput.value.trim();
    if (!q) { showAddMsg("Спершу введіть назву."); return; }
    addBtn.disabled = true;
    try {
      const res = await searchTitles(q);
      addSuggest.close();
      const exact = res.filter((r) => norm(r.title) === norm(q) || norm(r.original) === norm(q));
      const best = exact.find((r) => r.type === "movie") || exact[0] || res[0];
      if (best) await addFromResult(best);
      else showAddMsg(`На TMDB немає збігів для «${q}». Перевірте написання або спробуйте іншою мовою.`);
    } catch (err) { showAddMsg(tmdbMsg(err)); }
    finally { addBtn.disabled = false; }
  });

  // ---------- interactions ----------
  function selectTab(k) {
    if (k !== tab) { selected.clear(); bulkArmed = false; resetPage(); }
    tab = k;
    try { localStorage.setItem("oc-tab", k); } catch (e) {}
    try { history.replaceState(null, "", "#" + k); } catch (e) {}
    render();
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) selectTab(b.dataset.tab); });
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
    const el = document.querySelectorAll(window.innerWidth > 900 ? "#rows tr" : "#cards .card")[firstNew];
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
      patchFilm(id, { [who]: f[who] === el.dataset.val ? "" : el.dataset.val });
      // small press feedback on the re-rendered switch (only if the film stays in this list)
      if (motionOK()) requestAnimationFrame(() => document.querySelectorAll(`[data-act="vote"][data-id="${id}"][data-who="${who}"].on`)
        .forEach((b) => b.animate([{ transform: "scale(.92)" }, { transform: "none" }], { duration: 180, easing: EASE })));
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

  // ---------- trailer player ----------
  function openPlayer(f, which) {
    const url = which === "en" ? f.trailer_en : f.trailer_ua;
    const id = ytId(url);
    if (!id) { if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener"); return; }
    $("#playerTitle").textContent = titleOf(f);
    $("#playerSub").textContent = (which === "en" ? "Англійський трейлер" : "Український трейлер") + (f.year ? " · " + f.year : "");
    // Android: an intent link opens the YouTube app, falling back to the web page if the app isn't installed.
    // iPhone: the normal https link opens the app through universal links.
    const web = "https://www.youtube.com/watch?v=" + id;
    const yt = $("#playerYt");
    if (/Android/i.test(navigator.userAgent)) {
      yt.href = `intent://www.youtube.com/watch?v=${id}#Intent;scheme=https;package=com.google.android.youtube;S.browser_fallback_url=${encodeURIComponent(web)};end`;
      yt.removeAttribute("target");
    } else { yt.href = web; yt.target = "_blank"; }
    $("#playerFrame").style.backgroundImage = `url("https://i.ytimg.com/vi/${id}/hqdefault.jpg")`;
    $("#playerFrame").innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="Трейлер" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
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
    $("#edGenres").value = Array.isArray(d.genres) ? d.genres.map(genreUa).join(", ") : "";
    $("#edDescEn").value = d.desc_en || ""; $("#edDescUa").value = d.desc_ua || "";
    $("#edTrEn").value = d.trailer_en || ""; $("#edTrUa").value = d.trailer_ua || "";
    $("#edPoster").value = d.poster_path || "";
    edPreview();
  }
  const edSuggest = makeSuggest($("#edMatch"), $("#edSuggest"), async (r) => {
    edMsg.classList.remove("ok"); edMsg.textContent = "Завантажуємо з TMDB…";
    try {
      const d = await fetchDetails(r.type, r.id);
      const dup = films.find((f) => f.id !== edId && f.tmdb_id === d.tmdb_id && f.media_type === d.media_type);
      if (dup) { edMsg.textContent = `«${titleOf(dup)}» уже є в списку.`; return; }
      edMatch = d; fillForm(d); $("#edMatch").value = "";
      edMsg.classList.add("ok"); edMsg.textContent = "Заповнено з TMDB. Натисніть «Зберегти», щоб залишити.";
    } catch (e) { edMsg.textContent = tmdbMsg(e); }
  });
  function openEditor(id) {
    const f = films.find((x) => x.id === id); if (!f) return;
    edId = id; edMatch = null; delArmed = false;
    $("#edDelete").textContent = "Видалити";
    $("#edTitle").textContent = "Редагування · " + titleOf(f);
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
    for (const u of [trEn, trUa]) if (u && !/^https?:\/\//i.test(u)) { edMsg.textContent = "Трейлер має бути повним посиланням, що починається з https://"; return; }
    const patch = {
      name_en: $("#edEn").value.trim(), name_ua: $("#edUa").value.trim(),
      year: num($("#edYear").value), runtime: num($("#edRuntime").value),
      genres: $("#edGenres").value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5),
      desc_en: $("#edDescEn").value.trim(), desc_ua: $("#edDescUa").value.trim(),
      trailer_en: trEn, trailer_ua: trUa,
      poster_path: $("#edPoster").value.trim(),
    };
    if (!patch.name_en && !patch.name_ua) { edMsg.textContent = "Вкажіть хоча б одну назву."; return; }
    if (edMatch) { patch.tmdb_id = edMatch.tmdb_id; patch.media_type = edMatch.media_type; patch.match_state = "done"; }
    const id = edId; closeEditor();
    if (await patchFilm(id, patch)) toast("Збережено");
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

  // ---------- sticky header gets a hairline shadow once the page scrolls ----------
  const appbar = $("#appbar");
  const onScroll = () => appbar.classList.toggle("stuck", window.scrollY > 8);
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
    $("#pwTitle").textContent = first ? "Створіть пароль" : "Змінити пароль";
    $("#pwSub").textContent = first ? "Надалі ви входитимете з електронною поштою і цим паролем." : "Використовуйте його для наступного входу на будь-якому пристрої.";
    $("#pwUser").value = email || "";
    $("#pwNew").value = ""; $("#pwRepeat").value = "";
    $("#pwMsg").textContent = ""; $("#pwMsg").classList.remove("ok");
    $("#pwCancel").hidden = first;
    setTimeout(() => $("#pwNew").focus(), 50);
  }

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
      linkBtn.textContent = `Надіслати посилання (знову через ${Math.ceil(left / 1000)} с)`;
      cooldownTimer = setTimeout(tickLogin, 1000);
      return;
    }
    linkBtn.textContent = "Надіслати посилання на пошту";
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
      if (error.status === 429) showGate("Забагато спроб. Зачекайте кілька хвилин і спробуйте ще раз.");
      else if (error.status === 400) showGate("Неправильна пошта або пароль. Ще не створили пароль? Скористайтеся посиланням нижче.");
      else showGate("Не вдалося увійти: " + error.message);
      return;
    }
    loginPassword.value = "";
  });

  linkBtn.addEventListener("click", async () => {
    if (linkBtn.disabled) return;
    const email = loginEmail.value.trim().toLowerCase();
    sending = true; tickLogin();
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    sending = false;
    if (error) {
      if (error.status === 429) { startCooldown(LINK_COOLDOWN_MS); showGate("Забагато листів. Зачекайте трохи і спробуйте ще раз."); }
      else { tickLogin(); showGate("Не вдалося надіслати посилання: " + error.message); }
      return;
    }
    startCooldown(LINK_COOLDOWN_MS);
    showGate(`Посилання надіслано на ${email}. Відкрийте його і створіть пароль.`, true);
  });

  $("#pwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#pwMsg"); msg.classList.remove("ok");
    const p1 = $("#pwNew").value, p2 = $("#pwRepeat").value;
    if (p1.length < 10) { msg.textContent = "Пароль має містити щонайменше 10 символів."; return; }
    if (p1 !== p2) { msg.textContent = "Паролі не збігаються."; return; }
    const btn = $("#pwSave"); btn.disabled = true;
    const { error } = await sb.auth.updateUser({ password: p1, data: { password_set: true } });
    btn.disabled = false;
    if (error) {
      if (error.code === "same_password") msg.textContent = "Це ваш поточний пароль. Виберіть інший.";
      else if (error.code === "weak_password") msg.textContent = "Пароль надто слабкий. Зробіть його довшим або менш поширеним.";
      else if (error.code === "reauthentication_needed" || error.status === 401) msg.textContent = "З міркувань безпеки вийдіть і змініть пароль через посилання на пошту.";
      else msg.textContent = "Не вдалося зберегти пароль: " + error.message;
      return;
    }
    $("#pwNew").value = ""; $("#pwRepeat").value = "";
    const { data } = await sb.auth.getSession();
    toast("Пароль збережено");
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
      showGate(error ? "Не вдалося перевірити доступ. Спробуйте ще раз." : "Цей обліковий запис не має доступу до списку.");
      return;
    }
    me = name;
    $("#whoName").textContent = "Ви увійшли як " + (NAME[me] || me);
    const av = $("#acctBtn"); av.classList.toggle("is-alina", me === "Alina"); av.classList.toggle("is-aleks", me !== "Alina");
    $("#avatarLetter").textContent = (NAME[me] || me || "?").charAt(0);
    const meta = session.user.user_metadata || {};
    if (!meta.password_set) { showPwGate(true, session.user.email); return; }
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
      showGate("Сайт ще не під’єднаний до бази даних.");
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
    if (hashErr) setTimeout(() => showGate(/expired|invalid/i.test(hashErr) ? "Посилання застаріло. Надішліть нове." : "Помилка входу: " + hashErr), 50);
    setTimeout(async () => { if (!seen) { const { data } = await sb.auth.getSession(); onSession(data.session); } }, 1500);
  }
  boot();
})();
