marked.setOptions({
    gfm: true,
    breaks: true
});

const shell = document.getElementById("shell");
const input = document.getElementById("markdown-input");
const preview = document.getElementById("preview");
const previewPane = document.querySelector(".pane-preview");
const primaryActionButton = document.getElementById("primary-action-button");
const scrollTopButton = document.getElementById("scroll-top-button");
const toast = document.getElementById("toast");
const menuButton = document.getElementById("menu-button");
const menuPanel = document.getElementById("action-menu");
const colorOptions = document.getElementById("color-options");
const menuItems = Array.from(document.querySelectorAll(".menu-item"));
const DRAFT_KEY = "md-draft";
const TOAST_KEY = "ends-toast";
const COLOR_KEY = "ends-color";
const COLOR_PRESETS = {
    slate: { label: "Slate", accent: "#6b7280", link: "#111827", soft: "#f3f4f6", border: "#e5e7eb" },
    sage: { label: "Sage", accent: "#6f9277", link: "#6f9277", soft: "#f1f7f2", border: "#d9eadc" },
    rose: { label: "Rose", accent: "#b77986", link: "#b77986", soft: "#fff1f3", border: "#f1d4da" },
    sky: { label: "Sky", accent: "#3f78a8", link: "#3f78a8", soft: "#eef7ff", border: "#d2e6f5" },
    lavender: { label: "Lavender", accent: "#7664a8", link: "#7664a8", soft: "#f5f2ff", border: "#ded7f2" },
    amber: { label: "Amber", accent: "#a9803a", link: "#a9803a", soft: "#fff8e8", border: "#eeddb8" },
};
let currentMode = "new";
let publishInProgress = false;
let suppressNextBlurPublish = false;
let toastTimer = null;

function render() {
    preview.innerHTML = marked.parse(input.value || "");

    preview.querySelectorAll("table").forEach((table) => {
        if (table.parentElement?.classList.contains("table-scroll")) {
            return;
        }

        const wrapper = document.createElement("div");
        wrapper.className = "table-scroll";
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
    });

    // Only highlight fenced code blocks, never inline code.
    document
        .querySelectorAll('.preview-content pre code[class*="language-"]')
        .forEach((block) => {
            Prism.highlightElement(block);
        });

    if (currentMode === "new" || currentMode === "editing-published") {
        if (input.value) {
            localStorage.setItem(DRAFT_KEY, input.value);
        } else {
            localStorage.removeItem(DRAFT_KEY);
        }
    }
}

function getPublishedIdFromPath() {
    const match = window.location.pathname.match(/^\/p\/([A-Za-z0-9_-]+)$/);
    return match ? match[1] : null;
}

function isEditRoute() {
    return new URLSearchParams(window.location.search).get("edit") === "1";
}

function getSheetPathParts() {
    const match = window.location.pathname.match(/^\/s\/([A-Za-z0-9_-]+)(?:\/([^/]+))?$/);

    if (!match) {
        return null;
    }

    return {
        id: match[1],
        slug: match[2] || null
    };
}

function goToSheetIndex() {
    const sheetParts = getSheetPathParts();

    if (!sheetParts?.slug) {
        return false;
    }

    window.location.href = `/s/${sheetParts.id}`;
    return true;
}

function getEditorPath() {
    return window.location.protocol === "file:" ? window.location.pathname : "/new";
}

function currentColorName() {
    const color = new URLSearchParams(window.location.search).get("color") || localStorage.getItem(COLOR_KEY) || "slate";
    return COLOR_PRESETS[color] ? color : "slate";
}

function applyColor(colorName) {
    const safeColorName = COLOR_PRESETS[colorName] ? colorName : "slate";
    const preset = COLOR_PRESETS[safeColorName];
    document.body.style.setProperty("--accent", preset.accent);
    document.body.style.setProperty("--link-color", preset.link);
    document.body.style.setProperty("--accent-soft", preset.soft);
    document.body.style.setProperty("--accent-border", preset.border);
    localStorage.setItem(COLOR_KEY, safeColorName);
    syncColorMenuLabel(safeColorName);
}

function syncColorMenuLabel(colorName = currentColorName()) {
    menuItems
        .filter((item) => item.dataset.action === "set-color")
        .forEach((item) => {
            item.setAttribute("aria-current", item.dataset.color === colorName ? "true" : "false");
        });
}

