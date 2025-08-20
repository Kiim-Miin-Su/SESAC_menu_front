const opt_area = document.querySelector("#area");
const opt_category = document.querySelector("#category");
const btn_search = document.querySelector("#search");
const btn_random = document.querySelector("#random");
const result_list = document.querySelector(".result_list");

let selected_area = "";
let selected_category = "";
const url_base = "http://172.31.99.114:8000";

function renderItems(items) {
    // 이전 결과 비우기
    result_list.querySelectorAll(".result_item").forEach((item) => {
        item.remove();
    });

    if (!items || items.length === 0) {
        result_list.innerHTML = `<li class="result_item">결과가 없습니다.</li>`;
        return;
    }

    for (const item of items) {

        const li = document.createElement("li");

        li.className = "result_item";
        li.innerHTML = `
      <h3 class="name">${item.name}</h3>
      <p class="address">${item.addr}</p>
      <p class="category">${item.kind}${item.open ? " · 영업중" : ""}</p>
      <img src="http://172.31.99.114:8000/photo/street?addr=${encodeURIComponent(item.addr)}" alt="음식점 이미지">
      <button class="btn_select">선택</button>
    `;
        result_list.appendChild(li);
    }
}

btn_search.addEventListener("click", async (e) => {
    e.preventDefault(); // 폼 submit 방지

    const area = opt_area.value;
    const category = opt_category.value;

    selected_area = area;
    selected_category = category;

    const params = new URLSearchParams({
        area: area,                 // 서버에서 쉼표 분리 처리
        kind: category,             // "전체"도 그대로 전달
        open_only: "true",
        limit: "20",
    });

    const search_url = `${url_base}/restaurants?${params.toString()}`;

    try {
        const resp = await fetch(search_url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json(); // { total, count, items }
        console.log(data);
        renderItems(data.items);
    } catch (err) {
        console.error("Error fetching data:", err);
        renderItems([]);
    }
    // ❌ window.location.reload() 제거
});

btn_random.addEventListener("click", async (e) => {
    e.preventDefault();

    const random_area =
        opt_area.options[Math.floor(Math.random() * opt_area.options.length)].value;
    const random_category =
        opt_category.options[Math.floor(Math.random() * opt_category.options.length)].value;

    selected_area = random_area;
    selected_category = random_category;

    const params = new URLSearchParams({
        area: random_area,
        kind: random_category,
    });

    const random_url = `${url_base}/restaurants/random`;

    try {
        const resp = await fetch(random_url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json(); // { name, open, addr, kind }

        // 단일 아이템 렌더 (기존 목록 유지하려면 append만)
        console.log(data);
        renderItems([data]);
    } catch (err) {
        console.error("Error fetching random:", err);
        renderItems([]);
    }
});

// 모든 선택 버튼에 이벤트 리스너 추가
// result_list 안에서 "선택" 버튼 클릭 이벤트 감지
result_list.addEventListener("click", (e) => {
    if (e.target.classList.contains("btn_select")) {
        e.preventDefault();

        const selected_item = e.target.closest(".result_item");
        if (!selected_item) return;

        const name = selected_item.querySelector(".name").textContent.trim();
        const addr = selected_item.querySelector(".address").textContent.trim();

        // 네이버 지도 검색 URL
        const query = encodeURIComponent(`${name} ${addr}`);
        const url = `https://map.naver.com/p/search/${query}`;
        window.open(url, "_blank");
    }
});



window.onload = async () => {

    const random_url = `${url_base}/restaurants/random?count=5`;

    try {
        const resp = await fetch(random_url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json(); // { name, open, addr, kind }

        const items = Array.isArray(data) ? data : [data];
        renderItems(items);
    } catch (err) {
        console.error("Error fetching random:", err);
    }
};
