import { getIcon } from "../svg_icons.js";
import { fetchSend } from "../utils.js";
import { WildcardsProcessor } from './NodeDataProcessor.js';

export class WildcardsModal {
    constructor(node, constants) {
        this.node = node;
        this.constants = constants;
        this.nodeDataProcessor = new WildcardsProcessor(node);
        this.overlay = null;
        this.modal = null;
        this.textboxContent = null;
        this.structureData = null; // Store structure data
    }

    async show() {
        await this.ensureCSSLoaded();
        await this.loadStructureData(); // Load structure data
        this.createElements();
        this.setupEventHandlers();
        document.body.appendChild(this.overlay);
    }

    async ensureCSSLoaded() {
        const cssHref = `/extensions/${this.constants.EXTENSION_NAME}/common/css/DN_WildcardSelectorComposerV2.css`;
        
        if (document.querySelector(`link[href="${cssHref}"]`)) {
            return Promise.resolve();
        }
        
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssHref;
            
            link.onload = () => resolve();
            link.onerror = () => {
                console.warn(`Failed to load CSS: ${cssHref}`);
                resolve();
            };
            
            document.head.appendChild(link);
        });
    }

    async loadStructureData() {
        this.structureData = await this.nodeDataProcessor.loadStructureData(this.constants);
        console.log("Loaded structure data:", this.structureData);
    }

    createElements() {
        this.createOverlay();
        this.createModal();
        this.createTextbox();
        this.createSidebar();
        this.createActionButtons();
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
        this.sidebar.appendChild(sidebarTopbar);
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
        
        const nodeData = this.nodeDataProcessor.getNodeData();
        if (nodeData && nodeData.wildcards_prompt) {
            this.textboxContent.value = nodeData.wildcards_prompt;
        }
        
        this.textbox.appendChild(this.textboxContent);
    }

    createActionButtons() {
        const actionBar = document.createElement("div");
        actionBar.className = "textbox-action-bar";

        const clearBtn = document.createElement("button");
        clearBtn.className = "textbox-action-btn clear";
        clearBtn.textContent = "Clear";

        const saveBtn = document.createElement("button");
        saveBtn.className = "textbox-action-btn save";
        saveBtn.textContent = "Save";

        this.clearBtn = clearBtn;
        this.saveBtn = saveBtn;

        actionBar.appendChild(clearBtn);
        actionBar.appendChild(saveBtn);
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

        this.modal.appendChild(this.textbox);
        this.modal.appendChild(this.sidebar);
        this.overlay.appendChild(this.modal);
        
        this.overlay.appendChild(toggleBtn); // ! Add to overlay instead of modal DEV NOTE
    }

    getContent() {
        return this.textboxContent ? this.textboxContent.value : "";
    }
    
    async saveAndSync() {
        const content = this.getContent();
        
        try {
            // Update prompt content
            this.nodeDataProcessor.updateNodeData({
                wildcards_prompt: content
            });
            
            // Save prompt content to backend and get structure data
            const response = await fetchSend(
                this.constants.MESSAGE_ROUTE, 
                this.node.id, 
                "update_clean_wildcards_prompt", 
                { content: content }
            );
            
            // Update structure data from response
            if (response.status === 'success' && response.structure_data) {
                this.structureData = response.structure_data;
                
                // Save structure data to widget
                await this.nodeDataProcessor.saveStructureData(this.structureData, this.constants);
            }
            
            // **REFRESH CANVAS - This triggers node re-execution**
            this.node.setDirtyCanvas(true, true);
            
            // Alternative methods for canvas refresh:
            // app.graph.setDirtyCanvas(true, true); // Global canvas refresh
            // this.node.onResize?.(this.node.size); // Force node resize/redraw
            
            // Show success feedback
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

        const closeAnimationHandler = (event) => {
            if (event.target === this.overlay && event.animationName === 'fadeOut') {
                this.overlay.removeEventListener("animationend", closeAnimationHandler);
                this.overlay.remove();
            }
        };

        const closeHandler = (event) => {
            if (
                (event.type === "click" && event.target === this.overlay) ||
                (event.type === "keydown" && event.key === "Escape")
            ) {
                this.overlay.classList.add("closing");
                this.modal.classList.add("closing");
                
                if (this.modal.classList.contains("sidebar-hidden")) {
                    this.overlay.classList.add("sidebar-hidden");
                }
                
                this.overlay.removeEventListener("click", closeHandler);
                document.removeEventListener("keydown", closeHandler);
                this.overlay.addEventListener("animationend", closeAnimationHandler);
            }
        };

        this.overlay.addEventListener("click", closeHandler);
        document.addEventListener("keydown", closeHandler);
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