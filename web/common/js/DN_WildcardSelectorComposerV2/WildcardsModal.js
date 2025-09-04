import { getIcon } from "../svg_icons.js";
import { fetchSend } from "../utils.js";
import { WildcardsProcessor } from './NodeDataProcessor.js';
import { DropdownManager } from './DropdownManager.js';

export class WildcardsModal {
    constructor(node, constants) {
        this.node = node;
        this.constants = constants;
        this.nodeDataProcessor = new WildcardsProcessor(node);
        this.dropdownManager = null;
        this.overlay = null;
        this.modal = null;
        this.textboxContent = null;
        this.structureData = null;
        this.clearBtn = null;
        this.saveBtn = null;
    }

    async show() {
        await this.ensureCSSLoaded();
        this.createElements();
        this.setupEventHandlers();
        this.initializeDropdowns();
        document.body.appendChild(this.overlay);
    }

    async ensureCSSLoaded() {
        const cssHref = `/extensions/${this.constants.EXTENSION_NAME}/common/css/DN_WildcardSelectorComposerV2.css`;
        if (document.querySelector(`link[href="${cssHref}"]`)) return;
        await new Promise(resolve => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssHref;
            link.onload = resolve;
            link.onerror = () => { console.warn(`Failed to load CSS: ${cssHref}`); resolve(); };
            document.head.appendChild(link);
        });
    }

    createElements() {
        this.createOverlay();
        this.createModal();
        this.createTextbox();
        this.createSidebar();
        this.createActionButtons();

        this.modal.appendChild(this.textbox);
        this.modal.appendChild(this.sidebar);
        this.overlay.appendChild(this.modal);
    }

    createOverlay() {
        document.getElementById("wildcard-selector-composer-v2-overlay")?.remove();
        this.overlay = document.createElement("div");
        this.overlay.id = "wildcard-selector-composer-v2-overlay";
    }

    createModal() {
        this.modal = document.createElement("div");
        this.modal.id = "wildcard-selector-composer-v2-modal";
    }

    createSidebar() {
        this.sidebar = document.createElement("div");
        this.sidebar.className = "sidebar";
        const sidebarTopbar = document.createElement("div");
        sidebarTopbar.className = "topbar";
        // REMOVE APPLY BUTTON
        this.sidebar.appendChild(sidebarTopbar);
        this.sidebarDropdownsScroll = document.createElement("div");
        this.sidebarDropdownsScroll.className = "sidebar-dropdowns-scroll";
        this.sidebar.appendChild(this.sidebarDropdownsScroll);
    }

    createTextbox() {
        this.textbox = document.createElement("div");
        this.textbox.className = "textbox";

        const textboxTopbar = document.createElement("div");
        textboxTopbar.className = "topbar";
        textboxTopbar.textContent = this.node.title;
        this.textbox.appendChild(textboxTopbar);

        this.textboxContent = document.createElement("textarea");
        this.textboxContent.className = "textbox-content";
        this.textboxContent.placeholder = "Type here...";
        const wildcardsPrompt = this.nodeDataProcessor.getWildcardsPrompt();
        if (wildcardsPrompt) this.textboxContent.value = wildcardsPrompt;
        this.textbox.appendChild(this.textboxContent);
    }

    createActionButtons() {
        const actionBar = document.createElement("div");
        actionBar.className = "textbox-action-bar";

        this.clearBtn = this._createActionButton("Clear", "clear");
        this.saveBtn = this._createActionButton("Save", "save");

        actionBar.appendChild(this.clearBtn);
        actionBar.appendChild(this.saveBtn);
        this.textbox.appendChild(actionBar);

        // ! DUMMY BUTTON TO TOGGLE SIDEBAR START
        const FORCE_SIDEBAR_HIDDEN = false;

        const toggleBtn = document.createElement("button");
        toggleBtn.textContent = "Toggle Sidebar";
        toggleBtn.onclick = () => {
            if (!FORCE_SIDEBAR_HIDDEN) {
                if (this.modal.classList.contains("sidebar-hidden")) {
                    this.modal.classList.remove("sidebar-hidden");
                } else {
                    this.modal.classList.add("sidebar-animating-out");
                    setTimeout(() => {
                        this.modal.classList.remove("sidebar-animating-out");
                        this.modal.classList.add("sidebar-hidden");
                    }, 150);
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
        if (FORCE_SIDEBAR_HIDDEN) {
            this.modal.classList.add("sidebar-hidden");
            toggleBtn.disabled = true;
            toggleBtn.style.opacity = "0.5";
        }
        // ! DUMMY BUTTON TO TOGGLE SIDEBAR END

        this.overlay.appendChild(toggleBtn); // ! Add to overlay instead of modal DEV NOTE
    }

    _createActionButton(text, className) {
        const btn = document.createElement("button");
        btn.className = `textbox-action-btn ${className}`;
        btn.textContent = text;
        return btn;
    }

    getContent() {
        return this.textboxContent ? this.textboxContent.value : "";
    }

    initializeDropdowns() {
        const structureDataStr = this.nodeDataProcessor.getWildcardsStructure();
        if (structureDataStr) {
            try {
                this.structureData = JSON.parse(structureDataStr);
                if (!this.dropdownManager) {
                    // Pass the scroll container, structureData, and processor
                    this.dropdownManager = new DropdownManager(
                        this.sidebarDropdownsScroll,
                        this.structureData,
                        this.nodeDataProcessor // <-- pass processor here
                    );
                } else {
                    this.dropdownManager.structureData = this.structureData;
                    this.dropdownManager.sidebar = this.sidebarDropdownsScroll;
                    this.dropdownManager.processor = this.nodeDataProcessor; // <-- update processor reference
                }
                this.dropdownManager.createDropdowns();
            } catch (e) {
                console.error("Error parsing structure data:", e);
            }
        }
    }

    async saveAndSync() {
        const content = this.getContent();
        try {
            this.nodeDataProcessor.updateNodeData({ wildcards_prompt: content });
            const response = await fetchSend(
                this.constants.MESSAGE_ROUTE,
                this.node.id,
                "update_wildcards_prompt",
                { content }
            );
            if (response.status === 'success' && response.wildcard_structure_data !== undefined) {
                this.nodeDataProcessor.updateNodeData({
                    wildcards_structure_data: response.wildcard_structure_data
                });
                this.structureData = JSON.parse(response.wildcard_structure_data);
                this.initializeDropdowns();
            }
            this.node.setDirtyCanvas(true, true);
            this.showSuccessMessage("Saved!");
        } catch (error) {
            console.error("Error saving content:", error);
            this.showErrorMessage("Save failed");
        }
    }

    setupEventHandlers() {
        this.clearBtn.addEventListener("click", () => {
            this.textboxContent.value = "";
            this.textboxContent.focus();
        });

        this.saveBtn.addEventListener("click", async () => {
            await this.saveAndSync();
        });

        // REMOVE APPLY BUTTON HANDLER AND POPUP LOGIC
        this.overlay.addEventListener("click", (event) => {
            if (event.target === this.overlay) {
                this.overlay.remove();
            }
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                this.overlay.remove();
            }
        });
    }

    showSuccessMessage(message) {
        const originalText = this.saveBtn.textContent;
        this.saveBtn.textContent = message;
        setTimeout(() => {
            this.saveBtn.textContent = originalText;
        }, 1000);
    }

    showErrorMessage(message) {
        alert(message);
    }
}