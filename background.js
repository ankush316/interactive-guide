console.log("✅ Background service worker loaded");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "LOAD_JSON") {
    const url = chrome.runtime.getURL(msg.path);

    fetch(url)
      .then(r => r.json())
      .then(json => sendResponse({ ok: true, json }))
      .catch(err => sendResponse({ ok: false, error: err.message }));

    return true; // REQUIRED
  }
});