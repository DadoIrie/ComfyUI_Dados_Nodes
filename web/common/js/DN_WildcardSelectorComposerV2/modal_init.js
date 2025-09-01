async function ensureCSSLoaded(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    await new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = resolve;
        link.onerror = reject;
        document.head.appendChild(link);
    });
}

export async function createTextEditorModal(node, constants) {
    document.getElementById("wildcard-selector-composer-v2-overlay")?.remove();

    const cssHref = `/extensions/${constants.EXTENSION_NAME}/common/css/DN_WildcardSelectorComposerV2.css`;
    await ensureCSSLoaded(cssHref);

    const overlay = document.createElement("div");
    overlay.id = "wildcard-selector-composer-v2-overlay";
    
    const modal = document.createElement("div");
    modal.id = "wildcard-selector-composer-v2-modal";
    
    const sidebar = document.createElement("div");
    const textbox = document.createElement("div");
    
    sidebar.className = "sidebar";
    textbox.className = "textbox";

    // Add dummy button
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "Toggle Sidebar";
    toggleBtn.onclick = () => modal.classList.toggle("sidebar-hidden");
    textbox.appendChild(toggleBtn);
    
    modal.appendChild(textbox);
    modal.appendChild(sidebar);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeAnimationHandler = (event) => {
        // Only remove when overlay's fadeOut animation specifically ends
        if (event.target === overlay && event.animationName === 'fadeOut') {
            overlay.removeEventListener("animationend", closeAnimationHandler);
            overlay.remove();
        }
    };

    const closeHandler = (event) => {
        if (
            (event.type === "click" && event.target === overlay) ||
            (event.type === "keydown" && event.key === "Escape")
        ) {
            overlay.classList.add("closing");
            modal.classList.add("closing");
            
            overlay.removeEventListener("click", closeHandler);
            document.removeEventListener("keydown", closeHandler);

            overlay.addEventListener("animationend", closeAnimationHandler);
        }
    };

    overlay.addEventListener("click", closeHandler);
    document.addEventListener("keydown", closeHandler);
}