function setColorParam(colorName) {
    const url = new URL(window.location.href);

    if (colorName === "slate") {
        url.searchParams.delete("color");
    } else {
        url.searchParams.set("color", colorName);
    }

    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function setColor(colorName) {
    setColorParam(colorName);
    applyColor(colorName);
    showToast(`Color: ${COLOR_PRESETS[colorName].label}`);
}

function showReadOnlyMarkdown(markdown, mode) {
    currentMode = mode;
    input.value = markdown || "";
    document.body.classList.add("publish-mode");
    render();
}

function extractSheetId(value) {
    const trimmed = value.trim();
    const pathMatch = trimmed.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
    const directMatch = trimmed.match(/^[A-Za-z0-9_-]{20,}$/);

    if (pathMatch) {
        return pathMatch[1];
    }

    if (directMatch) {
        return directMatch[0];
    }

    return null;
}

function renderSheetConverter() {
    const converter = document.createElement("section");
    converter.className = "sheet-converter";
    converter.innerHTML = `
        <label for="sheet-url-input">Google Sheet URL or ID</label>
        <input id="sheet-url-input" type="url" placeholder="https://docs.google.com/spreadsheets/d/..." autocomplete="off" />
        <div id="sheet-converter-result" class="sheet-converter-result" aria-live="polite"></div>
    `;

    preview.appendChild(converter);

    const sheetInput = document.getElementById("sheet-url-input");
    const result = document.getElementById("sheet-converter-result");

    function updateResult() {
        const sheetId = extractSheetId(sheetInput.value);

        if (!sheetId) {
            result.innerHTML = "<span class='sheet-converter-error'>Your ends.at link will appear here.</span>";
            return;
        }

        const sheetPath = `/s/${sheetId}`;
        const sheetUrl = new URL(sheetPath, window.location.href).toString();
        result.innerHTML = `<a href="${sheetPath}">${sheetUrl}</a>`;
    }

    sheetInput.addEventListener("input", updateResult);
    updateResult();
}

function showEditableMarkdown(markdown, mode) {
    currentMode = mode;
    input.value = markdown || "";
    document.body.classList.remove("publish-mode");
    render();
}

function focusEditorOnDesktop() {
    if (window.matchMedia("(min-width: 901px)").matches) {
        requestAnimationFrame(() => input.focus());
    }
}

function isMobileLayout() {
    return window.matchMedia("(max-width: 900px)").matches;
}

function startBlankPage() {
    localStorage.removeItem(DRAFT_KEY);
    currentMode = "new";
    window.history.replaceState({}, "", getEditorPath());
    showEditableMarkdown("", "new");
    syncMenuState();
    input.focus();
}

async function publishCurrentMarkdown({ copyUrl = true } = {}) {
    const markdown = input.value.trim();

    if (!markdown || publishInProgress) {
        return;
    }

    publishInProgress = true;
    setMenuBusy(true, "Publishing...");

    try {
        const response = await fetch("/api/publish", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ markdown })
        });

        if (!response.ok) {
            throw new Error("Publish failed");
        }

        const data = await response.json();
    const publishedPath = `/p/${data.id}`;
        const publishedUrl = new URL(publishedPath, window.location.href);
        const colorName = currentColorName();

        if (colorName !== "slate") {
            publishedUrl.searchParams.set("color", colorName);
        }

        if (copyUrl && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(publishedUrl.toString());
            sessionStorage.setItem(TOAST_KEY, "Copied page link");
        }

        window.location.href = `${publishedUrl.pathname}${publishedUrl.search}`;
    } catch (error) {
        console.error(error);
        setMenuBusy(false);
        publishInProgress = false;
        alert("Could not publish this Markdown.");
    }
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        toast.classList.remove("show");
    }, 1800);
}

function showPendingToast() {
    const message = sessionStorage.getItem(TOAST_KEY);

    if (!message) {
        return;
    }

    sessionStorage.removeItem(TOAST_KEY);
    showToast(message);
}

function maybePublishOnMobileBlur() {
    window.setTimeout(() => {
        if (suppressNextBlurPublish) {
            suppressNextBlurPublish = false;
            return;
        }

        if (!isMobileLayout() || document.body.classList.contains("publish-mode")) {
            return;
        }

        if (currentMode !== "new" && currentMode !== "editing-published") {
            return;
        }

        publishCurrentMarkdown({ copyUrl: false });
    }, 0);
}

