import { getIcon } from "../svg_icons.js";
import { WildcardsMediator } from './WildcardsMediator.js';
import { DropdownManager } from './DropdownManager.js';
import { Textbox } from './Textbox.js';

export async function showWildcardSelectorModal(node, constants) {
    const modal = new WildcardsModal(node, constants);
    await modal.show();
}

export class WildcardsModal {
    constructor(node, constants) {
        this.node = node;
        this.constants = constants;
        this.mediator = new WildcardsMediator(node, constants);
        this.dropdownManager = null;
        this.overlay = null;
        this.modal = null;
        this.textbox = null;
        this.structureData = null;
    }

    async show() {
    this.createSpinnerModal();
    
    this.addSpinnerStyles();
    
    document.body.appendChild(this.spinnerOverlay);
    this._addGlobalCtrlSBlocker();
    
    // TEMPORARY: Add 5-second delay for testing loading spinner
    /* await new Promise(resolve => setTimeout(resolve, 5000)); */
    
    await this.loadResourcesAndInitialize();
}

async loadResourcesAndInitialize() {
    try {
        await this.ensureCSSLoaded();
        
        this.removeSpinnerModal();
        
        this.createOverlay();
        this.createModal();
        this.createSidebar();
        
        const textboxNode = await this.initializeTextbox();
        this.modal.appendChild(textboxNode);
        this.modal.appendChild(this.sidebar);
        this.initializeDropdowns();
        
        this.overlay.appendChild(this.modal);
        this.setupOverlayCloseHandlers();
        
        this.createSidebarToggleButton();
        
        document.body.appendChild(this.overlay);
    } catch (error) {
        console.error("Error loading modal resources:", error);
        const loadingContainer = this.spinnerOverlay.querySelector('.modal-loading-container');
        if (loadingContainer) {
            loadingContainer.innerHTML = `
                <div class="modal-loading-error">Error loading modal</div>
            `;
        }
    }
}

createSpinnerModal() {
    this.spinnerOverlay = document.createElement("div");
    this.spinnerOverlay.id = "wildcard-spinner-overlay";
    
    const loadingContainer = document.createElement("div");
    loadingContainer.className = "modal-loading-container";
    
    const spinner = document.createElement("div");
    spinner.className = "modal-loading-spinner";
    
    loadingContainer.appendChild(spinner);
    this.spinnerOverlay.appendChild(loadingContainer);
}

removeSpinnerModal() {
    if (this.spinnerOverlay) {
        this.spinnerOverlay.remove();
        this.spinnerOverlay = null;
    }
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

    initializeTextbox() {
        this.textbox = new Textbox(this.node, this.mediator, {
            constants: this.constants,
            onStructureUpdate: (newStructure) => {
                this.structureData = newStructure;
                this.initializeDropdowns();
            }
        });
        
        this.mediator.setTextbox(this.textbox);
        
        this.mediator.addEventListener('save-success', (event) => {
            this.textbox.showSuccessMessage(event.detail);
        });
        
        this.mediator.addEventListener('save-error', (event) => {
            this.textbox.showErrorMessage(event.detail);
        });
        
        this.mediator.addEventListener('structure-updated', (event) => {
            this.structureData = event.detail;
            this.initializeDropdowns();
        });
        
        return this.textbox.createTextbox();
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
        this.sidebarDropdownsScroll = document.createElement("div");
        this.sidebarDropdownsScroll.className = "sidebar-dropdowns-scroll";
        this.sidebar.appendChild(this.sidebarDropdownsScroll);
    }

    createSidebarToggleButton() {
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
        this.overlay.appendChild(toggleBtn);
    }

    initializeDropdowns() {
        const structureDataStr = this.mediator.getWildcardsStructure();
        
        if (structureDataStr) {
            this.structureData = JSON.parse(structureDataStr);
            
            if (!this.dropdownManager) {
                this.dropdownManager = new DropdownManager(
                    this.sidebarDropdownsScroll,
                    this.structureData,
                    this.mediator
                );
            } else {
                this.dropdownManager.structureData = this.structureData;
                this.dropdownManager.sidebar = this.sidebarDropdownsScroll;
                this.dropdownManager.mediator = this.mediator;
            }
            
            this.mediator.setDropdownManager(this.dropdownManager);
        }
    }

    _addGlobalCtrlSBlocker() {
        this._globalCtrlSHandler = (event) => {
            if (event.key === "s" && event.ctrlKey && !event.altKey && !event.metaKey) {
                if (!event.target.closest(".CodeMirror")) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            }
        };
        document.addEventListener("keydown", this._globalCtrlSHandler, true);
    }

    _removeGlobalCtrlSBlocker() {
        if (this._globalCtrlSHandler) {
            document.removeEventListener("keydown", this._globalCtrlSHandler, true);
            this._globalCtrlSHandler = null;
        }
    }

    setupOverlayCloseHandlers() {
        let mouseDownOnOverlay = false;
        this.overlay.addEventListener("mousedown", (event) => {
            if (event.target === this.overlay) {
                mouseDownOnOverlay = true;
            } else {
                mouseDownOnOverlay = false;
            }
        });
        this.overlay.addEventListener("mouseup", (event) => {
            if (mouseDownOnOverlay && event.target === this.overlay) {
                this.close();
            }
            mouseDownOnOverlay = false;
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                this.close();
            }
        });
    }

    close() {
        this._removeGlobalCtrlSBlocker();
        this.removeSpinnerStyles();
        this.removeSpinnerModal();
        if (this.overlay) {
            this.overlay.remove();
        }
    }

    addSpinnerStyles() {
        if (document.getElementById('wildcard-spinner-styles')) {
            return;
        }
        
        const style = document.createElement('style');
        style.id = 'wildcard-spinner-styles';
        style.textContent = `
            @keyframes modal-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            #wildcard-spinner-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.5);
                z-index: 20000;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .modal-loading-container {
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                padding: 40px;
                background: rgb(25, 25, 25);
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                width: 200px;
                height: 120px;
            }
            
            .modal-loading-spinner {
                width: 40px;
                height: 40px;
                border: 4px solid rgba(255, 255, 255, 0.3);
                border-top: 4px solid rgb(25, 25, 25);
                border-radius: 50%;
                animation: modal-spin 1s linear infinite;
            }
        `;
        document.head.appendChild(style);
    }

    removeSpinnerStyles() {
        const style = document.getElementById('wildcard-spinner-styles');
        if (style) {
            style.remove();
        }
    }
}