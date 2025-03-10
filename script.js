// <script type="text/discourse-plugin" version="0.8">
// Hardcoding the target path
const TARGET_PATH = "/c/agenda/43";

const DEBUG_MODE = true; // Toggle logging on/off
const MAX_RETRIES = 5;
const CHECK_INTERVAL = 500;
let retryCount = 0;
let processingInProgress = false;
let lastRunTime = 0;
const cooldownTime = 1000;

let topicListObserver = null;

function logDebug(message) {
  if (DEBUG_MODE) console.log(message);
}
function logWarning(message) {
  if (DEBUG_MODE) console.warn(message);
}
function logError(message) {
  if (DEBUG_MODE) console.error(message);
}

// Apply highlight classes
function applyHighlighting(row, titleText) {
  const highlightRules = [
    { keyword: "Invite", cssClass: "invite-event", hideThumbnail: false, removeExcerpt: false },
    { keyword: "Breakout Session", cssClass: "sessions-event", hideThumbnail: false, removeExcerpt: false },
    { keyword: "Lunch", cssClass: "break-event", hideThumbnail: true, removeExcerpt: false },
    { keyword: "Break", cssClass: "break-event", hideThumbnail: true, removeExcerpt: false },
    { keyword: "Cocktail", cssClass: "break-event", hideThumbnail: true, removeExcerpt: false },
    { keyword: "Reception", cssClass: "break-event", hideThumbnail: true, removeExcerpt: false },
    { keyword: "Dining", cssClass: "break-event", hideThumbnail: true, removeExcerpt: false },
    { keyword: "Registration", cssClass: "break-event", hideThumbnail: true, removeExcerpt: false },
    { keyword: "Optional", cssClass: "optional-event", hideThumbnail: false, removeExcerpt: false }
  ];

  for (let rule of highlightRules) {
    if (titleText.includes(rule.keyword.toLowerCase())) {
      row.classList.add(rule.cssClass);

      if (rule.hideThumbnail) {
        const thumbnailDiv = row.querySelector(".topic-list-thumbnail");
        if (thumbnailDiv) thumbnailDiv.style.display = "none";
      }

      if (rule.removeExcerpt) {
        const excerptDiv = row.querySelector("div[style*='font-size: 14px; color: rgb(102, 102, 102); margin-top: 4px;']");
        if (excerptDiv) excerptDiv.remove();
      }
      break;
    }
  }
}

function runAfterEmberRender(callback, attempts = 0) {
  if (attempts >= MAX_RETRIES) {
    logError("❌ Max retries reached. Stopping further attempts.");
    return;
  }
  requestAnimationFrame(() => {
    if (document.querySelector("tbody.topic-list-body")) {
      logDebug("✅ Ember rendering finished. Running script...");
      callback();
    } else {
      logWarning(`⚠️ Waiting for Ember rendering... (${attempts + 1}/${MAX_RETRIES})`);
      setTimeout(() => runAfterEmberRender(callback, attempts + 1), CHECK_INTERVAL);
    }
  });
}

// Parse excerpt lines (INFO:, SPEAKER:, LOCATION:)
function parseExcerptData(row) {
  const excerptDiv = row.querySelector(".topic-excerpt");
  if (!excerptDiv) return {};

  const lines = excerptDiv.textContent
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  const data = { info: null, speaker: null, location: null };
  lines.forEach(line => {
    const upper = line.toUpperCase();
    if (upper.startsWith("INFO:")) {
      data.info = line.replace(/INFO:\s*/i, "").trim();
    } else if (upper.startsWith("SPEAKER:")) {
      data.speaker = line.replace(/SPEAKER:\s*/i, "").trim();
    } else if (upper.startsWith("LOCATION:")) {
      data.location = line.replace(/LOCATION:\s*/i, "").trim();
    }
  });
  return data;
}

