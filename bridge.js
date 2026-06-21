(function () {
  const MESSAGE_TYPE = "TAO_ANH_AI_IMPORT_QUEUE";
  const ACK_TYPE = "TAO_ANH_AI_IMPORT_ACK";
  const PING_TYPE = "TAO_ANH_AI_PING";
  const STORAGE_KEY = "taoAnhAiQueueText";
  const STORAGE_TIME_KEY = "taoAnhAiQueueAt";

  if (globalThis.__taoAnhAiBridgeReady) return;
  globalThis.__taoAnhAiBridgeReady = true;

  function normalizePayload(payload) {
    if (!payload) return "";
    if (typeof payload === "string") return payload.trim();
    if (Array.isArray(payload)) {
      return payload.map((item) => String(item).trim()).filter(Boolean).join("\n---\n");
    }
    if (typeof payload === "object") {
      if (Array.isArray(payload.prompts)) {
        return payload.prompts.map((item) => String(item).trim()).filter(Boolean).join("\n---\n");
      }
      if (typeof payload.queue === "string") return payload.queue.trim();
      if (typeof payload.text === "string") return payload.text.trim();
      if (typeof payload.content === "string") return payload.content.trim();
      if (payload.pack && Array.isArray(payload.pack.scenePrompts)) {
        return payload.pack.scenePrompts
          .map((scene) => scene.imagePrompt || scene.summary || "")
          .map((item) => String(item).trim())
          .filter(Boolean)
          .join("\n---\n");
      }
    }
    return "";
  }

  function countPrompts(text) {
    return text
      .split(/\n---\n|\n+/)
      .map((item) => item.trim())
      .filter(Boolean).length;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data) return;
    if (data.type === PING_TYPE) {
      window.postMessage({ type: "TAO_ANH_AI_PONG", ok: true }, window.location.origin);
      return;
    }
    if (!data || data.type !== MESSAGE_TYPE) return;

    const queueText = normalizePayload(data.payload);
    if (!queueText) return;

    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        [STORAGE_KEY]: queueText,
        [STORAGE_TIME_KEY]: Date.now()
      });
    }

    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: "TAO_ANH_AI_OPEN_PANEL" }).catch(() => {});
    }

    window.postMessage(
      {
        type: ACK_TYPE,
        ok: true,
        count: countPrompts(queueText)
      },
      window.location.origin
    );
  });
})();
