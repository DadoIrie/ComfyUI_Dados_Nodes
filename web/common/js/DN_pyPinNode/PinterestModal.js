export async function showPinterestModal(node, constants, fetchSend, mappings) {
    const modal = new PinterestModal(node, constants, fetchSend, mappings);
    return await modal.show();
}

class SpinnerManager {
    constructor() {
        this.spinnerOverlay = null;
        this.spinnerStyleId = 'pinterest-spinner-styles';
        this.spinnerTimeout = null;
        this.keydownHandler = null;
    }

    showSpinner(delay = 500) {
        this.spinnerTimeout = setTimeout(() => {
            this.createSpinnerOverlay();
            this.addSpinnerStyles();
            document.body.appendChild(this.spinnerOverlay);
            this.addEscKeyHandler();
        }, delay);
    }

    hideSpinner() {
        if (this.spinnerTimeout) {
            clearTimeout(this.spinnerTimeout);
            this.spinnerTimeout = null;
        }
        this.removeEscKeyHandler();
        this.removeSpinnerOverlay();
        this.removeSpinnerStyles();
    }

    createSpinnerOverlay() {
        this.spinnerOverlay = document.createElement("div");
        this.spinnerOverlay.id = "pinterest-spinner-overlay";
        
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
        console.error("Pinterest Modal Error:", errorMessage);
        const loadingContainer = this.spinnerOverlay?.querySelector('.modal-loading-container');
        if (loadingContainer) {
            loadingContainer.innerHTML = `
                <div class="modal-loading-error">${errorMessage}</div>
                <div class="modal-error-actions">
                    <button class="modal-close-button">Close</button>
                </div>
            `;
            
            // Add close button functionality
            const closeButton = loadingContainer.querySelector('.modal-close-button');
            closeButton.addEventListener('click', () => {
                this.hideSpinner();
            });
        }
    }
    
    addEscKeyHandler() {
        this.keydownHandler = (event) => {
            if (event.key === 'Escape') {
                this.hideSpinner();
            }
        };
        document.addEventListener('keydown', this.keydownHandler);
    }
    
    removeEscKeyHandler() {
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
            this.keydownHandler = null;
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
            
            #pinterest-spinner-overlay {
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
                min-height: 120px;
            }
            
            .modal-loading-spinner {
                width: 40px;
                height: 40px;
                border: 4px solid rgba(255, 255, 255, 0.3);
                border-top: 4px solid rgb(25, 25, 25);
                border-radius: 50%;
                animation: modal-spin 1s linear infinite;
            }
            
            .modal-loading-error {
                color: #ff6b6b;
                font-size: 14px;
                text-align: center;
                margin-bottom: 15px;
            }
            
            .modal-error-actions {
                margin-top: 15px;
            }
            
            .modal-close-button {
                background: #ff6b6b;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: background 0.2s;
            }
            
