// Classic-script loader: Chrome MV3 content scripts cannot declare
// type: "module", but a dynamic import() inside a classic script is fine.
// We redirect into the real ES module here so `import.meta` and other
// module-only syntax inside main.ts keep working.
(async () => {
  try {
    const url = chrome.runtime.getURL('src/content/main.js');
    await import(/* @vite-ignore */ url);
  } catch (err) {
    console.error('[Substack AI Detector] loader failed to import main', err);
  }
})();
