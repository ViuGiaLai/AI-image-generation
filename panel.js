(function () {
  const STORAGE_KEY = "taoAnhAiQueueText";
  const STORAGE_TIME_KEY = "taoAnhAiQueueAt";
  const labsHost = /^https:\/\/labs\.google\//;

  const queueInput = document.getElementById("queueInput");
  const promptCount = document.getElementById("promptCount");
  const connectionBadge = document.getElementById("connectionBadge");
  const status = document.getElementById("status");
  const reloadBtn = document.getElementById("reloadBtn");
  const loadBridgeBtn = document.getElementById("loadBridgeBtn");
  const guideBtn = document.getElementById("guideBtn");
  const pasteBtn = document.getElementById("pasteBtn");
  const openLabsBtn = document.getElementById("openLabsBtn");
  const sendBtn = document.getElementById("sendBtn");
  const promptList = document.getElementById("promptList");
  const expandedPromptIndexes = new Set();

  function splitQueue(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .trim()
      .split(/\n---\n|\n===\n|\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(text, kind = "muted") {
    status.textContent = text;
    status.className = `status state-${kind}`;
  }

  function setConnectionBadge(kind, text) {
    connectionBadge.textContent = text;
    connectionBadge.className = `state-badge state-${kind}`;
  }

  function persistQueue() {
    return chrome.storage.local.set({
      [STORAGE_KEY]: queueInput.value,
      [STORAGE_TIME_KEY]: Date.now()
    });
  }

  function renderCount() {
    const count = splitQueue(queueInput.value).length;
    promptCount.textContent = `${count} prompt${count === 1 ? "" : "s"}`;
    setConnectionBadge(count ? "ready" : "danger", count ? "Queue ready" : "Not ready");
    renderList();
  }

  function shouldCollapse(prompt, index) {
    return (prompt.length > 220 || prompt.split("\n").length > 5) && !expandedPromptIndexes.has(index);
  }

  function renderList() {
    const prompts = splitQueue(queueInput.value);
    if (!prompts.length) {
      promptList.innerHTML = '<div class="empty-state">No prompts loaded yet. Import from SRT2Prompt or paste from clipboard.</div>';
      return;
    }

    promptList.innerHTML = prompts
      .map((prompt, index) => {
        const collapsed = shouldCollapse(prompt, index);
        return `
          <article class="prompt-item ${expandedPromptIndexes.has(index) ? "is-expanded" : ""}">
            <div class="prompt-item-head">
              <div>
                <div class="prompt-item-title">Prompt ${index + 1}</div>
              </div>
              <div class="item-actions">
                <button class="icon-btn" data-copy-index="${index}" aria-label="Copy prompt">Copy</button>
                <button class="icon-btn" data-send-index="${index}" aria-label="Send prompt">Send</button>
                <button class="icon-btn" data-toggle-index="${index}" aria-label="Toggle prompt">${collapsed ? "Expand" : "Collapse"}</button>
                <button class="icon-btn danger" data-delete-index="${index}" aria-label="Delete prompt">Remove</button>
              </div>
            </div>
            <div class="prompt-item-text ${collapsed ? "is-collapsed" : ""}">${escapeHtml(prompt)}</div>
            ${collapsed ? '<div class="prompt-fade"></div>' : ""}
          </article>
        `;
      })
      .join("");

    promptList.querySelectorAll("[data-delete-index]").forEach((button) => {
      button.addEventListener("click", () => removePrompt(Number(button.getAttribute("data-delete-index"))));
    });
    promptList.querySelectorAll("[data-copy-index]").forEach((button) => {
      button.addEventListener("click", () => void copyPrompt(Number(button.getAttribute("data-copy-index"))));
    });
    promptList.querySelectorAll("[data-send-index]").forEach((button) => {
      button.addEventListener("click", () => void sendPromptAtIndex(Number(button.getAttribute("data-send-index"))));
    });
    promptList.querySelectorAll("[data-toggle-index]").forEach((button) => {
      button.addEventListener("click", () => togglePrompt(Number(button.getAttribute("data-toggle-index"))));
    });
  }

  function togglePrompt(index) {
    if (expandedPromptIndexes.has(index)) expandedPromptIndexes.delete(index);
    else expandedPromptIndexes.add(index);
    renderCount();
  }

  function removePrompt(index) {
    const nextPrompts = splitQueue(queueInput.value).filter((_, current) => current !== index);
    queueInput.value = nextPrompts.join("\n---\n");
    expandedPromptIndexes.clear();
    renderCount();
    persistQueue();
    setStatus("Prompt removed.", "muted");
  }

  async function copyPrompt(index) {
    const prompts = splitQueue(queueInput.value);
    const prompt = prompts[index];
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setStatus(`Copied prompt ${index + 1}.`, "ready");
  }

  async function openLabs() {
    await chrome.tabs.create({ url: "https://labs.google/" });
  }

  async function openGuide() {
    await chrome.tabs.create({ url: chrome.runtime.getURL("guide.html") });
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setStatus("Clipboard is empty.", "danger");
        return;
      }
      queueInput.value = text;
      expandedPromptIndexes.clear();
      renderCount();
      persistQueue();
      setStatus("Loaded from clipboard.", "ready");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not read clipboard.", "danger");
    }
  }

  async function loadFromStorage() {
    const data = await chrome.storage.local.get([STORAGE_KEY, STORAGE_TIME_KEY]);
    queueInput.value = data[STORAGE_KEY] || "";
    expandedPromptIndexes.clear();
    renderCount();
    if (data[STORAGE_TIME_KEY]) {
      setStatus(`Imported at ${new Date(data[STORAGE_TIME_KEY]).toLocaleString()}.`, "ready");
    } else {
      setConnectionBadge("danger", "Not ready");
      setStatus("Waiting for import from SRT2Prompt...", "muted");
    }
  }

  async function sendPrompt(prompt, label, tabId) {
    const activeTabId = tabId || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
    if (!activeTabId) throw new Error("Could not find an active tab.");
    const response = await chrome.tabs.sendMessage(activeTabId, { action: "INJECT_PROMPT", prompt });
    if (!response?.ok) throw new Error(response?.error || `Failed at prompt ${label}.`);
    setStatus(`Sent prompt ${label}.`, "ready");
    return response;
  }

  async function sendPromptAtIndex(index) {
    const prompts = splitQueue(queueInput.value);
    const prompt = prompts[index];
    if (!prompt) return;

    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !labsHost.test(tab.url || "")) {
      setStatus("Open labs.google first, then send again.", "danger");
      return;
    }

    await sendPrompt(prompt, index + 1, tab.id);
  }

  async function sendToLabs() {
    const prompts = splitQueue(queueInput.value);
    if (!prompts.length) {
      setStatus("No prompts to send.", "danger");
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !labsHost.test(tab.url || "")) {
      setStatus("Open labs.google first, then send again.", "danger");
      return;
    }

    setConnectionBadge("busy", "Sending");
    setStatus(`Sending ${prompts.length} prompt${prompts.length === 1 ? "" : "s"}...`, "busy");
    for (let index = 0; index < prompts.length; index += 1) {
      await sendPrompt(prompts[index], index + 1, tab.id);
      if (index < prompts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
    setConnectionBadge("ready", "Queue ready");
    setStatus("All prompts sent.", "ready");
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== "TAO_ANH_AI_IMPORT_ACK") return;
    if (data.ok) {
      setConnectionBadge("ready", "Synced");
      setStatus(`Imported ${data.count || 0} prompt${data.count === 1 ? "" : "s"} from SRT2Prompt.`, "ready");
    }
  });

  queueInput.addEventListener("input", () => {
    persistQueue();
    renderCount();
  });

  reloadBtn.addEventListener("click", () => void loadFromStorage());
  connectionBadge.addEventListener("click", () => void openGuide());
  guideBtn.addEventListener("click", () => void openGuide());
  loadBridgeBtn.addEventListener("click", () => void loadFromStorage());
  pasteBtn.addEventListener("click", () => void pasteFromClipboard());
  openLabsBtn.addEventListener("click", () => void openLabs());
  sendBtn.addEventListener("click", () => {
    void sendToLabs().catch((error) => {
      setStatus(error instanceof Error ? error.message : "Failed to send prompts.", "danger");
      setConnectionBadge("danger", "Error");
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STORAGE_KEY]) {
      queueInput.value = changes[STORAGE_KEY].newValue || "";
      expandedPromptIndexes.clear();
      renderCount();
    }
    if (changes[STORAGE_TIME_KEY]) {
      const value = changes[STORAGE_TIME_KEY].newValue;
      if (value) {
        setConnectionBadge("ready", "Synced");
        setStatus(`Imported at ${new Date(value).toLocaleString()}.`, "ready");
      }
    }
  });

  loadFromStorage().catch(() => {
    setConnectionBadge("danger", "Offline");
    setStatus("Could not read extension storage.", "danger");
  });
  renderCount();
})();
