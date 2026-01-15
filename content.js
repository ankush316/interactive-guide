(async function () {
  // Prevent double injection
  if (window.__GUIDE_LOADED__) return;
  window.__GUIDE_LOADED__ = true;
  let __guideAllowUnload = false;

  const GUIDE_STORAGE_KEY = "__guide_state__";
  const GUIDE_STALE_TIME = 10 * 60 * 1000; // 10 minutes
  
  async function loadTask(path) {
    try {
      const url = chrome.runtime.getURL(path);
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return await res.json();
    } catch (err) {
      console.error("❌ Failed to load task:", path, err);
      return null;
    }
  }

  let interactionLockCleanup = null;

  function lockInteractions(allowedElement) {
    unlockInteractions(); // safety
  
    document.body.classList.add("__guide-locked");
  
    const handler = e => {
      if (allowedElement && allowedElement.contains(e.target)) return;
      if (currentTooltip && currentTooltip.contains(e.target)) return;
      if (chatbot.contains(e.target)) return;
  
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    };
  
    const keyHandler = e => {
      if (
        allowedElement &&
        (allowedElement === document.activeElement ||
          allowedElement.contains(document.activeElement))
      ) return;
  
      if (e.key === "Escape") return;
  
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
  
    document.addEventListener("click", handler, true);
    document.addEventListener("mousedown", handler, true);
    document.addEventListener("mouseup", handler, true);
    document.addEventListener("pointerdown", handler, true);
    document.addEventListener("keydown", keyHandler, true);
  
    interactionLockCleanup = () => {
      document.removeEventListener("click", handler, true);
      document.removeEventListener("mousedown", handler, true);
      document.removeEventListener("mouseup", handler, true);
      document.removeEventListener("pointerdown", handler, true);
      document.removeEventListener("keydown", keyHandler, true);
  
      document.body.classList.remove("__guide-locked");
    };
  }

  function cancelGuide(reason = "cancelled") {
  
    if (activeListenerCleanup) {
      activeListenerCleanup();
      activeListenerCleanup = null;
    }
  
    clearHighlight();
    steps = [];
    currentStepIndex = 0;
  
    clearGuideState();
  
    addMessage("❌ Guide cancelled. You can continue normally.");
    document.removeEventListener("keydown", escKeyHandler, true);
  }
  

  function escKeyHandler(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelGuide("escape_key");
    }
  }
  

  function unlockInteractions() {
    if (interactionLockCleanup) {
      interactionLockCleanup();
      interactionLockCleanup = null;
    }
  
    document.body.classList.remove("__guide-locked"); // safety
  }

  if (document.getElementById("my-chatbot")) {
    console.warn("Chatbot already injected");
    return;
  }

  // Create chatbot container
  const chatbot = document.createElement("div");
  chatbot.id = "my-chatbot";

  chatbot.innerHTML = `
    <div id="my-chatbot-header">
      <span>Need Help?</span>
      <span id="cancel-guide" style="float:right;cursor:pointer" title="Cancel guide">X</span>
      <span id="toggle" style="float:right;cursor:pointer;margin-right:10px" title="Toggle chatbot">__</span>
      
    </div>
    <div id="my-chatbot-messages"></div>
    <div id="my-chatbot-input">
      <input type="text" placeholder="Type a message..." />
      <button id="send-button">Send</button>
    </div>
  `;

  const cancelBtn = chatbot.querySelector("#cancel-guide");

  
  cancelBtn.addEventListener("click", () => {
    cancelGuide("button_click");
  });

  
  document.body.appendChild(chatbot);
  
  const messagesDiv = chatbot.querySelector("#my-chatbot-messages");
  const input = chatbot.querySelector("input");
  const button = chatbot.querySelector("#send-button");
  const toggle = chatbot.querySelector("#toggle");

  messagesDiv.style.flex = "1";
  messagesDiv.style.overflowY = "auto";
  messagesDiv.style.padding = "10px";

  chatbot.addEventListener("click", e => e.stopPropagation());

  function addMessage(text) {
    const div = document.createElement("div");
    div.textContent = text;
    div.style.marginBottom = "6px";
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function findElement(selectors) {
    console.log("trying to find element", selectors);
    for (const group of selectors || []) {
      for (const selector of group) {
        try {
          const el = document.querySelector(selector);
          if (el) return el;
        } catch (_) {}
      }
    }
    return null;
  }

  let currentTooltip = null;
  let currentEl = null;

  let overlay;

  window.addEventListener("scroll", () => {
    if (currentEl) showSpotlight(currentEl);
  });

  function showSpotlight(el) {
    if (overlay) overlay.remove();

    overlay = document.createElement("div");
    overlay.className = "__guide-overlay";

    const hole = document.createElement("div");
    hole.className = "__guide-hole";

    const r = el.getBoundingClientRect();
    hole.style.top = `${r.top - 6}px`;
    hole.style.left = `${r.left - 6}px`;
    hole.style.width = `${r.width + 12}px`;
    hole.style.height = `${r.height + 12}px`;

    overlay.appendChild(hole);
    document.body.appendChild(overlay);
  }

  function highlight(el, label = "") {
    if (!el || !el.isConnected) return;

    currentEl = el;
    document
      .querySelectorAll(".__guide-focus")
      .forEach(e => e.classList.remove("__guide-focus"));

    if (currentTooltip) {
      currentTooltip.remove();
      currentTooltip = null;
    }
    
    showSpotlight(el);

    el.classList.add("__guide-focus");

    lockInteractions(el);
    if (!label) return;

    const rect = el.getBoundingClientRect();
    const tooltip = document.createElement("div");
    tooltip.className = "__guide-tooltip";
    
    tooltip.innerHTML = `
      <div class="__guide-tooltip-text">${label}</div>
      <div class="__guide-tooltip-actions">
        <button class="__guide-prev">◀ Prev</button>
        <button class="__guide-next">Next ▶</button>
      </div>
    `;

    document.body.appendChild(tooltip);

    const tRect = tooltip.getBoundingClientRect();
    const margin = 10;
    const offset = 12; 
    let top = rect.top - tRect.height - margin - offset;
    let place = "top";

    if (top < margin) {
      top = rect.bottom + margin + offset;
      place = "bottom";
    }

    let left = rect.left + rect.width / 2 - tRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - tRect.width - margin));

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;

    tooltip.style.setProperty("--arrow-pos", place);

    const arrow = document.createElement("div");
    arrow.style.position = "absolute";
    arrow.style.left = "50%";
    arrow.style.transform = "translateX(-50%)";

    if (place === "top") {
      arrow.style.bottom = "-6px";
      arrow.style.borderLeft = "6px solid transparent";
      arrow.style.borderRight = "6px solid transparent";
      arrow.style.borderTop = "6px solid #4f46e5";
    } else {
      arrow.style.top = "-6px";
      arrow.style.borderLeft = "6px solid transparent";
      arrow.style.borderRight = "6px solid transparent";
      arrow.style.borderBottom = "6px solid #4f46e5";
    }

    tooltip.appendChild(arrow);
    tooltip.querySelector(".__guide-next")?.addEventListener("click", e => {
      e.stopPropagation();
      nextStep();
    });
    
    tooltip.querySelector(".__guide-prev")?.addEventListener("click", e => {
      e.stopPropagation();
      prevStep();
    });
    currentTooltip = tooltip;
  }

  window.addEventListener("beforeunload", e => {
    if (__guideAllowUnload) return;
    cancelGuide("page_unload");
    e.preventDefault();
    e.returnValue = 'Guide in progress. Are you sure you want to leave?';
  });

  window.addEventListener("load", () => {
    __guideAllowUnload = false;
  });
  
  function advance() {
    if (!steps.length) return;

    clearHighlight();
    addMessage('hre')
    currentStepIndex++;
    saveGuideState({ stepIndex: currentStepIndex });
    runNextStep();
  }

  function clearHighlight() {
    currentEl = null;
    document
      .querySelectorAll(".__guide-dotted, .__guide-focus, .__guide-animate")
      .forEach(el => {
        el.classList.remove("__guide-dotted", "__guide-focus", "__guide-animate");
        el.style.position = "";
        el.style.zIndex = "";
      });
  
    if (currentTooltip) {
      currentTooltip.remove();
      currentTooltip = null;
    }
  
    const overlay = document.querySelector(".__guide-overlay");
    if (overlay) overlay.remove();
  
    unlockInteractions();
  
    document
      .querySelectorAll(".__guide-hole")
      .forEach(el => el.remove());
  }
  
  let steps = [];
  let currentStepIndex = 0;
  let activeListenerCleanup = null;

  window.addEventListener("load", async () => {
    __guideAllowUnload = false;
  
    const restored = await restoreGuideState();
    if (restored) {
      await new Promise(r => setTimeout(r, 700));
      runNextStep();
    }
  });

  function saveGuideState(extra = {}) {
    if (!steps.length) return;
    chrome.storage.local.set({
      [GUIDE_STORAGE_KEY]: {
        active: true,
        stepIndex: currentStepIndex,
        steps,
        origin: location.origin,
        url: location.href,
        timestamp: Date.now(),
        ...extra
      }
    });
  }

  async function restoreGuideState() {
    const data = await chrome.storage.local.get(GUIDE_STORAGE_KEY);
    const state = data[GUIDE_STORAGE_KEY];
    if (!state || !state.active) return false;
  
    if (Date.now() - state.timestamp > GUIDE_STALE_TIME) {
      await clearGuideState();
      return false;
    }

    const sameAadhaarFlow =
      location.hostname.endsWith("uidai.gov.in") &&
      new URL(state.origin).hostname.endsWith("uidai.gov.in");

    if (!sameAadhaarFlow) return false;
  
    
    steps = state.steps;
    currentStepIndex = state.stepIndex;
    addMessage("🤖 Resuming guide from previous step.");
    document.addEventListener("keydown", escKeyHandler, true);
    return true;
  }


  async function clearGuideState() {
    await chrome.storage.local.remove(GUIDE_STORAGE_KEY);
  }



  (function patchHistory() {
    ["pushState", "replaceState"].forEach(fn => {
      const original = history[fn];
      history[fn] = function () {
        const result = original.apply(this, arguments);
        window.dispatchEvent(new Event("spa:navigation"));
        return result;
      };
    });
  
    window.addEventListener("popstate", () => {
      window.dispatchEvent(new Event("spa:navigation"));
    });
  })();


  window.addEventListener("spa:navigation", async () => {
    if (steps.length === 0) return;
    saveGuideState();
    __guideAllowUnload = false; // reset for new page
    setTimeout(runNextStep, 500); // increased delay for SPA hydration
  });
  

  function waitForClick(el, step) {
    
    const handler = e => {
      if (!el.contains(e.target)) return;

      if (step?.allowNavigation) {
        __guideAllowUnload = true;
      }

      setTimeout(advance, 100); // small delay to allow navigation if needed
    };
  
    document.addEventListener("click", handler, true);
  
    return () => {
      document.removeEventListener("click", handler, true);
    };
  }


  function waitForInput(el) {
    
    let timeout;
  
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        advance();
      }, 1000); 
    };
  
    el.addEventListener("input", handler, true);
    el.addEventListener("change", handler, true);
  
    return () => {
      clearTimeout(timeout);
      el.removeEventListener("input", handler, true);
      el.removeEventListener("change", handler, true);
    };
  
  }

  async function runNextStep() {
    
    if (activeListenerCleanup) {
      activeListenerCleanup();
      activeListenerCleanup = null;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));

  
    if (currentStepIndex >= steps.length) {
    
      clearHighlight();
      
      clearGuideState();
      document.removeEventListener("keydown", escKeyHandler, true);
      return;
    
    }
  
    const step = steps[currentStepIndex];
    
    
    let el = null;
    for (let i = 0; i < 20; i++) { // increased retries
      el = findElement(step.selectors);
      if (el) break; 
      await new Promise(resolve => setTimeout(resolve, 300)); 
    }
  
    if (!el) {
   
      return;
    }
  
    highlight(el, step.label || "");
  
    if (step.type === "click") activeListenerCleanup = waitForClick(el, step);
    if (step.type === "change") activeListenerCleanup = waitForInput(el);
  }

  window.helpUserFromJSON = function (json) {
    if (!json || !Array.isArray(json.steps)) {
      console.error("Invalid guide JSON");
      return;
    }

    steps = json.steps;
    currentStepIndex = 0;
    saveGuideState({ stepIndex: 0 });

    document.addEventListener("keydown", escKeyHandler, true);
    runNextStep();
  };



  function nextStep() {
    if (currentStepIndex < steps.length - 1) {
      const step = steps[currentStepIndex];
      if (!step) return;
    
      const { type, allowNavigation, selectors } = step;
    
      // 🔹 CASE 1: Click + navigation allowed
      if (type === "click" && allowNavigation) {
        const el = findElement(selectors);
        if (!el) {
          console.warn("Element not found for step", currentStepIndex);
          return;
        }
    
        // Save NEXT step index before navigation
        saveGuideState({ stepIndex: currentStepIndex + 1 });
    
        // Let the browser navigate naturally
        el.click();
      }else{
        currentStepIndex++;
        saveGuideState({ stepIndex: currentStepIndex });
        runNextStep();
      }
    }
  
    
  }
  
  function prevStep() {
    if (currentStepIndex > 0) {
      currentStepIndex--;
      saveGuideState({ stepIndex: currentStepIndex });
      runNextStep();
    }
  }


  // Load tasks
  const login = await loadTask("tasks/aadhar/login-aadhar.json");
  const changeLanguage = await loadTask("tasks/aadhar/change-language.json");
  const downloadAadhar = await loadTask("tasks/aadhar/download-aadhar.json")  
  const retrieveAadharNumber = await loadTask("tasks/aadhar/retrieve-aadhar-number.json");
  const verifyEmailOrMobile = await loadTask("tasks/aadhar/verify-email-or-mobile.json");
  const reportDeathOfFamilyMember = await loadTask("tasks/aadhar/report-death-of-a-family-member.json");
  const generateVID = await loadTask("tasks/aadhar/generate-vid.json");
  const updateDocument = await loadTask("tasks/aadhar/update-document.json");
  const checkBankSeedingStatus = await loadTask("tasks/aadhar/bank-seeding.json");
  const lockUnlockAadhar = await loadTask("tasks/aadhar/lock-unlock-aadhar.json");
  const checkEnrolmentStatus = await loadTask("tasks/aadhar/check-enrolment-status.json");
  const checkPvcStatus = await loadTask("tasks/aadhar/check-pvc-card-status.json");
  const checkDeceasedAadharDeactivationStatus = await loadTask("tasks/aadhar/check-deceased-aadhar-deactivation-status.json");
  const locateEnrolmentNumber = await loadTask("tasks/aadhar/locate-enrolment-number.json");
  const checkValidity = await loadTask("tasks/aadhar/check-aadhar-validity.json");
  const checkGrievance = await loadTask("tasks/aadhar/check-grievance.json");
  const reportGrievance = await loadTask("tasks/aadhar/report-grievance.json");
  const bookAppointment = await loadTask("tasks/aadhar/book-appointment.json");

  const addContact = await loadTask("tasks/pipedrive/add-contact-pipedrive.json");
  const addOrg = await loadTask("tasks/pipedrive/add-organisation-pipedrive.json");
  const importData = await loadTask("tasks/pipedrive/import-data.json");
  const exportData = await loadTask("tasks/pipedrive/export-data.json");
  const importPeopleData = await loadTask("tasks/pipedrive/import-people-data.json");
  const importOrganisationData = await loadTask("tasks/pipedrive/import-organisation-data.json");
  const addLead = await loadTask("tasks/pipedrive/add-lead.json");
  const addDeal = await loadTask("tasks/pipedrive/add-deal.json");
  const importLeads = await loadTask("tasks/pipedrive/import-leads.json");
  const importDeals = await loadTask("tasks/pipedrive/import-deals.json");

  const aadharTasks = [login, changeLanguage, downloadAadhar, retrieveAadharNumber, verifyEmailOrMobile, reportDeathOfFamilyMember, generateVID, updateDocument, checkBankSeedingStatus, lockUnlockAadhar, checkEnrolmentStatus, checkPvcStatus, checkDeceasedAadharDeactivationStatus, locateEnrolmentNumber, checkValidity, checkGrievance, reportGrievance, bookAppointment].filter(Boolean);
  const pipedriveTasks = [addContact, addOrg, importData, exportData, importPeopleData, importOrganisationData, addLead, addDeal, importLeads, importDeals].filter(Boolean);

  let currentTasks = [];

  if (location.hostname.includes('uidai.gov.in') || location.hostname.includes('myaadhaar.uidai.gov.in')) {
    currentTasks = aadharTasks;
  } else if (location.hostname.includes('pipedrive.com')) {
    currentTasks = pipedriveTasks;
  }

  if (currentTasks.length > 0) {
  } else {
    addMessage("No guides available for this site.");
  }

  function sendMessage() {
    const value = input.value.trim();
    if (!value) return;

    addMessage("You: " + value);

    input.value = "";

    if (currentTasks.length === 0) {
      addMessage("No guides available here.");
      return;
    }

    const matching = currentTasks.filter(t => t.title && t.title.toLowerCase().includes(value.toLowerCase()));

    if (matching.length === 0) {
      addMessage("No matching guide found. Try typing part of the title.");
    } else if (matching.length > 1) {
      addMessage("Multiple matches: " + matching.map(t => t.title).join(", "));
    } else {
      const selected = matching[0];
      addMessage("Starting: " + selected.title);
      window.helpUserFromJSON(selected);
    }
  }

  button.addEventListener("click", sendMessage);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") sendMessage();
  });

  toggle.addEventListener("click", () => {
    chatbot.style.display = chatbot.style.display === "none" ? "flex" : "none";
  });

})();