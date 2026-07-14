// background.js for Chrome Extension Side Panel
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Error setting panel behavior:", error));

// High-priority direct fetching to bypass side panel page throttling
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'FETCH_DIRECT') {
    fetchDirect(msg.url)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keeps message channel open for async response
  }
});

async function fetchDirect(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const json = await res.json();
    return { success: true, data: json };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
