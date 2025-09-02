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
    
    textbox.className = "textbox";

    // Add topbar to textbox (matches sidebar dropdown color, 40% width, prominent bottom right radius, shadow)
    const textboxTopbar = document.createElement("div");
    textboxTopbar.className = "topbar";
    textboxTopbar.textContent = node.title;
    textbox.appendChild(textboxTopbar);

    const textboxContent = document.createElement("textarea");
    textboxContent.className = "textbox-content";
    textboxContent.placeholder = "Type here...";

    textbox.appendChild(textboxContent);

    const actionBar = document.createElement("div");
    actionBar.className = "textbox-action-bar";

    const clearBtn = document.createElement("button");
    clearBtn.className = "textbox-action-btn clear";
    clearBtn.textContent = "Clear";
    // Add your clear logic here

    const saveBtn = document.createElement("button");
    saveBtn.className = "textbox-action-btn save";
    saveBtn.textContent = "Save";
    // Add your save logic here

    actionBar.appendChild(clearBtn);
    actionBar.appendChild(saveBtn);
    textbox.appendChild(actionBar);

    sidebar.className = "sidebar";
    const sidebarTopbar = document.createElement("div");
    sidebarTopbar.className = "topbar";
    sidebar.appendChild(sidebarTopbar);

    // ! DUMMY BUTTON TO TOGGLE SIDEBAR START
    const FORCE_SIDEBAR_HIDDEN = false; // Set to true to force sidebar hidden on modal open

    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "Toggle Sidebar";

    // Only allow toggling if FORCE_SIDEBAR_HIDDEN is false
    toggleBtn.onclick = () => {
        if (!FORCE_SIDEBAR_HIDDEN) {
            if (modal.classList.contains("sidebar-hidden")) {
                // Showing sidebar
                modal.classList.remove("sidebar-hidden");
            } else {
                // Hiding sidebar - add animating class first
                modal.classList.add("sidebar-animating-out");
                
                // Remove the animating class and add hidden class after animation
                setTimeout(() => {
                    modal.classList.remove("sidebar-animating-out");
                    modal.classList.add("sidebar-hidden");
                }, 150); // Match your shrinkWidth animation duration
            }
        }
    };

    toggleBtn.style.cssText = `
        position: absolute;
        bottom: 20px;
        left: 20px;
        z-index: 999;
        padding: 8px 12px;
        background: #c00;
        color: white;
        border: 1px solid #900;
        border-radius: 4px;
        cursor: pointer;
    `;

    // Force sidebar hidden for testing
    if (FORCE_SIDEBAR_HIDDEN) {
        modal.classList.add("sidebar-hidden");
        toggleBtn.disabled = true; // Optional: visually disable the button
        toggleBtn.style.opacity = "0.5"; // Optional: faded look
    }
    // ! DUMMY BUTTON TO TOGGLE SIDEBAR END

    modal.appendChild(textbox);
    modal.appendChild(sidebar);
    overlay.appendChild(modal);

    overlay.appendChild(toggleBtn); // Add to overlay instead of modal DEV NOTE
    
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
            
            // Add sidebar-hidden to overlay if modal has it
            if (modal.classList.contains("sidebar-hidden")) {
                overlay.classList.add("sidebar-hidden");
            }
            
            overlay.removeEventListener("click", closeHandler);
            document.removeEventListener("keydown", closeHandler);
            overlay.addEventListener("animationend", closeAnimationHandler);
        }
    };

    overlay.addEventListener("click", closeHandler);
    document.addEventListener("keydown", closeHandler);
    document.addEventListener("keydown", closeHandler);
}