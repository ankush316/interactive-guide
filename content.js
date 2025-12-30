
(async function () {
  // Prevent double injection
  if (window.__GUIDE_LOADED__) return;
  window.__GUIDE_LOADED__ = true;

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
  
    document.body.classList.add("__guide-locked"); // ✅ ADD HERE
  
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
  
      document.body.classList.remove("__guide-locked"); // 🔓 REMOVE HERE
    };
  }

  function cancelGuide(reason = "cancelled") {
    console.log("🛑 Guide cancelled:", reason);
  
    // Cleanup listeners
    if (activeListenerCleanup) {
      activeListenerCleanup();
      activeListenerCleanup = null;
    }
  
    // Clear UI state
    clearHighlight();
  
    // Reset steps
    steps = [];
    currentStepIndex = 0;
  
    // Optional user feedback
    addMessage("❌ Guide cancelled. You can continue normally.");
  
    // Remove ESC listener (important)
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

  let selectedJson = {};
  if (document.getElementById("my-chatbot")) {
    

    console.warn("Chatbot already injected");
    return;
  }

  console.log("✅ Content script initialized");

  // Create chatbot container
  const chatbot = document.createElement("div");
  chatbot.id = "my-chatbot";

  chatbot.innerHTML = `
    <div id="my-chatbot-header">
      <span>Need Help?</span>
      <button id="cancel-guide" title="Cancel guide">✕</button>
      <span id="toggle" style="float:right;cursor:pointer">—</span>
    </div>
    <div id="my-chatbot-messages"></div>
    <div id="my-chatbot-input">
      <input type="text" placeholder="Type a message..." />
      <button>Send</button>
    </div>
  `;

  const cancelBtn = chatbot.querySelector("#cancel-guide");

  
  cancelBtn.addEventListener("click", () => {
    cancelGuide("button_click");
  });

  
  document.body.appendChild(chatbot);
  
  const messagesDiv = chatbot.querySelector("#my-chatbot-messages");
  const input = chatbot.querySelector("input");
  const button = chatbot.querySelector("button");
  const toggle = chatbot.querySelector("#toggle");

  messagesDiv.style.flex = "1";
  messagesDiv.style.overflowY = "auto";
  messagesDiv.style.padding = "8px";

  chatbot.addEventListener("click", e => e.stopPropagation());

  function addMessage(text) {
    const div = document.createElement("div");
    div.textContent = text;
    div.style.marginBottom = "6px";
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function describeStep(step) {
    switch (step.type) {
      case "navigate": return `Go to ${step.url}`;
      case "click": return `Click this element`;
      case "change": return `Type "${step.value}"`;
      case "keyDown": return `Press ${step.key}`;
      default: return `Perform ${step.type}`;
    }
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

  function highlight(el, label = "") {
    if (!el || !el.isConnected) return;

    // Cleanup previous state
    document
      .querySelectorAll(".__guide-dotted")
      .forEach(e => e.classList.remove("__guide-dotted"));

    if (currentTooltip) {
      currentTooltip.remove();
      currentTooltip = null;
    }

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("__guide-dotted");
    lockInteractions(el); // 🔥 THIS IS THE KEY
    if (!label) return;

    const rect = el.getBoundingClientRect();
    const tooltip = document.createElement("div");
    tooltip.className = "__guide-tooltip";
    tooltip.textContent = label;

    document.body.appendChild(tooltip);

    const tRect = tooltip.getBoundingClientRect();
    const margin = 8;

    // Try ABOVE first
    let top = rect.top - tRect.height - margin;
    let place = "top";

    // If not enough space, place BELOW
    if (top < margin) {
      top = rect.bottom + margin;
      place = "bottom";
    }

    let left = rect.left + rect.width / 2 - tRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - tRect.width - margin));

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;

    // Arrow
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
    currentTooltip = tooltip;
  }
  window.addEventListener("beforeunload", () => {
    cancelGuide("page_unload");
  });
  function advance() {
    if (!steps.length) return; // cancelled already

    clearHighlight();
    currentStepIndex++;
    runNextStep();
  }
  function clearHighlight() {
      unlockInteractions(); // 🔓 unlock page

    document
      .querySelectorAll(".__guide-dotted")
      .forEach(e => e.classList.remove("__guide-dotted"));

    if (currentTooltip) {
      currentTooltip.remove();
      currentTooltip = null;
    }
  }
  let steps = [];
  let currentStepIndex = 0;
  let activeListenerCleanup = null; // Add this line
  window.addEventListener("DOMContentLoaded", async () => {
    const restored = restoreGuideState();
    if (restored) {
      await new Promise(r => setTimeout(r, 300)); // allow UI to settle
      runNextStep();
    }
  });

  function clearGuideState() {
    sessionStorage.removeItem("__guide_state__");
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

  window.addEventListener("spa:navigation", () => {
    saveGuideState();
    setTimeout(runNextStep, 300);
  });
  

  if (!steps) {
    clearHighlight();
    clearGuideState();
    return;
  }
  function restoreGuideState() {
    const raw = sessionStorage.getItem("__guide_state__");
    if (!raw) return false;
  
    try {
      const state = JSON.parse(raw);
      steps = state.steps;
      currentStepIndex = state.stepIndex;
      return true;
    } catch {
      return false;
    }
  }
  function waitForClick(el) {
    const handler = e => {
      // Ensure correct element (or inside it)
      if (el.contains(e.target)) {
        saveGuideState();

        advance();
      }
    };
  
    document.addEventListener("click", handler, true);
  
    // Cleanup function
    return () => {
      document.removeEventListener("click", handler, true);
    };
  }


  function waitForInput(el) {
    let timeout;
  
    const handler = e => {
      if (e.target === el) {
        // Clear the previous timer every time the user types
        clearTimeout(timeout);
  
        // Start a new timer for 1 second
        timeout = setTimeout(() => {
          advance();
        }, 1000); 
      }
    };
  
    el.addEventListener("input", handler, true);
    el.addEventListener("change", handler, true);
  
    // Cleanup function
    return () => {
      clearTimeout(timeout); // Clear any pending advance
      el.removeEventListener("input", handler, true);
      el.removeEventListener("change", handler, true);
    };
  }


  function saveGuideState() {
    sessionStorage.setItem("__guide_state__", JSON.stringify({
      stepIndex: currentStepIndex,
      steps
    }));
  }

  async function runNextStep() {
    if (activeListenerCleanup) {
      activeListenerCleanup();
      activeListenerCleanup = null;
    }
  
    const step = steps[currentStepIndex];
    if (!step) {
      clearHighlight();
      return;
    }
  
    // 🕒 Retry logic: Look for the element every 200ms for up to 3 seconds
    let el = null;
    for (let i = 0; i < 15; i++) { 
      el = findElement(step.selectors);
      if (el) break; 
      await new Promise(resolve => setTimeout(resolve, 200)); 
    }
  
    if (!el) {
      console.warn("⚠️ Element not found after retries", step);
      return;
    }
  
    highlight(el, step.label || "");
  
    if (step.type === "click") activeListenerCleanup = waitForClick(el);
    if (step.type === "change") activeListenerCleanup = waitForInput(el);
  }

  // 🔥 Frontend entry points
  window.helpUserFromJSON = function (json) {
    if (!json || !Array.isArray(json.steps)) {
      console.error("Invalid guide JSON");
      return;
    }

    steps = json.steps;
    currentStepIndex = 0;

    addMessage("🤖 I'll guide you step by step. Click 'Next' to continue.");

    addMessage("🤖 I'll guide you step by step. Press ESC to cancel.");

    document.addEventListener("keydown", escKeyHandler, true); // ✅ ADD
    runNextStep();
  };

  const addContact = await loadTask("tasks/pipecat/add-contact-pipedrive.json");
  const addOrg = await loadTask("tasks/pipecat/add-organisation-pipedrive.json");
  

  window.helpUserFromSteps = function (stepsArray) {
    steps = stepsArray || [];
    currentStepIndex = 0;
    document.addEventListener("keydown", escKeyHandler, true); // ✅ ADD

    runNextStep();
  };

  function sendMessage() {
    console.log('hey')
   

    if (!addContact) {
      addMessage("⚠️ Guide not loaded yet, please try again.");
      return;
    }
    console.log("trying to highlight");
    const value = input.value.trim();
    if (!value) return;

    addMessage("You: " + value);
    selectedJson = null;
    if (
      addContact?.title &&
      addContact.title.toLowerCase().includes(value.toLowerCase())
    ) {
      selectedJson = addContact;
    }

    if (
      addOrg?.title &&
      addOrg.title.toLowerCase().includes(value.toLowerCase())
    ) {
      selectedJson = addOrg;
    }
    input.value = "";

    // You control JSON from frontend
    if (selectedJson) {
      console.log("trying to highlight");
      window.helpUserFromJSON(selectedJson);
    }
  }

  button.addEventListener("click", sendMessage);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") sendMessage();
  });

  toggle.addEventListener("click", () => {
    chatbot.style.display =
      chatbot.style.display === "none" ? "flex" : "none";
  });

})();
