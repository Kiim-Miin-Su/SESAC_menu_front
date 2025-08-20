const url_base = "https://sesac-menu.pe.kr";

// DOM
const opt_area = document.querySelector("#area");
const opt_category = document.querySelector("#category");
const opt_distance = document.querySelector("#distance");
const btn_search = document.querySelector("#search");
const btn_random = document.querySelector("#random");
const btn_more = document.querySelector("#load_more");
const listEl = document.querySelector(".result_list");
const metaEl = document.querySelector("#result_meta");

// 위치(거부 시 기본)
let curr_lat = 37.573669;
let curr_lon = 127.176886;

// 상태
let shownKeys = new Set();
let loading = false;
let inflightController = null;
let noMore = false;
const PAGE_LIMIT = 20;

// 이모지 매핑
const catEmoji = {
    "한": "🍚", "중": "🥟", "일": "🍣", "양": "🍕", "카페": "☕️", "호프통닭": "🍗🍺", "etc": "🍽️", "전체": "🧭"
};

// ────────────────────────────── 유틸
function setLoading(val) {
    loading = val;
    [btn_search, btn_random, btn_more].forEach(b => b && (b.disabled = val));
}
function toNum(x, def = 0) { const n = Number(x); return Number.isFinite(n) ? n : def; }
function keyOf(item) {
    if (item.id && item.id.trim()) return item.id.trim();
    return `${(item.name || "").trim()}|${(item.addr || "").trim()}`;
}
function calcDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; const t = r => r * Math.PI / 180;
    const dLat = t(lat2 - lat1), dLon = t(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(t(lat1)) * Math.cos(t(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function formatDistance(m) { return m >= 1000 ? (m / 1000).toFixed(1).replace(/\.0$/, "") + "km" : Math.round(m) + "m"; }
function filters(distOverride) {
    return {
        area: opt_area?.value || "",
        category: opt_category?.value || "전체",
        distance: distOverride ?? (opt_distance?.value || "500"),
    };
}
function updateMeta({ total, count }) {
    metaEl.textContent = `🔎 총 ${total.toLocaleString()}개 중 이번에 ${count}개 표시`;
}

// ────────────────────────────── 스켈레톤
function showSkeleton(n = 6, replace = false) {
    if (replace) { listEl.innerHTML = ""; }
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
        const li = document.createElement("li");
        li.className = "skel";
        li.innerHTML = `
      <div class="thumb"></div>
      <div class="bar big" style="margin-top:12px;width:60%"></div>
      <div class="bar" style="margin-top:8px;width:90%"></div>
      <div class="bar" style="margin-top:6px;width:45%"></div>
      <div class="bar" style="margin-top:14px;width:30%"></div>
    `;
        frag.appendChild(li);
    }
    listEl.appendChild(frag);
}
function clearSkeleton() {
    listEl.querySelectorAll(".skel").forEach(el => el.remove());
}

// ────────────────────────────── 렌더
function renderItems(items, { replace = false } = {}) {
    if (!items || items.length === 0) return;
    if (replace) {
        listEl.innerHTML = "";
        shownKeys = new Set();
        noMore = false;
    }
    const frag = document.createDocumentFragment();
    for (const it of items) {
        const k = keyOf(it);
        if (shownKeys.has(k)) continue;

        const dist = (it.loc_y != null && it.loc_x != null)
            ? formatDistance(calcDistance(curr_lat, curr_lon, toNum(it.loc_y), toNum(it.loc_x)))
            : null;

        const cat = it.category || it.kind || "etc";
        const li = document.createElement("li");
        li.className = "result_item";
        li.innerHTML = `
      <div class="badges">
        <span class="badge badge--cat">${catEmoji[cat] || "🍽️"} ${cat}</span>
        ${it.open ? `<span class="badge badge--ok"><span class="dot"></span> 영업중</span>` : `<span class="badge">⏳ 준비중</span>`}
        ${dist ? `<span class="badge">📍 ${dist}</span>` : ``}
      </div>

      <h3 class="name">${it.name || ""}</h3>
      <p class="address">📫 ${it.addr || ""}</p>
      <p class="category">🏷️ ${it.kind || cat}</p>

      <img loading="lazy" alt="거리뷰 이미지"
           src="${url_base}/photo/street?addr=${encodeURIComponent(it.addr || "")}"/>

      <div class="btn_row">
        <button class="btn_select" type="button">🗺️ 네이버 지도</button>
      </div>
    `;
        frag.appendChild(li);
        shownKeys.add(k);
    }
    listEl.appendChild(frag);
}

// 지도 버튼
listEl.addEventListener("click", (e) => {
    if (!e.target.classList.contains("btn_select")) return;
    e.preventDefault();
    const card = e.target.closest(".result_item");
    if (!card) return;
    const name = card.querySelector(".name")?.textContent.trim() || "";
    const addr = card.querySelector(".address")?.textContent.replace(/^📫\s*/, '').trim() || "";
    window.open(`https://map.naver.com/p/search/${encodeURIComponent(`${name} ${addr}`)}`, "_blank");
});

// ────────────────────────────── 요청
async function requestJSON(url) {
    if (inflightController) inflightController.abort();
    inflightController = new AbortController();
    const resp = await fetch(url, { signal: inflightController.signal, cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
}
function buildURL({ orderRand, distOverride, excludeKeys }) {
    const f = filters(distOverride);
    const p = new URLSearchParams({
        area: f.area, kind: f.category, open_only: "true",
        curr_loc_x: curr_lon, curr_loc_y: curr_lat, distance: f.distance,
        limit: String(PAGE_LIMIT), offset: "0",
        order: orderRand ? "rand" : "default",
        seed: String(Date.now()), cb: String(Math.random())
    });
    excludeKeys.slice(-200).forEach(k => p.append("exclude", k));
    return `${url_base}/restaurants?${p.toString()}`;
}
async function fetchOnce({ replace, orderRand, distOverride, excludeKeys }) {
    const url = buildURL({ orderRand, distOverride, excludeKeys });
    const data = await requestJSON(url);
    const items = Array.isArray(data.items) ? data.items : [];
    // fresh-only(검색 교체 시엔 exclude 기준, 추가 시엔 shownKeys 기준)
    const base = replace ? new Set(excludeKeys) : shownKeys;
    const fresh = items.filter(it => !base.has(keyOf(it)));
    if (fresh.length > 0) {
        renderItems(fresh, { replace });
        updateMeta({ total: data.total, count: fresh.length });
        if (items.length < PAGE_LIMIT) noMore = true;
        return true;
    }
    return false;
}

// 폴백 포함 로더
async function loadWithFallback({ replace, randomOrderForFirst = true }) {
    if (loading) return;
    setLoading(true);
    try {
        if (replace) showSkeleton(6, true); else showSkeleton(3, false);

        const excludeNow = Array.from(shownKeys);
        // 1) 현재거리
        if (await fetchOnce({ replace, orderRand: randomOrderForFirst, distOverride: undefined, excludeKeys: excludeNow })) return;
        // 2) 거리 x2
        const nowD = Number(opt_distance?.value || "500");
        const doubled = String(Math.min(nowD * 2, 4000));
        if (await fetchOnce({ replace, orderRand: true, distOverride: doubled, excludeKeys: excludeNow })) return;
        // 3) 무제한
        if (await fetchOnce({ replace, orderRand: true, distOverride: "999999", excludeKeys: excludeNow })) return;
        // 4) exclude 초기화(중복 허용)
        if (await fetchOnce({ replace, orderRand: true, distOverride: undefined, excludeKeys: [] })) return;
        if (await fetchOnce({ replace, orderRand: true, distOverride: doubled, excludeKeys: [] })) return;
        if (await fetchOnce({ replace, orderRand: true, distOverride: "999999", excludeKeys: [] })) return;
        // 5) 완전 랜덤
        const rnd = await requestJSON(`${url_base}/restaurants/random?count=5&cb=${Math.random()}`);
        const list = Array.isArray(rnd) ? rnd : rnd.items;
        renderItems(list, { replace: true });
        updateMeta({ total: list.length, count: list.length });
    } catch (e) {
        if (e.name !== "AbortError") console.error(e);
    } finally {
        clearSkeleton();
        setLoading(false);
    }
}

// 이벤트
btn_search.addEventListener("click", (e) => {
    e.preventDefault();
    loadWithFallback({ replace: true, randomOrderForFirst: true });
});
btn_more.addEventListener("click", (e) => {
    e.preventDefault();
    if (noMore) return;
    loadWithFallback({ replace: false, randomOrderForFirst: false });
});
btn_random.addEventListener("click", async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    showSkeleton(1, false);
    try {
        const rnd = await requestJSON(`${url_base}/restaurants/random?count=1&cb=${Math.random()}`);
        const list = Array.isArray(rnd) ? rnd : rnd.items;
        renderItems(list, { replace: false });
        updateMeta({ total: 0, count: list.length });
    } catch (err) {
        if (err.name !== "AbortError") console.error(err);
    } finally {
        clearSkeleton();
        setLoading(false);
    }
});

// 초기 로드: 위치
window.onload = () => {
    const start = () => loadWithFallback({ replace: true, randomOrderForFirst: true });
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            pos => { curr_lat = pos.coords.latitude; curr_lon = pos.coords.longitude; start(); },
            () => { curr_lat = 37.573669; curr_lon = 127.176886; start(); }
        );
    } else start();
};
