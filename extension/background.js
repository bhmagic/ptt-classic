// Chrome can suspend this worker; the static connection rule does not depend on it.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});
