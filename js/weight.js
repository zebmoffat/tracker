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
  for (let i = 6; i >= 1; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    pastDates.push(d);
  }

  // Generate placeholder squares first to prevent layout shift
  pastDates.forEach((d, idx) => {
    container.innerHTML += `
      <div class="weight-history-card" id="history-box-${idx}">
        <span class="weight-label">${formatDateShort(d)}</span>
        <strong class="weight-val">...</strong>
      </div>
    `;
  });

  // Fetch past 6 days in parallel
  const results = await Promise.all(pastDates.map((d) => fetchWeightForDate(d)));

  results.forEach((res, idx) => {
    const box = document.getElementById(`history-box-${idx}`);
    if (!box) return;

    const valEl = box.querySelector(".weight-val");
    if (res.exists && res.value !== null) {
      const formatted = Number.isInteger(Number(res.value))
        ? res.value
        : Number(res.value).toFixed(1);
      valEl.innerText = formatted;
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
    const formatted = Number.isInteger(Number(res.value))
      ? res.value
      : Number(res.value).toFixed(1);

    displayVal.innerText = formatted;
    displayVal.style.display = "block";
    inputWrap.style.display = "none";

    // Grayed out to show it's finalized and hide button
    todaySquare.classList.add("submitted");
    if (submitBtn) submitBtn.style.display = "none";
  } else {
    // Unsubmitted state: white background and active inputs
    todaySquare.classList.remove("submitted");
    displayVal.style.display = "none";
    inputWrap.style.display = "block";
    if (submitBtn) submitBtn.style.display = "block";
  }
}

async function submitWeight() {
  const token = localStorage.getItem("gh_pat");
  const input = document.getElementById("weight-input");
  const rawVal = input.value.trim();

  // Validate numeric input (allows integer or 1 decimal place)
  if (!rawVal || isNaN(rawVal) || !/^\d+(\.\d{1})?$/.test(rawVal)) {
    setStatus("Please enter a valid weight (e.g. 150, 151.4).");
    return;
  }

  const btn = document.getElementById("weight-submit-btn");
  btn.disabled = true;
  setStatus("Syncing weight to GitHub...");

  const today = new Date();
  const path = formatPath(today);
  const apiUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${path}`;

  try {
    const encodedContent = btoa(unescape(encodeURIComponent(rawVal)));
    const body = {
      message: `Log weight: ${rawVal}`,
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