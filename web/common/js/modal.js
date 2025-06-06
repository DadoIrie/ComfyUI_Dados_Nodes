import { getIcon } from "./svg_icons.js";

class ModalView {
  constructor() {
    this.loadCSS();
    this.createElements();
    this.applyStyles();
    this.assembleModal();
  }

  loadCSS() {
    if (!document.querySelector('link[href$="/dn_modal.css"]')) {
      const cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = '/extensions/ComfyUI_Dados_Nodes/common/css/dn_modal.css';
      document.head.appendChild(cssLink);
    }
  }

  createElements() {
    this.overlay = document.createElement('div');
    this.modal = document.createElement('div');
    this.contentWrapper = document.createElement('div');
    this.resizeHandle = document.createElement('div');
    this.closeButton = document.createElement('button');
  }

  applyStyles() {
    this.overlay.className = 'dn_overlay';
    this.modal.className = 'dn_modal';
    this.contentWrapper.className = 'dn_content_wrapper';
    /* this.resizeHandle.className = 'dn_resize_handle'; */
    this.closeButton.className = 'dn_close_button';
    this.closeButton.innerHTML = getIcon('x');

    const commonTransition = 'opacity 0.2s ease-out';
    this.overlay.style.transition = commonTransition;
    this.modal.style.transition = 'transform 0.2s ease-out, ' + commonTransition;
    this.contentWrapper.style.transition = 'opacity 0.1s ease-out';
    // this.closeButton.style.transition = 'all 0.5s ease-out';

    this.modal.tabIndex = -1;
    this.resetModalState();
  }

  assembleModal() {
    this.modal.appendChild(this.resizeHandle);
    this.modal.appendChild(this.closeButton);
    this.modal.appendChild(this.contentWrapper);
  }

  resetModalState() {
    this.modal.style.opacity = '0';
    this.modal.style.transform = 'translate(-50%, -50%) scale(0)';
    this.overlay.style.opacity = '0';
  }

  render() {
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.modal);
    this.modal.offsetHeight;
  }

  setContent(content) {
    this.contentWrapper.appendChild(content);
  }

  show() {
    requestAnimationFrame(() => {
      this.modal.style.opacity = '1';
      this.modal.style.transform = 'translate(-50%, -50%) scale(1)';
      this.overlay.style.opacity = '1';
      this.modal.focus();
    });
  }

  close() {
    this.contentWrapper.style.opacity = '0';
    this.resetModalState();
  }

  remove() {
    this.modal.remove();
    this.overlay.remove();
  }
}

class ModalModel {
  constructor(config) {
    this.view = new ModalView();
    this.config = config;
    this.customLogic = config.customLogic || (() => {});
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.view.closeButton.onclick = () => this.closeModal();
    this.view.overlay.onclick = () => this.closeModal();
    document.addEventListener('keydown', (event) => this.handleEscapeKey(event));
    /* this.view.modal.onclick = (event) => event.stopPropagation(); */
    /* this.setupResize(); */
  }

/*   setupResize() {
    let isResizing = false;
  
    const initResize = (e) => {
      isResizing = true;
      document.addEventListener('mousemove', resize, false);
      document.addEventListener('mouseup', stopResize, false);
    };
  
    const resize = (e) => {
      if (isResizing) {
        const modalRect = this.view.modal.getBoundingClientRect();
        const newWidth = e.clientX - modalRect.left;
        const newHeight = e.clientY - modalRect.top;
        const maxWidth = window.innerWidth * 0.9;
        const maxHeight = window.innerHeight * 0.9;
        const minWidth = window.innerWidth * 0.2;
        const minHeight = window.innerHeight * 0.2;
  
        if (newWidth >= minWidth && newWidth <= maxWidth) {
          this.view.modal.style.width = newWidth + 'px';
        }
        if (newHeight >= minHeight && newHeight <= maxHeight) {
          this.view.modal.style.height = newHeight + 'px';
        }
      }
    };
  
    const stopResize = () => {
      isResizing = false;
      document.removeEventListener('mousemove', resize, false);
      document.removeEventListener('mouseup', stopResize, false);
    };
  
    this.view.resizeHandle.addEventListener('mousedown', initResize, false);
  }
    
   */
  
  
  
  handleEscapeKey(event) {
    if (event.key === 'Escape') {
      this.closeModal();
    }
  }

  closeModal() {
    let delay = 0;
    if (typeof this.config.onClose === 'function') {
        delay = this.config.onClose() || 0;
    }
    
    setTimeout(() => {
        this.view.close();
        setTimeout(() => {
            this.view.remove();
        }, 200);
    }, delay);
  }

  render() {
    this.processContent();
    this.view.render();
    setTimeout(() => this.view.show(), 10);
  }

  async processContent() {
    let testString = 'test from modal';
    if (this.config.content) {
      this.view.setContent(this.config.content);
    }
    if (typeof this.config.customLogic === 'function') {
      await this.config.customLogic(this, testString);
    }
  }
}

export function createModal(config) {
  const modalModel = new ModalModel(config);
  modalModel.render();
  return modalModel;
}
