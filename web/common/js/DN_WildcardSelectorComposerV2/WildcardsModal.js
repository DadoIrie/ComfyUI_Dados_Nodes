import { getIcon } from "../svg_icons.js";
import { WildcardsMediator } from './WildcardsMediator.js';
import { DropdownManager } from './DropdownManager.js';
import { Textbox } from './Textbox.js';

export async function showWildcardSelectorModal(node, constants) {
    const modal = new WildcardsModal(node, constants);
    await modal.show();
}

class SpinnerManager {
    constructor() {
        this.spinnerOverlay = null;
        this.spinnerStyleId = 'wildcard-spinner-styles';
        this.spinnerTimeout = null;
    }

    showSpinner(delay = 500) {
        this.spinnerTimeout = setTimeout(() => {
            this.createSpinnerOverlay();
            this.addSpinnerStyles();
            document.body.appendChild(this.spinnerOverlay);
        }, delay);
    }

    hideSpinner() {
        if (this.spinnerTimeout) {
            clearTimeout(this.spinnerTimeout);
            this.spinnerTimeout = null;
        }
        this.removeSpinnerOverlay();
        this.removeSpinnerStyles();
    }

    createSpinnerOverlay() {
        this.spinnerOverlay = document.createElement("div");
        this.spinnerOverlay.id = "wildcard-spinner-overlay";
        
        const loadingContainer = this.createLoadingContainer();
        this.spinnerOverlay.appendChild(loadingContainer);
    }

    createLoadingContainer() {
        const container = document.createElement("div");
        container.className = "modal-loading-container";
        
        const spinner = document.createElement("div");
        spinner.className = "modal-loading-spinner";
        
        container.appendChild(spinner);
        return container;
    }

    removeSpinnerOverlay() {
        if (this.spinnerOverlay) {
            this.spinnerOverlay.remove();
            this.spinnerOverlay = null;
        }
    }

    showError(errorMessage) {
        const loadingContainer = this.spinnerOverlay?.querySelector('.modal-loading-container');
        if (loadingContainer) {
            loadingContainer.innerHTML = `
                <div class="modal-loading-error">${errorMessage}</div>
            `;
        }
    }

    addSpinnerStyles() {
        if (document.getElementById(this.spinnerStyleId)) {
            return;
        }
        
        const style = document.createElement('style');
        style.id = this.spinnerStyleId;
        style.textContent = this.getSpinnerStyles();
        document.head.appendChild(style);
    }

    removeSpinnerStyles() {
        const style = document.getElementById(this.spinnerStyleId);
        if (style) {
            style.remove();
        }
    }

    getSpinnerStyles() {
        return `
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
    }
}

class ModalUIBuilder {
    constructor(extensionName) {
        this.extensionName = extensionName;
    }

    createOverlay() {
        const existingOverlay = document.getElementById("wildcard-selector-composer-v2-overlay");
        if (existingOverlay) {
            existingOverlay.remove();
        }
        
        const overlay = document.createElement("div");
        overlay.id = "wildcard-selector-composer-v2-overlay";
        return overlay;
    }

    createModal() {
        const modal = document.createElement("div");
        modal.id = "wildcard-selector-composer-v2-modal";
        return modal;
    }

    createSidebar() {
        const sidebar = document.createElement("div");
        sidebar.className = "sidebar";
        
        const topbar = this.createSidebarTopbar();
        const scrollContainer = this.createSidebarScrollContainer();
        
        sidebar.appendChild(topbar);
        sidebar.appendChild(scrollContainer);
        
        return { sidebar, scrollContainer };
    }

    createSidebarTopbar() {
        const topbar = document.createElement("div");
        topbar.className = "topbar";
        return topbar;
    }

    createSidebarScrollContainer() {
        const container = document.createElement("div");
        container.className = "sidebar-dropdowns-scroll";
        return container;
    }

    createSidebarToggleButton(modal) {
        const button = document.createElement("button");
        button.textContent = "Toggle Sidebar";
        button.style.cssText = this.getToggleButtonStyles();
        
        button.onclick = () => this.handleSidebarToggle(modal);
        
        return button;
    }

    handleSidebarToggle(modal) {
        const FORCE_SIDEBAR_HIDDEN = false;
        
        if (FORCE_SIDEBAR_HIDDEN) {
            return;
        }
        
        if (modal.classList.contains("sidebar-hidden")) {
            modal.classList.remove("sidebar-hidden");
        } else {
            modal.classList.add("sidebar-animating-out");
            setTimeout(() => {
                modal.classList.remove("sidebar-animating-out");
                modal.classList.add("sidebar-hidden");
            }, 150);
        }
    }

    getToggleButtonStyles() {
        return `
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
    }

    async ensureCSSLoaded(extensionName) {
        const cssPath = `/extensions/${extensionName}/common/css/DN_WildcardSelectorComposerV2.css`;
        
        if (document.querySelector(`link[href="${cssPath}"]`)) {
            return;
        }
        
        return new Promise(resolve => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssPath;
            link.onload = resolve;
            link.onerror = () => {
                console.warn(`Failed to load CSS: ${cssPath}`);
                resolve();
            };
            document.head.appendChild(link);
        });
    }
}

class KeyboardShortcutManager {
    constructor() {
        this.handlers = new Map();
    }

    registerHandler(eventType, handler) {
        this.handlers.set(eventType, handler);
    }

    startListening() {
        this.keydownHandler = (event) => {
            if (event.key === "s" && event.ctrlKey && !event.altKey && !event.metaKey) {
                if (!event.target.closest(".CodeMirror")) {
                    event.preventDefault();
                    event.stopPropagation();
                    const handler = this.handlers.get('ctrl-s');
                    if (handler) handler(event);
                }
            }
            
            if (event.key === "Escape") {
                const handler = this.handlers.get('escape');
                if (handler) handler(event);
            }
        };
        
        document.addEventListener("keydown", this.keydownHandler, true);
    }

