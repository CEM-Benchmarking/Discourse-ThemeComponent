<script type="text/discourse-plugin" version="0.8">
  const DEBUG_MODE = true; // Toggle logging on/off
  const MAX_RETRIES = 5;
  const CHECK_INTERVAL = 500;
  let retryCount = 0;
  let processingInProgress = false;
  let lastRunTime = 0;
  const cooldownTime = 1000;

  let routeObserver = null;
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
      { keyword: "Optional", cssClass: "optional-event", hideThumbnail: false, removeSubtitle: false }
    ];

    let matchedRule = null;

    for (let rule of highlightRules) {
      if (titleText.includes(rule.keyword.toLowerCase())) {
        matchedRule = rule;
        break;
      }
    }

    if (matchedRule) {
      row.classList.add(matchedRule.cssClass);

      // Hide the thumbnail if specified
      if (matchedRule.hideThumbnail) {
        const thumbnailDiv = row.querySelector(".topic-list-thumbnail");
        if (thumbnailDiv) {
          thumbnailDiv.style.display = "none";
        }
      }

      // Remove the excerpt if required
      if (matchedRule.removeExcerpt) {
        const excerptDiv = row.querySelector("div[style*='font-size: 14px; color: rgb(102, 102, 102); margin-top: 4px;']");
        if (excerptDiv) {
          excerptDiv.remove();
        }
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

    // Split into trimmed lines, remove empty ones
    const lines = excerptDiv.textContent
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);

    // Default return object
    const data = {
      info: null,
      speaker: null,
      location: null
    };

    // Look for lines that start with INFO:, SPEAKER:, LOCATION:
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

    // Simple cooldown to prevent re-triggering too frequently
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

      // Hide the default topic excerpt (so we can re-inject a trimmed version)
      topicList.querySelectorAll(".topic-excerpt").forEach(excerpt => {
        excerpt.style.display = "none";
      });

      let lastDate = null;
      let firstDate = null;

      let pinnedPosts = [];
      let nonPinnedPosts = [];

      topicList.querySelectorAll("tr.topic-list-item").forEach(row => {
        if (row.classList.contains("pinned")) {
          pinnedPosts.push(row);
        } else {
          nonPinnedPosts.push(row);
        }
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

        let ordinalSuffix = "th";
        if (day % 10 === 1 && day !== 11) ordinalSuffix = "st";
        else if (day % 10 === 2 && day !== 12) ordinalSuffix = "nd";
        else if (day % 10 === 3 && day !== 13) ordinalSuffix = "rd";

        return `${dayOfWeek}, ${month} ${day}${ordinalSuffix}`;
      }

      function extractFirstLine(row) {
        const postExcerpt = row.querySelector(".topic-excerpt");
        if (!postExcerpt) return null;

        const firstLine = postExcerpt.textContent
          .split("\n")
          .map(line => line.trim())
          .find(line => line.length > 0);

        return firstLine ? firstLine.substring(0, 120) : null; // Limit to 120 chars
      }

      // Clear the table and rebuild
      topicList.innerHTML = "";

      // Pinned posts first
      pinnedPosts.forEach(row => topicList.appendChild(row));

      // Then non-pinned posts
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
          separatorRow.innerHTML = `
            <td>
              ${formattedDate}
            </td>
          `;
          topicList.appendChild(separatorRow);
        }

        const eventTitle = row.querySelector(".title.raw-link.raw-topic-link");
        if (!eventTitle) return;

        // ---- EXTRACT INFO, SPEAKER, LOCATION ----
        const { info, speaker, location } = parseExcerptData(row);

        // (A) If we want to display the info line, but only if it hasn't been added yet
        if (info && !row.dataset.infoSplit) {
          const infoElem = document.createElement("div");
          infoElem.classList.add("agenda-info-line");
          infoElem.style.fontSize = "14px";
          infoElem.style.color = "#666";
          infoElem.style.marginTop = "4px";
          infoElem.textContent = info;
          eventTitle.appendChild(infoElem);

          row.dataset.infoSplit = "true"; // Mark as processed
        }

        // (B) If we want a speaker line, but only if it hasn't been added yet
        if (speaker && !row.dataset.speakerSplit) {
          const speakerElem = document.createElement("div");
          speakerElem.classList.add("agenda-speaker-line");
          speakerElem.style.fontSize = "14px";
          speakerElem.style.color = "#666";
          speakerElem.style.marginTop = "4px";
          speakerElem.textContent = "Speaker: " + speaker;
          eventTitle.appendChild(speakerElem);

          row.dataset.speakerSplit = "true"; // Mark as processed
        }

        // (C) If we want a location line, but only if it hasn't been added yet
        if (location && !row.dataset.locationSplit) {
          const locationElem = document.createElement("div");
          locationElem.classList.add("agenda-location-line");
          locationElem.style.fontSize = "14px";
          locationElem.style.color = "#666";
          locationElem.style.marginTop = "4px";
          locationElem.textContent = "Location: " + location;
          eventTitle.appendChild(locationElem);

          row.dataset.locationSplit = "true"; // Mark as processed
        }

        // Apply highlight classes (break-event, optional-event, etc.)
        if (eventTitle) {
          applyHighlighting(row, eventTitle.textContent.toLowerCase());
        }

        topicList.appendChild(row);
      });

      // Create a visible time-only display for each date
      document.querySelectorAll(".topic-list-item-event .date").forEach(el => {
        // If the very next element is already .time-only-display, skip
        if (el.nextElementSibling && el.nextElementSibling.classList.contains("time-only-display")) {
          return; // Already processed this post
        }

        // Otherwise, insert the new time-only span
        const fullText = el.textContent.trim(); // "5-6, 09:00 – 09:05"
        const parts = fullText.split(",");
        if (parts.length > 1) {
          const timePart = parts.slice(1).join(",").trim(); // "09:00 – 09:05"

          const timeOnlySpan = document.createElement("span");
          timeOnlySpan.classList.add("time-only-display");
          timeOnlySpan.textContent = timePart;

          // Insert new span after the hidden .date element
          el.insertAdjacentElement("afterend", timeOnlySpan);
        }
      });

      processingInProgress = false;
      observeTopicListChanges();
    });
  }

  function observeRouteChanges() {
    if (routeObserver) {
      routeObserver.disconnect();
    }

    let lastUrl = location.href;

    routeObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        logDebug("🔄 Route change detected, reapplying styles...");
        processAgendaEvents();
      }
    });

    routeObserver.observe(document.body, { childList: true, subtree: true });
  }

  function observeTopicListChanges() {
    if (topicListObserver) {
      topicListObserver.disconnect();
    }

    const topicListBody = document.querySelector("tbody.topic-list-body");
    if (!topicListBody) {
      return;
    }

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
    observeRouteChanges();
    observeTopicListChanges();
    processAgendaEvents();
  });
</script>