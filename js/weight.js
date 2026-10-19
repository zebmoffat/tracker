// --- CONFIGURATION ---
const GITHUB_USER = "zebmoffat";
const GITHUB_REPO = "tracker";

function formatPath(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `weight/${year}/${month}/${day}.txt`;
}

function formatDateShort(dateObj) {
  return `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
}

// Helper to guarantee 1 decimal place (e.g. 150 -> "150.0", 151.4 -> "151.4")
function formatWeight(val) {
  const num = parseFloat(val);
  return isNaN(num) ? "" : num.toFixed(1);
}

async function fetchWeightForDate(dateObj) {
  const token = localStorage.getItem("gh_pat");
  const path = formatPath(dateObj);
  const apiUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${path}?t=${new Date().getTime()}`;

  const requestHeaders = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) {
    requestHeaders.Authorization = `token ${token}`;
  }

  try {
    const res = await fetch(apiUrl, {
      headers: requestHeaders,
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json();
      const content = decodeURIComponent(escape(atob(data.content))).trim();
      const num = parseFloat(content);
      return {
        value: isNaN(num) ? content : num,
        sha: data.sha,
        exists: true,
      };
    }
  } catch (err) {
    console.error("Error reading date:", path, err);
  }
  return { value: null, sha: null, exists: false };
}

let todayFileSha = null;

async function init() {
  const token = localStorage.getItem("gh_pat");
  const controls = document.getElementById("weight-controls");
  const statusText = document.getElementById("status");

  if (!token) {
    if (controls) controls.style.display = "none";
    if (statusText) statusText.style.display = "none";
  }

  await renderPastDays();
  await checkTodayWeight();
}

async function renderPastDays() {
  const container = document.getElementById("weight-history");
  container.innerHTML = "";

  const pastDates = [];
  // 12 days total: index 0 is 12 days ago, index 11 is yesterday
  for (let i = 12; i >= 1; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    pastDates.push(d);
  }

  // Pre-render placeholders to maintain the 2x6 structure immediately
  pastDates.forEach((d, idx) => {
    container.innerHTML += `
      <div class="weight-history-card" id="history-box-${idx}">
        <span class="weight-label">${formatDateShort(d)}</span>
        <strong class="weight-val">...</strong>
      </div>
    `;
  });

  // Fetch all 12 days concurrently
  const results = await Promise.all(pastDates.map((d) => fetchWeightForDate(d)));

  results.forEach((res, idx) => {
    const box = document.getElementById(`history-box-${idx}`);
    if (!box) return;

    const valEl = box.querySelector(".weight-val");
    if (res.exists && res.value !== null) {
      valEl.innerText = formatWeight(res.value);
      box.classList.add("filled");
    } else {
      valEl.innerText = "";
    }
  });
}

async function checkTodayWeight() {
  const today = new Date();
  const res = await fetchWeightForDate(today);

  const todaySquare = document.getElementById("today-square");
  const displayVal = document.getElementById("today-display-val");
  const inputWrap = document.getElementById("today-input-wrap");
  const submitBtn = document.getElementById("weight-submit-btn");

  if (res.exists && res.value !== null) {
    todayFileSha = res.sha;

    displayVal.innerText = formatWeight(res.value);
    displayVal.style.display = "block";
    inputWrap.style.display = "none";

    todaySquare.classList.add("submitted");
    if (submitBtn) submitBtn.style.display = "none";
  } else {
    todaySquare.classList.remove("submitted");
    displayVal.style.display = "none";
    inputWrap.style.display = "block";
    if (submitBtn) submitBtn.style.display = "block";
  }
}

// Restricts typed values in real-time to:
// Up to 3 digits before a period, and at most 1 digit after a period.
function validateWeightInput(input) {
  let val = input.value;

  // Allow only digits and at most one dot
  val = val.replace(/[^0-9.]/g, "");

  // Prevent multiple dots
  const parts = val.split(".");
  if (parts.length > 2) {
    val = parts[0] + "." + parts.slice(1).join("");
  }

  // Restrict to max 3 digits before the dot and 1 digit after
  const match = val.match(/^(\d{0,3})(\.?\d{0,1})/);
  input.value = match ? match[1] + match[2] : "";
}

async function submitWeight() {
  const token = localStorage.getItem("gh_pat");
  const input = document.getElementById("weight-input");
  const rawVal = input.value.trim();

  // Validate complete entry: 2 or 3 digits, optional period with 1 digit
  if (!/^\d{2,3}(\.\d)?$/.test(rawVal)) {
    setStatus("Please enter a valid weight (e.g. 98, 150, or 151.4).");
    return;
  }

  // Always enforce 1 decimal place before sending (98 -> "98.0")
  const formattedVal = formatWeight(rawVal);

  const btn = document.getElementById("weight-submit-btn");
  btn.disabled = true;
  setStatus("Syncing weight to GitHub...");

  const today = new Date();
  const path = formatPath(today);
  const apiUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${path}`;

  try {
    const encodedContent = btoa(unescape(encodeURIComponent(formattedVal)));
    const body = {
      message: `Log weight: ${formattedVal}`,
      content: encodedContent,
    };
    if (todayFileSha) {
      body.sha = todayFileSha;
    }

    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (putRes.ok) {
      setStatus("Weight saved successfully!");
      await checkTodayWeight();
    } else {
      throw new Error("Failed to write to GitHub");
    }
  } catch (err) {
    console.error(err);
    setStatus("Error saving weight to GitHub.");
    btn.disabled = false;
  }
}

function setStatus(msg) {
  const el = document.getElementById("status");
  if (!el) return;
  el.innerText = msg;
  el.style.display = "block";

  setTimeout(() => {
    if (el.innerText === msg) {
      el.innerText = "";
      el.style.display = "none";
    }
  }, 3000);
}

init();
