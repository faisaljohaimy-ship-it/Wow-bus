const config = {
  mode: "local", // local أو api
  apiUrl: ""     // IT يضع الرابط هنا
};

const FAV_KEY = "employees_favorites";
let favoritesOnly = false;

function getFavorites() {
  return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]"));
}

function saveFavorites(set) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...set]));
  updateFavCount(set.size);
}

function updateFavCount(n) {
  const el = document.getElementById("favCount");
  if (el) el.textContent = String(n);
}

function toggleFavorite(id) {
  const favs = getFavorites();
  if (favs.has(id)) favs.delete(id);
  else favs.add(id);
  saveFavorites(favs);
  const data = JSON.parse(localStorage.getItem("employees")) || [];
  render(data);
}

function handleFileUpload(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = e.target.result
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => {
        const [id, name, dept, trip] = l.split(",").map(s => (s ?? "").trim());
        return { id, name, dept, trip };
      });
    localStorage.setItem("employees", JSON.stringify(data));
    render(data);
  };
  reader.readAsText(file);
}

async function loadAPI() {
  const res = await fetch(config.apiUrl);
  const data = await res.json();
  localStorage.setItem("employees", JSON.stringify(data));
  render(data);
}

function init() {
  if (config.mode === "api" && config.apiUrl) {
    loadAPI();
  } else {
    const data = JSON.parse(localStorage.getItem("employees")) || [];
    render(data);
  }
}

function render(data) {
  const box = document.getElementById("employees");
  const hint = document.getElementById("hint");
  box.innerHTML = "";

  const favs = getFavorites();
  updateFavCount(favs.size);

  let list = data.slice();
  if (favoritesOnly) list = list.filter(e => favs.has(e.id));

  list.sort((a, b) => {
    const af = favs.has(a.id) ? 0 : 1;
    const bf = favs.has(b.id) ? 0 : 1;
    return af - bf;
  });

  if (list.length === 0) {
    hint.style.display = "block";
    hint.textContent = favoritesOnly
      ? "لا يوجد موظفون مفضلون بعد. اضغط النجمة لإضافة موظف."
      : "لا توجد بيانات. ارفع ملف CSV ثم اضغط تشغيل.";
    return;
  }
  hint.style.display = "none";

  for (const emp of list) {
    const isFav = favs.has(emp.id);
    const row = document.createElement("div");
    row.className = "employee" + (isFav ? " is-fav" : "");
    row.innerHTML = `
      <button class="star-btn" aria-pressed="${isFav}" aria-label="تبديل المفضلة">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 17.6l-6.1 3.4 1.5-6.8L2.2 9.5l6.9-.7L12 2.5z"
                fill="${isFav ? "currentColor" : "none"}"
                stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="emp-id">#${escapeHtml(emp.id ?? "")}</div>
      <div class="emp-name">${escapeHtml(emp.name ?? "")}</div>
      <div class="emp-dept">${escapeHtml(emp.dept ?? "")}</div>
      <div class="emp-trip">${escapeHtml(emp.trip ?? "")}</div>
    `;
    row.querySelector(".star-btn").addEventListener("click", () => toggleFavorite(emp.id));
    box.appendChild(row);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("csvInput").addEventListener("change", (e) => {
    handleFileUpload(e.target.files[0]);
  });
  document.getElementById("runBtn").addEventListener("click", init);

  const favBtn = document.getElementById("favShortcut");
  favBtn.addEventListener("click", () => {
    favoritesOnly = !favoritesOnly;
    favBtn.setAttribute("aria-pressed", String(favoritesOnly));
    favBtn.classList.toggle("active", favoritesOnly);
    const data = JSON.parse(localStorage.getItem("employees")) || [];
    render(data);
  });

  init();
});