    stopListening() {
        if (this.keydownHandler) {
            document.removeEventListener("keydown", this.keydownHandler, true);
            this.keydownHandler = null;
        }
    }
}

class OverlayEventManager {
    constructor(overlay, onClose) {
        this.overlay = overlay;
        this.onClose = onClose;
        this.mouseDownOnOverlay = false;
    }

    setupEventListeners() {
        this.overlay.addEventListener("mousedown", (event) => {
            this.mouseDownOnOverlay = event.target === this.overlay;
        });
        
        this.overlay.addEventListener("mouseup", (event) => {
            if (this.mouseDownOnOverlay && event.target === this.overlay) {
                this.onClose();
            }
            this.mouseDownOnOverlay = false;
        });
    }
}

export class WildcardsModal {
    constructor(node, constants) {
        this.node = node;
        this.constants = constants;
        this.mediator = new WildcardsMediator(node, constants);
        this.spinnerManager = new SpinnerManager();
        this.uiBuilder = new ModalUIBuilder(constants.EXTENSION_NAME);
        this.keyboardManager = new KeyboardShortcutManager();
        
        this.dropdownManager = null;
        this.overlay = null;
        this.modal = null;
        this.textbox = null;
        this.sidebar = null;
        this.sidebarDropdownsScroll = null;
        this.structureData = null;
    }

    async show() {
        this.spinnerManager.showSpinner();
        this.setupKeyboardShortcuts();
        
        try {
            await this.loadResourcesAndInitialize();
            this.spinnerManager.hideSpinner();
        } catch (error) {
            console.error("Error loading modal resources:", error);
            this.spinnerManager.showError("Error loading modal");
        }
    }

    async loadResourcesAndInitialize() {
        await this.uiBuilder.ensureCSSLoaded(this.constants.EXTENSION_NAME);
        
        this.spinnerManager.hideSpinner();
        
        this.createModalComponents();
        await this.initializeTextbox();
        this.assembleModal();
        this.initializeDropdowns();
        this.setupEventHandlers();
        
        document.body.appendChild(this.overlay);
    }

    createModalComponents() {
        this.overlay = this.uiBuilder.createOverlay();
        this.modal = this.uiBuilder.createModal();
        
        const { sidebar, scrollContainer } = this.uiBuilder.createSidebar();
        this.sidebar = sidebar;
        this.sidebarDropdownsScroll = scrollContainer;
    }

    async initializeTextbox() {
        this.textbox = new Textbox(this.node, this.mediator, {
            constants: this.constants,
            onStructureUpdate: (newStructure) => this.handleStructureUpdate(newStructure)
        });
        
        this.mediator.setTextbox(this.textbox);
        this.setupMediatorEventListeners();
        
        const textboxElement = await this.textbox.createTextbox();
        return textboxElement;
    }

    setupMediatorEventListeners() {
        this.mediator.addEventListener('save-success', (event) => {
            this.textbox.showSuccessMessage(event.detail);
        });
        
        this.mediator.addEventListener('save-error', (event) => {
            this.textbox.showErrorMessage(event.detail);
        });
        
        this.mediator.addEventListener('structure-updated', (event) => {
            this.handleStructureUpdate(event.detail);
        });
    }

    handleStructureUpdate(newStructure) {
        this.structureData = newStructure;
        this.initializeDropdowns();
        
        if (this.textbox && this.textbox.clearMarks) {
            this.textbox.clearMarks('wildcard-mark');
            this.textbox.clearMarks('option-mark');
        }
    }

    assembleModal() {
        const textboxElement = this.textbox.textbox;
        if (textboxElement) {
            this.modal.appendChild(textboxElement);
        }
        this.modal.appendChild(this.sidebar);
        this.overlay.appendChild(this.modal);
        
        const toggleButton = this.uiBuilder.createSidebarToggleButton(this.modal);
        this.overlay.appendChild(toggleButton);
    }

    initializeDropdowns() {
        const structureData = this.getStructureData();
        
        if (!structureData) {
            return;
        }
        
        if (!this.dropdownManager) {
            this.dropdownManager = new DropdownManager(
                this.sidebarDropdownsScroll,
                structureData,
                this.mediator
            );
        } else {
            this.updateDropdownManager(structureData);
        }
        
        this.mediator.setDropdownManager(this.dropdownManager);
    }

    getStructureData() {
        if (this.structureData) {
            return this.structureData;
        }
        
        const structureString = this.mediator.getWildcardsStructure();
        if (!structureString) {
            return null;
        }
        
        try {
            this.structureData = JSON.parse(structureString);
            return this.structureData;
        } catch (error) {
            console.error("Error parsing structure data:", error);
            return null;
        }
    }

    updateDropdownManager(structureData) {
        this.dropdownManager.structureData = structureData;
        this.dropdownManager.sidebar = this.sidebarDropdownsScroll;
        this.dropdownManager.mediator = this.mediator;
        this.dropdownManager.render();
    }

    setupKeyboardShortcuts() {
        this.keyboardManager.registerHandler('escape', () => this.close());
        this.keyboardManager.startListening();
    }

    setupEventHandlers() {
        const overlayEventManager = new OverlayEventManager(this.overlay, () => this.close());
        overlayEventManager.setupEventListeners();
    }

    close() {
        this.keyboardManager.stopListening();
        this.spinnerManager.hideSpinner();
        
        if (this.overlay) {
            this.overlay.remove();
        }
    }
}