{/* <script type="text/discourse-plugin" version="0.8"> */}
// Force a full page reload when ENTERING or LEAVING /c/agenda/43
withPluginApi("0.8.31", (api) => {
  const AGENDA_PATH = "/c/agenda/43";
  let lastPath = window.location.pathname;

  api.onPageChange((newUrl) => {
    // If we're NOT on agenda, but newUrl includes it => user is ENTERING agenda
    if (!lastPath.includes(AGENDA_PATH) && newUrl.includes(AGENDA_PATH)) {
      console.log("[Agenda] Forcing full reload because user is ENTERING", AGENDA_PATH);
      window.location = newUrl;
      return;
    }
    // If lastPath includes agenda but newUrl doesn't => user is LEAVING agenda
    if (lastPath.includes(AGENDA_PATH) && !newUrl.includes(AGENDA_PATH)) {
      console.log("[Agenda] Forcing full reload because user left", AGENDA_PATH);
      window.location = newUrl;
      return;
    }
    // Update lastPath for next route change
    lastPath = window.location.pathname;
  });
});

// Existing Agenda logic (unchanged, except we removed the old routeObserver).

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
      matchedRule = rule;
      break;
    }
  }
  if (matchedRule) {
    row.classList.add(matchedRule.cssClass);

      if (rule.removeExcerpt) {
        const excerptDiv = row.querySelector("div[style*='font-size: 14px; color: rgb(102, 102, 102); margin-top: 4px;']");
        if (excerptDiv) excerptDiv.remove();
      const thumbnailDiv = row.querySelector(".topic-list-thumbnail");
      }
    }
    if (matchedRule.removeExcerpt) {
      const excerptDiv = row.querySelector("div[style*='font-size: 14px; color: rgb(102, 102, 102); margin-top: 4px;']");
      if (excerptDiv) excerptDiv.remove();
    }
  }
}

function isInsidePABSConference() {
  const categoryDropdown = document.querySelector('.select-kit-selected-name .badge-category__name');
  return categoryDropdown && categoryDropdown.textContent.trim() === "PABS conference";
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

  // Temporarily disconnect topicListObserver to avoid re-triggering
  if (topicListObserver) {
    topicListObserver.disconnect();
  }

  runAfterEmberRender(() => {
    if (!isInsidePABSConference()) {
      logWarning("⚠️ Not inside PABS conference. Continuing without processing...");
      processingInProgress = false;
      observeTopicListChanges();
      return;
    }

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

    // Hide the default topic excerpt
    topicList.querySelectorAll(".topic-excerpt").forEach(excerpt => {
      excerpt.style.display = "none";
    });

    let lastDate = null;
    let firstDate = null;
    let pinnedPosts = [];
    let nonPinnedPosts = [];

    topicList.querySelectorAll("tr.topic-list-item").forEach(row => {
      if (row.classList.contains("pinned")) pinnedPosts.push(row);
      else nonPinnedPosts.push(row);
    });

    function parseEventDate(dateText) {
      let cleanedDate = dateText.split(",")[0].trim();
      let dateMatch = cleanedDate.match(/\b(\d{1,2})[-\/](\d{1,2})\b/);

      if (dateMatch) {
        const [_, month, day] = dateMatch;
        const currentYear = new Date().getFullYear();
        let parsedDate = new Date(Date.UTC(currentYear, month - 1, day, 5, 0, 0));
        if (isNaN(parsedDate.getTime())) {
          logWarning(`⚠️ Date parsing failed for: "${dateText}"`);
          return null;
        }
        return parsedDate;
      }
      logWarning(`⚠️ No valid date found in text: "${dateText}"`);
      return null;
    }

    function getEventDate(row) {
      const eventDateElement = row.querySelector(".event-label .date");
      return eventDateElement ? parseEventDate(eventDateElement.textContent.trim()) : null;
    }

    function formatDateWithOrdinal(date) {
      if (!date) return "Invalid Date";
      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

      let dayOfWeek = dayNames[date.getUTCDay()];
      let day = date.getUTCDate();
      let month = monthNames[date.getUTCMonth()];
      let suffix = "th";
      if (day % 10 === 1 && day !== 11) suffix = "st";
      else if (day % 10 === 2 && day !== 12) suffix = "nd";
      else if (day % 10 === 3 && day !== 13) suffix = "rd";

      return `${dayOfWeek}, ${month} ${day}${suffix}`;
    }

    // Clear the table and rebuild
    topicList.innerHTML = "";

    // Pinned first
    pinnedPosts.forEach(row => topicList.appendChild(row));

    // Then non-pinned
    nonPinnedPosts.forEach(row => {
      const eventDate = getEventDate(row);
      if (!eventDate) return;

      const formattedDate = formatDateWithOrdinal(eventDate);
      if (!firstDate) {
        firstDate = formattedDate;
      }

      if (lastDate !== formattedDate) {
        lastDate = formattedDate;
        const separatorRow = document.createElement("tr");
        separatorRow.classList.add("agenda-separator");
        separatorRow.innerHTML = `<td>${formattedDate}</td>`;
        topicList.appendChild(separatorRow);
      }

      const eventTitle = row.querySelector(".title.raw-link.raw-topic-link");
      if (!eventTitle) return;

      // Parse excerpt lines
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

    // Create a visible time-only display after hiding .date
    document.querySelectorAll(".topic-list-item-event .date").forEach(el => {
      if (el.nextElementSibling && el.nextElementSibling.classList.contains("time-only-display")) {
        return; // Already added
      }
      const fullText = el.textContent.trim();
      const parts = fullText.split(",");
      if (parts.length > 1) {
        const timePart = parts.slice(1).join(",").trim();
        const timeOnlySpan = document.createElement("span");
        timeOnlySpan.classList.add("time-only-display");
        timeOnlySpan.textContent = timePart;
        el.insertAdjacentElement("afterend", timeOnlySpan);
      }
    });

    processingInProgress = false;
    observeTopicListChanges();
  });
}

// Mutation observer for newly added rows (infinite scroll)
function observeTopicListChanges() {
  if (topicListObserver) {
    topicListObserver.disconnect();
  }
  const topicListBody = document.querySelector("tbody.topic-list-body");
  if (!topicListBody) return;

  topicListObserver = new MutationObserver((mutations) => {
    let newRowsDetected = false;
    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
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

document.addEventListener("DOMContentLoaded", function () {
  logDebug("🚀 Agenda Processing Script Loaded!");
  observeTopicListChanges();
  processAgendaEvents();
});
{/* </script> */}