function startEditingPublishedPage() {
    currentMode = "editing-published";
    localStorage.setItem(DRAFT_KEY, input.value);
    document.body.classList.remove("publish-mode");
    window.history.replaceState({}, "", `${window.location.pathname}?edit=1`);
    render();
    syncMenuState();
    input.focus();
}

function createNewPage() {
    startBlankPage();
}

async function copyMarkdown() {
    await navigator.clipboard.writeText(input.value);
}

async function copyText() {
    await navigator.clipboard.writeText(preview.innerText || "");
}

async function copyPageLink() {
    await navigator.clipboard.writeText(window.location.href);
    showToast("Copied page link");
}

function setMenuBusy(isBusy) {
    menuButton.disabled = isBusy;
    primaryActionButton.disabled = isBusy;
    renderPrimaryActionIcon(isBusy ? "publishing" : null);
    menuButton.innerHTML = isBusy
        ? `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="4.25" r="1.5" fill="currentColor"></circle>
        <circle cx="10" cy="10" r="1.5" fill="currentColor"></circle>
        <circle cx="10" cy="15.75" r="1.5" fill="currentColor"></circle>
    </svg>`
        : `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="4.25" r="1.5" fill="currentColor"></circle>
        <circle cx="10" cy="10" r="1.5" fill="currentColor"></circle>
        <circle cx="10" cy="15.75" r="1.5" fill="currentColor"></circle>
    </svg>`;
}

function setMenuOpen(isOpen) {
    menuPanel.classList.toggle("open", isOpen);
    menuButton.setAttribute("aria-expanded", isOpen ? "true" : "false");

    if (!isOpen) {
        colorOptions.classList.remove("open");
        document.querySelector('[data-action="toggle-color"]').setAttribute("aria-expanded", "false");
    }
}