function processAgendaEvents() {
  const now = Date.now();
  if (processingInProgress && (now - lastRunTime < cooldownTime)) {
    logWarning("⏳ Process already running or recently executed. Skipping.");
    return;
  }
  processingInProgress = true;
  lastRunTime = now;

  // Temporarily disconnect the topicList observer
  if (topicListObserver) {
    topicListObserver.disconnect();
  }

  runAfterEmberRender(() => {
    logDebug("🚀 Running Agenda Processing...");
    const topicList = document.querySelector("tbody.topic-list-body");
    if (!topicList) {
      retryCount++;
      logWarning(`⚠️ No topic list found, retrying... (${retryCount}/${MAX_RETRIES})`);
      if (retryCount < MAX_RETRIES) {
        setTimeout(() => {
          processingInProgress = false;
          processAgendaEvents();
        }, CHECK_INTERVAL);
      } else {
        logError("❌ Max retries reached. Stopping further attempts.");
        processingInProgress = false;
      }
      observeTopicListChanges();
      return;
    }

    retryCount = 0;

    // Hide default excerpts
    topicList.querySelectorAll(".topic-excerpt").forEach(excerpt => {
      excerpt.style.display = "none";
    });

    let lastDate = null;
    let pinnedPosts = [];
    let nonPinnedPosts = [];

    topicList.querySelectorAll("tr.topic-list-item").forEach(row => {
      if (row.classList.contains("pinned")) pinnedPosts.push(row);
      else nonPinnedPosts.push(row);
    });

    function parseEventDate(dateText) {
      const cleaned = dateText.split(",")[0].trim();
      const match = cleaned.match(/\b(\d{1,2})[-\/](\d{1,2})\b/);
      if (!match) {
        logWarning(`⚠️ No valid date found in text: "${dateText}"`);
        return null;
      }
      const [_, month, day] = match;
      const thisYear = new Date().getFullYear();
      const d = new Date(Date.UTC(thisYear, month - 1, day, 5, 0, 0));
      if (isNaN(d)) {
        logWarning(`⚠️ Date parsing failed for: "${dateText}"`);
        return null;
      }
      return d;
    }

    function getEventDate(row) {
      const eventDateElement = row.querySelector(".event-label .date");
      return eventDateElement ? parseEventDate(eventDateElement.textContent.trim()) : null;
    }

    function formatDateWithOrdinal(date) {
      if (!date) return "Invalid Date";
      const monthNames = [
        "January","February","March","April","May","June",
        "July","August","September","October","November","December"
      ];
      const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      let dayOfWeek = dayNames[date.getUTCDay()];
      let day = date.getUTCDate();
      let month = monthNames[date.getUTCMonth()];
      let suffix = "th";
      if (day % 10 === 1 && day !== 11) suffix = "st";
      else if (day % 10 === 2 && day !== 12) suffix = "nd";
      else if (day % 10 === 3 && day !== 13) suffix = "rd";
      return `${dayOfWeek}, ${month} ${day}${suffix}`;
    }

    // Clear the table entirely and rebuild
    topicList.innerHTML = "";

    // pinned first
    pinnedPosts.forEach(row => topicList.appendChild(row));

    // non-pinned
    nonPinnedPosts.forEach(row => {
      const eventDate = getEventDate(row);
      if (!eventDate) return;
      const formattedDate = formatDateWithOrdinal(eventDate);

      if (formattedDate !== lastDate) {
        lastDate = formattedDate;
        const sepRow = document.createElement("tr");
        sepRow.classList.add("agenda-separator");
        sepRow.innerHTML = `<td>${formattedDate}</td>`;
        topicList.appendChild(sepRow);
      }

      const eventTitle = row.querySelector(".title.raw-link.raw-topic-link");
      if (!eventTitle) return;

      const { info, speaker, location } = parseExcerptData(row);
      if (info && !row.dataset.infoSplit) {
        const infoElem = document.createElement("div");
        infoElem.classList.add("agenda-info-line");
        infoElem.style.fontSize = "14px";
        infoElem.style.color = "#666";
        infoElem.style.marginTop = "4px";
        infoElem.textContent = info;
        eventTitle.appendChild(infoElem);
        row.dataset.infoSplit = "true";
      }
      if (speaker && !row.dataset.speakerSplit) {
        const speakerElem = document.createElement("div");
        speakerElem.classList.add("agenda-speaker-line");
        speakerElem.style.fontSize = "14px";
        speakerElem.style.color = "#666";
        speakerElem.style.marginTop = "4px";
        speakerElem.textContent = "Speaker: " + speaker;
        eventTitle.appendChild(speakerElem);
        row.dataset.speakerSplit = "true";
      }
      if (location && !row.dataset.locationSplit) {
        const locationElem = document.createElement("div");
        locationElem.classList.add("agenda-location-line");
        locationElem.style.fontSize = "14px";
        locationElem.style.color = "#666";
        locationElem.style.marginTop = "4px";
        locationElem.textContent = "Location: " + location;
        eventTitle.appendChild(locationElem);
        row.dataset.locationSplit = "true";
      }

      applyHighlighting(row, eventTitle.textContent.toLowerCase());
      topicList.appendChild(row);
    });

    // Time-only display
    document.querySelectorAll(".topic-list-item-event .date").forEach((el) => {
      if (el.nextElementSibling && el.nextElementSibling.classList.contains("time-only-display")) {
        return; // already done
      }
      const parts = el.textContent.trim().split(",");
      if (parts.length > 1) {
        const timePart = parts.slice(1).join(",").trim();
        const timeSpan = document.createElement("span");
        timeSpan.classList.add("time-only-display");
        timeSpan.textContent = timePart;
        el.insertAdjacentElement("afterend", timeSpan);
      }
    });

    processingInProgress = false;
    observeTopicListChanges();
  });
}

// Observe for infinite scroll once we’re on the agenda
function observeTopicListChanges() {
  if (topicListObserver) {
    topicListObserver.disconnect();
  }
  const topicListBody = document.querySelector("tbody.topic-list-body");
  if (!topicListBody) return;

  topicListObserver = new MutationObserver((mutations) => {
    let newRowsDetected = false;
    for (const m of mutations) {
      if (m.type === "childList" && m.addedNodes.length > 0) {
        newRowsDetected = true;
        break;
      }
    }
    if (newRowsDetected) {
      logDebug("🆕 New rows detected (lazy load), reprocessing...");
      processAgendaEvents();
    }
  });
  topicListObserver.observe(topicListBody, { childList: true });
}

// ----------------------------------------------------
//  Run ONLY if current page EXACTLY matches /c/agenda/43
// ----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  if (!window.location.pathname.startsWith(TARGET_PATH)) {
    logDebug("This page is not " + TARGET_PATH + ", skipping script.");
    return;
  }

  logDebug("🚀 Agenda script: page matches " + TARGET_PATH);
  observeTopicListChanges();
  processAgendaEvents();
});
{/* </script> */}