            .modal-close-button:hover {
                background: #ff5252;
            }
        `;
    }
}

class ModalUIBuilder {
    constructor(extensionName) {
        this.extensionName = extensionName;
    }

    createOverlay() {
        const existingOverlay = document.getElementById("pinterest-modal-overlay");
        if (existingOverlay) {
            existingOverlay.remove();
        }
        
        const overlay = document.createElement("div");
        overlay.id = "pinterest-modal-overlay";
        return overlay;
    }

    createModal() {
        const modal = document.createElement("div");
        modal.id = "pinterest-modal";
        return modal;
    }

    async ensureCSSLoaded(extensionName) {
        const cssPath = `/extensions/${extensionName}/common/css/dn_pinterest_modal.css`;
        
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
        
        // Add ESC key listener for closing modal
        this.keydownHandler = (event) => {
            if (event.key === 'Escape') {
                this.onClose();
            }
        };
        document.addEventListener('keydown', this.keydownHandler);
    }
    
    removeEventListeners() {
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
            this.keydownHandler = null;
        }
    }
}

export class PinterestModal {
    constructor(node, constants, fetchSend, mappings) {
        this.node = node;
        this.constants = constants;
        this.fetchSend = fetchSend;
        this.mappings = mappings;
        this.spinnerManager = new SpinnerManager();
        this.uiBuilder = new ModalUIBuilder(constants.EXTENSION_NAME);
        
        this.overlay = null;
        this.modal = null;
        this.imageGrid = null;
        this.pinUrls = [];
        this.loadedImages = new Set();
        this.intersectionObserver = null;
        this.selectedImageUrl = null;
        this.imagesPerBatch = 20; // Number of images to load initially and per batch
        this.overlayEventManager = null;
    }

    async show() {
        this.spinnerManager.showSpinner();
        
        try {
            // Get configs from node
            const configsWidget = this.node.widgets.find(w => w.name === "node_configs");
            const configs = configsWidget ? JSON.parse(configsWidget.value) : {};
            
            // Debug: Log configs being read by modal
            console.log("Modal reading configs:", configs);
            
            // Extract required values from configs
            const username = configs.username || "";
            let board = configs.board;
            let section = configs.section;
            const api_requests = configs.api_requests;
            
            // Debug: Log values being sent to backend
            console.log("Modal sending to backend - username:", username, "board:", board, "section:", section, "api_requests:", api_requests);
            
            // Convert board display name to actual name if needed
            if (board && board !== "all" && this.mappings && this.mappings.displayToBoardName) {
                console.log("Modal board before conversion:", board);
                console.log("Modal available board mappings:", this.mappings.displayToBoardName);
                board = this.mappings.displayToBoardName[board] || board;
                console.log("Modal converted board to:", board);
            }
            
            // Convert section display name to actual name if needed
            if (section && section !== "included" && section !== "excluded" && this.mappings && this.mappings.displayToSectionName) {
                console.log("Modal section before conversion:", section);
                console.log("Modal available section mappings:", this.mappings.displayToSectionName);
                section = this.mappings.displayToSectionName[section] || section;
                console.log("Modal converted section to:", section);
            }
            
            // Get the pinterest pins from backend
            const response = await this.fetchSend(this.constants.MESSAGE_ROUTE, this.node.id, "get_pinterest_pins", {
                username: username,
                board_name: board,
                section: section,
                api_requests: api_requests
            });
            
            
            this.pinUrls = response.pin_urls;
            console.log("Pin URLs:", this.pinUrls.length);
            
            // Check if the array is empty and show error message
            if (!this.pinUrls || this.pinUrls.length === 0) {
                console.log("No images found, showing error message");
                this.spinnerManager.showError("No images found for the selected board/section");
                
                // Auto-close spinner after 3 seconds on error
                setTimeout(() => {
                    this.spinnerManager.hideSpinner();
                }, 3000);
                
                return null;
            }
            this.spinnerManager.hideSpinner();
            
            await this.loadResourcesAndInitialize();
            
            // Return a promise that resolves when an image is selected or modal is closed
            return new Promise((resolve) => {
                this.imageSelectionResolve = resolve;
            });
        } catch (error) {
            console.error("Error loading modal resources:", error);
            this.spinnerManager.showError("Error loading modal");
            
            // Auto-close spinner after 3 seconds on error
            setTimeout(() => {
                this.spinnerManager.hideSpinner();
            }, 3000);
            
            return null;
        }
    }

    async loadResourcesAndInitialize() {
        await this.uiBuilder.ensureCSSLoaded(this.constants.EXTENSION_NAME);
        
        this.spinnerManager.hideSpinner();
        
        this.createModalComponents();
        this.setupEventHandlers();
        this.setupIntersectionObserver();
        this.initializeImageGrid();
        
        document.body.appendChild(this.overlay);
    }

    createModalComponents() {
        this.overlay = this.uiBuilder.createOverlay();
        this.modal = this.uiBuilder.createModal();
        this.overlay.appendChild(this.modal);
        
        // Create modal content
        this.modalContent = document.createElement('div');
        this.modalContent.className = 'pinterest-modal-content';
        this.modal.appendChild(this.modalContent);
    }

    setupEventHandlers() {
        this.overlayEventManager = new OverlayEventManager(this.overlay, () => this.close());
        this.overlayEventManager.setupEventListeners();
    }

    initializeImageGrid() {
        this.imageGrid = document.createElement('div');
        this.imageGrid.className = 'pinterest-image-grid';
        this.modalContent.appendChild(this.imageGrid);
        
        // Create shadow elements
        this.shadowTop = document.createElement('div');
        this.shadowTop.className = 'pinterest-shadow-top';
        
        this.shadowBottom = document.createElement('div');
        this.shadowBottom.className = 'pinterest-shadow-bottom';
        
        this.modalContent.appendChild(this.shadowTop);
        this.modalContent.appendChild(this.shadowBottom);
        
        // Add scroll event listener as a backup for fast scrolling
        this.imageGrid.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });
        
        // Load initial batch of images
        this.loadImageBatch(0, this.imagesPerBatch);
    }
    
    setupIntersectionObserver() {
        this.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const index = parseInt(entry.target.dataset.index);
                    this.loadImage(index);
                }
            });
        }, {
            root: this.imageGrid,
            rootMargin: '200px', // Increased margin for earlier loading
            threshold: 0.01 // Lower threshold for earlier detection
        });
    }
    
    handleScroll() {
        // Throttle scroll events
        if (this.scrollTimeout) {
            return;
        }
        
        this.scrollTimeout = setTimeout(() => {
            this.checkVisiblePlaceholders();
            this.scrollTimeout = null;
        }, 100);
    }
    
    checkVisiblePlaceholders() {
        const containers = this.imageGrid.querySelectorAll('.pinterest-image-container:not([data-loaded])');
        const gridRect = this.imageGrid.getBoundingClientRect();
        
        containers.forEach(container => {
            const rect = container.getBoundingClientRect();
            // Check if container is visible or close to visible
            if (rect.top < gridRect.bottom + 300 && rect.bottom > gridRect.top - 300) {
                const index = parseInt(container.dataset.index);
                if (!this.loadedImages.has(index)) {
                    this.loadImage(index);
                }
            }
        });
    }
    
    loadImageBatch(startIndex, count) {
        const endIndex = Math.min(startIndex + count, this.pinUrls.length);
        
        for (let i = startIndex; i < endIndex; i++) {
            this.createImagePlaceholder(i);
        }
    }
    
    createImagePlaceholder(index) {
        const container = document.createElement('div');
        container.className = 'pinterest-image-container';
        container.dataset.index = index;
        
        const placeholder = document.createElement('div');
        placeholder.className = 'pinterest-image-loading';
        
        container.appendChild(placeholder);
        this.imageGrid.appendChild(container);
        
        // Observe this placeholder for lazy loading
        this.intersectionObserver.observe(container);
    }
    
    loadImage(index) {
        if (this.loadedImages.has(index)) return;
        
        const container = this.imageGrid.querySelector(`[data-index="${index}"]`);
        if (!container) return;
        
        // Mark as loading to prevent duplicate loading
        if (container.dataset.loading === 'true') return;
        container.dataset.loading = 'true';
        
        const imageUrl = this.pinUrls[index];
        const img = document.createElement('img');
        img.className = 'pinterest-image';
        img.dataset.index = index;
        
        img.onload = () => {
            const placeholder = container.querySelector('.pinterest-image-loading');
            if (placeholder) {
                placeholder.replaceWith(img);
            }
            
            // Set the container height to match the image height exactly
            const renderedHeight = img.offsetHeight;
            container.style.height = `${renderedHeight}px`;
            
            // Calculate row span for grid layout (minimum 1)
            const rowSpan = Math.max(1, Math.ceil(renderedHeight / 10));
            container.style.gridRowEnd = `span ${rowSpan}`;
            
            this.loadedImages.add(index);
            container.dataset.loaded = 'true';
            delete container.dataset.loading;
            
            // Load more images if we're near the end
            if (this.loadedImages.size % this.imagesPerBatch === 0 &&
                this.loadedImages.size < this.pinUrls.length) {
                this.loadImageBatch(this.loadedImages.size, this.imagesPerBatch);
            }
        };
        
        img.onerror = () => {
            console.error(`Failed to load image: ${imageUrl}`);
            // Remove the placeholder on error
            container.remove();
            delete container.dataset.loading;
        };
        
        img.src = imageUrl;
        
        // Add click handler
        img.addEventListener('click', () => this.selectImage(imageUrl, container));
    }
    
    selectImage(imageUrl, container) {
        // Remove previous selection
        const prevSelected = this.imageGrid.querySelector('.pinterest-image-selected');
        if (prevSelected) {
            prevSelected.classList.remove('pinterest-image-selected');
        }
        
        // Add selection to current image
        container.classList.add('pinterest-image-selected');
        this.selectedImageUrl = imageUrl;
        
        console.log(`Selected image: ${imageUrl}`);
        
        // Close the modal after selection and return the selected URL
        setTimeout(() => this.close(this.selectedImageUrl), 300);
    }
    
    close(selectedImageUrl = null) {
        this.spinnerManager.hideSpinner();
        
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }
        
        // Clean up scroll event listener
        if (this.imageGrid && this.scrollTimeout) {
            this.imageGrid.removeEventListener('scroll', this.handleScroll);
            clearTimeout(this.scrollTimeout);
        }
        
        // Remove event listeners
        if (this.overlayEventManager) {
            this.overlayEventManager.removeEventListeners();
        }
        
        if (this.overlay) {
            this.overlay.remove();
        }
        
        // Remove shadow elements
        if (this.shadowTop) {
            this.shadowTop.remove();
        }
        
        if (this.shadowBottom) {
            this.shadowBottom.remove();
        }
        
        // Resolve the promise with the selected image URL if provided
        if (this.imageSelectionResolve) {
            this.imageSelectionResolve(selectedImageUrl);
        }
    }
}