function setColorOptionsOpen(isOpen) {
    colorOptions.classList.toggle("open", isOpen);
    document.querySelector('[data-action="toggle-color"]').setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function enabledMenuItems() {
    return menuItems.filter((item) => !item.disabled && item.offsetParent !== null);
}

function focusMenuItem(offset) {
    const items = enabledMenuItems();

    if (!items.length) {
        return;
    }

    const currentIndex = items.indexOf(document.activeElement);
    const nextIndex = currentIndex === -1
        ? 0
        : (currentIndex + offset + items.length) % items.length;

    items[nextIndex].focus();
}

function syncMenuState() {
    const isPublishMode = document.body.classList.contains("publish-mode");

    document.body.classList.toggle("home-mode", currentMode === "home");
    document.body.classList.toggle("sheet-mode", currentMode === "sheet" || currentMode === "sheet-page" || currentMode === "sheet-converter" || currentMode === "about");
    document.body.classList.toggle("editor-mode", currentMode === "new" || currentMode === "editing-published");

    renderPrimaryActionIcon();
    primaryActionButton.disabled = publishInProgress || currentMode === "home" || currentMode === "sheet" || currentMode === "sheet-page" || currentMode === "sheet-converter" || currentMode === "about";
    syncScrollTopButton();
}

function syncScrollTopButton() {
    const canScrollToTop = document.body.classList.contains("publish-mode") && previewPane.scrollTop > 360;
    scrollTopButton.classList.toggle("show", canScrollToTop);
}

function scrollToTop() {
    previewPane.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

function renderPrimaryActionIcon(overrideMode = null) {
    const actionMode = overrideMode || (currentMode === "published" ? "edit" : "publish");

    if (actionMode === "publishing") {
        primaryActionButton.setAttribute("aria-label", "Publishing");
        primaryActionButton.innerHTML = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="4.25" r="1.5" fill="currentColor"></circle>
            <circle cx="10" cy="10" r="1.5" fill="currentColor"></circle>
            <circle cx="10" cy="15.75" r="1.5" fill="currentColor"></circle>
        </svg>`;
        return;
    }

    if (actionMode === "edit") {
        primaryActionButton.setAttribute("aria-label", "Edit");
        primaryActionButton.innerHTML = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M4.5 14.75 5.15 11.5 12.1 4.55a2.05 2.05 0 0 1 2.9 2.9L8.05 14.4l-3.55.35Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path>
            <path d="m10.9 5.75 3.35 3.35" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
        </svg>`;
        return;
    }

    primaryActionButton.setAttribute("aria-label", "Publish");
    primaryActionButton.innerHTML = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M3.25 9.9 16.4 3.75a.25.25 0 0 1 .34.3l-3.9 12.25a.25.25 0 0 1-.44.08L9.25 12.5l-2.7 2.15a.25.25 0 0 1-.4-.2l.1-3.15-3.02-.95a.25.25 0 0 1 .02-.45Z" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"></path>
        <path d="m6.35 11.25 10.2-7.35" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"></path>
    </svg>`;
}

async function handleMenuAction(item) {
    const action = item.dataset.action;

    if (action !== "toggle-color") {
        setMenuOpen(false);
    }

    if (action === "home") {
        window.location.href = "/";
        return;
    }

    if (action === "about") {
        window.location.href = "/about";
        return;
    }

    if (action === "new") {
        createNewPage();
        return;
    }

    if (action === "sheet") {
        window.location.href = "/sheet";
        return;
    }

    if (action === "copy-link") {
        await copyPageLink();
        return;
    }

    if (action === "copy-markdown") {
        await copyMarkdown();
        return;
    }

    if (action === "copy-text") {
        await copyText();
        return;
    }

    if (action === "toggle-color") {
        const willOpen = !colorOptions.classList.contains("open");
        setColorOptionsOpen(willOpen);

        if (willOpen) {
            focusMenuItem(1);
        }

        return;
    }

    if (action === "set-color") {
        setColor(item.dataset.color);
        setMenuOpen(false);
        return;
    }

}

async function checkUrl() {
    applyColor(currentColorName());
    const publishedId = getPublishedIdFromPath();
    const sheetParts = getSheetPathParts();

    if (publishedId) {
        try {
            const response = await fetch(`/api/doc/${publishedId}`);

            if (!response.ok) {
                throw new Error("Document not found");
            }

            const data = await response.json();

            if (isEditRoute()) {
                showEditableMarkdown(data.markdown || "", "editing-published");
            } else {
                showReadOnlyMarkdown(data.markdown || "", "published");
            }
        } catch (error) {
            console.error(error);
            preview.innerHTML = "<p class='preview-empty'>This published Markdown could not be loaded.</p>";
            currentMode = "published";
            document.body.classList.add("publish-mode");
        }
    } else if (sheetParts) {
        try {
            const sheetUrl = `/api/sheet/${sheetParts.id}${sheetParts.slug ? `/${sheetParts.slug}` : ""}`;
            const response = await fetch(sheetUrl);

            if (!response.ok) {
                throw new Error("Sheet not found");
            }

            const data = await response.json();
            showReadOnlyMarkdown(data.markdown || "", sheetParts.slug ? "sheet-page" : "sheet");
        } catch (error) {
            console.error(error);
            preview.innerHTML = "<p class='preview-empty'>This Google Sheet Markdown could not be loaded. Make sure the sheet is viewable by anyone with the link.</p>";
            currentMode = "sheet";
            document.body.classList.add("publish-mode");
        }
    } else if (window.location.pathname === "/" || window.location.pathname === "") {
        try {
            const response = await fetch("/home.md");

            if (!response.ok) {
                throw new Error("Home page not found");
            }

            showReadOnlyMarkdown(await response.text(), "home");
        } catch (error) {
            console.error(error);
            preview.innerHTML = "<p class='preview-empty'>The home page could not be loaded.</p>";
            currentMode = "home";
            document.body.classList.add("publish-mode");
        }
    } else if (window.location.pathname === "/sheet") {
        try {
            const response = await fetch("/sheet.md");

            if (!response.ok) {
                throw new Error("Sheet page not found");
            }

            showReadOnlyMarkdown(await response.text(), "sheet-converter");
            renderSheetConverter();
        } catch (error) {
            console.error(error);
            preview.innerHTML = "<p class='preview-empty'>The Google Sheet converter could not be loaded.</p>";
            currentMode = "sheet-converter";
            document.body.classList.add("publish-mode");
        }
    } else if (window.location.pathname === "/about") {
        try {
            const response = await fetch("/about.md");

            if (!response.ok) {
                throw new Error("About page not found");
            }

            showReadOnlyMarkdown(await response.text(), "about");
        } catch (error) {
            console.error(error);
            preview.innerHTML = "<p class='preview-empty'>The about page could not be loaded.</p>";
            currentMode = "about";
            document.body.classList.add("publish-mode");
        }
    } else if (window.location.pathname === "/example") {
        try {
            const response = await fetch("/example.md");

            if (!response.ok) {
                throw new Error("Example page not found");
            }

            showReadOnlyMarkdown(await response.text(), "about");
        } catch (error) {
            console.error(error);
            preview.innerHTML = "<p class='preview-empty'>The example page could not be loaded.</p>";
            currentMode = "about";
            document.body.classList.add("publish-mode");
        }
    } else {
        if (window.location.search === "?fresh=1") {
            startBlankPage();
        } else {
            const draft = localStorage.getItem(DRAFT_KEY);
            showEditableMarkdown(draft || "", "new");
        }
    }

    setMenuBusy(false);
    syncMenuState();
    shell.classList.add("ready");

    if (currentMode === "new" || currentMode === "editing-published") {
        focusEditorOnDesktop();
    }

    showPendingToast();
}

input.addEventListener("input", render);
input.addEventListener("blur", maybePublishOnMobileBlur);
preview.addEventListener("click", (event) => {
    const link = event.target.closest("a");

    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
    }

    const url = new URL(link.href, window.location.href);

    if (url.origin === window.location.origin && url.pathname === "/new" && url.searchParams.get("fresh") === "1") {
        event.preventDefault();
        createNewPage();
    }
});
scrollTopButton.addEventListener("click", scrollToTop);
window.addEventListener("scroll", syncScrollTopButton, { passive: true });
previewPane.addEventListener("scroll", syncScrollTopButton, { passive: true });
primaryActionButton.addEventListener("click", () => {
    if (currentMode === "published") {
        startEditingPublishedPage();
        return;
    }

    publishCurrentMarkdown();
});
document.querySelector(".menu-wrap").addEventListener("pointerdown", () => {
    suppressNextBlurPublish = true;
});
menuButton.addEventListener("click", () => {
    const willOpen = !menuPanel.classList.contains("open");
    setMenuOpen(willOpen);

    if (willOpen) {
        focusMenuItem(1);
    }
});
menuPanel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
        event.preventDefault();
        focusMenuItem(1);
        return;
    }

    if (event.key === "ArrowUp") {
        event.preventDefault();
        focusMenuItem(-1);
        return;
    }

    if (event.key === "Home") {
        event.preventDefault();
        enabledMenuItems()[0]?.focus();
        return;
    }

    if (event.key === "End") {
        event.preventDefault();
        const items = enabledMenuItems();
        items[items.length - 1]?.focus();
    }
});
menuItems.forEach((item) => {
    item.addEventListener("click", async () => {
        if (item.disabled) {
            return;
        }

        await handleMenuAction(item);
    });
});
document.addEventListener("click", (event) => {
    if (!event.target.closest(".menu-wrap")) {
        setMenuOpen(false);
    }
});
document.addEventListener("keydown", (event) => {
    const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);

    if (event.key === "Escape") {
        const wasMenuOpen = menuPanel.classList.contains("open");
        setMenuOpen(false);

        if (wasMenuOpen) {
            return;
        }

        if (currentMode === "editing-published") {
            event.preventDefault();
            window.history.replaceState({}, "", window.location.pathname);
            checkUrl();
            return;
        }

        if (goToSheetIndex()) {
            event.preventDefault();
        }
        return;
    }

    if (!isTyping && event.key === "ArrowLeft" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (currentMode === "sheet-page" && goToSheetIndex()) {
            event.preventDefault();
        }
        return;
    }

    if (!isTyping && event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setMenuOpen(true);
        focusMenuItem(1);
        return;
    }

    if (!isTyping && !menuPanel.classList.contains("open") && event.key.toLowerCase() === "n" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        createNewPage();
        return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        if (currentMode === "new" || currentMode === "editing-published") {
            event.preventDefault();
            publishCurrentMarkdown();
        }
        return;
    }

    if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "e") {
        if (!isTyping && currentMode === "published") {
            event.preventDefault();
            startEditingPublishedPage();
        }
    }
});
window.onload = checkUrl;
window.onpopstate = checkUrl;
