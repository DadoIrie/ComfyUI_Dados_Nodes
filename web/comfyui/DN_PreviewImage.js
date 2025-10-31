import { app } from "../../scripts/app.js"

app.registerExtension({
    name: "DN_PreviewImage",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "DN_PreviewImage") {

            nodeType.prototype.onNodeCreated = function() {
                this.imageUrl = null;
                this.videoUrl = null;
                this.loadedImage = null;
                this.loadedVideo = null;
                this.hasAdjustedHeight = false;
            };
            
            const original_getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
            nodeType.prototype.getExtraMenuOptions = function(_, options) {
                original_getExtraMenuOptions?.apply(this, arguments);
                if (this.imageUrl) {
                    options.push({
                        content: "Copy Image",
                        callback: async () => {
                            const blob = await fetch(this.imageUrl).then(r => r.blob());
                            const item = new ClipboardItem({ [blob.type]: blob });
                            navigator.clipboard.write([item]);
                        }
                    });
                } else if (this.videoUrl) {
                    options.push({
                        content: "Copy Video URL",
                        callback: () => {
                            navigator.clipboard.writeText(this.videoUrl);
                        }
                    });
                }
            };
            
            nodeType.prototype.onDrawBackground = function(ctx) {
                if (this.flags?.collapsed || (!this.imageUrl && !this.videoUrl)) {
                    return;
                }

                if (this.loadedImage && this.loadedImage.src !== this.imageUrl) {
                    this.loadedImage = null;
                    this.hasAdjustedHeight = false;
                }
                if (this.loadedVideo && this.loadedVideo.src !== this.videoUrl) {
                    this.loadedVideo = null;
                    this.hasAdjustedHeight = false;
                }

                const MARGIN = 10;
                const availableWidth = this.size[0] - MARGIN * 2;
                const initialHeight = this.computeSize()[1];
                const availableHeight = this.size[1] - initialHeight - MARGIN;

                const RESOLUTION_STYLE = {
                    font: "12px Arial",
                    color: "#aaaaaa",
                    textAlign: "center"
                };

                const getResolutionText = (mediaElement) => {
                    return `${mediaElement.videoWidth || mediaElement.width} x ${mediaElement.videoHeight || mediaElement.height}`;
                };

                const drawResolution = (mediaElement, mediaHeight) => {
                    ctx.font = RESOLUTION_STYLE.font;
                    ctx.fillStyle = RESOLUTION_STYLE.color;
                    ctx.textAlign = RESOLUTION_STYLE.textAlign;
                    const textY = initialHeight + mediaHeight + 14;
                    ctx.fillText(getResolutionText(mediaElement), this.size[0] / 2, textY);
                };

                const drawMediaAndResolution = (mediaElement, mediaWidth, mediaHeight, aspectRatio) => {
                    ctx.drawImage(mediaElement,
                        MARGIN + (availableWidth - mediaWidth) / 2,
                        initialHeight,
                        mediaWidth, mediaHeight);
                    drawResolution(mediaElement, mediaHeight);
                };


                const loadAndDrawImage = () => {
                    if (!this.loadedImage && this.imageUrl) {
                        console.log("Loading image:", this.imageUrl);
                        this.loadedImage = new Image();
                        this.loadedImage.src = this.imageUrl;
                        this.loadedImage.onload = () => {
                            this.cachedImgAspectRatio = this.loadedImage.height / this.loadedImage.width;
                            if (!this.hasAdjustedHeight) {
                                // const extraSpace = 20;
                                this.size[1] = initialHeight + Math.min(availableWidth, this.loadedImage.width) * this.cachedImgAspectRatio;
                                this.hasAdjustedHeight = true;
                            }
                            this.setDirtyCanvas(true);
                        };
                        this.loadedImage.onerror = () => {
                            console.error("Failed to load image:", this.imageUrl);
                        };
                    } else if (this.loadedImage && this.loadedImage.complete) {
                       const mediaWidth = Math.min(availableWidth, this.loadedImage.width, availableHeight / this.cachedImgAspectRatio);
                       const mediaHeight = mediaWidth * this.cachedImgAspectRatio - 10;
                       drawMediaAndResolution(this.loadedImage, mediaWidth, mediaHeight, this.cachedImgAspectRatio);
                   }
                };

                const loadAndDrawVideo = () => {
                    if (!this.loadedVideo && this.videoUrl) {
                        console.log("Loading video:", this.videoUrl);
                        this.loadedVideo = document.createElement('video');
                        this.loadedVideo.src = this.videoUrl;
                        this.loadedVideo.controls = true;
                        this.loadedVideo.loop = true;
                        this.loadedVideo.autoplay = false;
                        this.loadedVideo.muted = false;
                        this.loadedVideo.preload = "metadata";

                        this.loadedVideo.load();
                        this.loadedVideo.oncanplay = () => {
                            this.cachedVideoAspectRatio = this.loadedVideo.videoHeight / this.loadedVideo.videoWidth;
                            if (!this.hasAdjustedHeight) {
                                this.videoBaseHeight = initialHeight;
                                const videoHeight = Math.min(availableWidth, this.loadedVideo.videoWidth) * this.cachedVideoAspectRatio;
                                this.size[1] = initialHeight + videoHeight;
                                console.log(this.size)
                                this.hasAdjustedHeight = true;
                            }

                            if (!this.videoWidget) {
                                this.videoContainer = document.createElement('div');

                                this.videoWidget = this.addDOMWidget("video-preview", "video", this.videoContainer, {
                                    hideOnZoom: false
                                });
                                this.videoWidget.serialize = false;
                                this.videoWidget.computeLayoutSize = () => {
                                    if (!this.loadedVideo) {
                                        return { width: 0, height: 0 };
                                    }

                                    const computeVideoSize = () => {
                                        const baseHeight = this.videoBaseHeight || initialHeight;
                                        const nodeWidth = this.size[0] - MARGIN * 2;
                                        const nodeHeight = this.size[1] - baseHeight - MARGIN - 20;
                                        const videoAspectRatio = this.loadedVideo.videoWidth / this.loadedVideo.videoHeight;

                                        let displayWidth, displayHeight;
                                        if (nodeWidth / nodeHeight > videoAspectRatio) {
                                            displayHeight = nodeHeight;
                                            displayWidth = nodeHeight * videoAspectRatio;
                                        } else {
                                            displayWidth = nodeWidth;
                                            displayHeight = nodeWidth / videoAspectRatio;
                                        }

                                        return { width: displayWidth, height: displayHeight };
                                    };

                                    const size = computeVideoSize();

                                    this.loadedVideo.style.width = size.width + 'px';
                                    this.loadedVideo.style.height = size.height + 'px';
                                    this.loadedVideo.style.objectFit = 'contain';
                                    this.loadedVideo.style.display = 'block';
                                    this.loadedVideo.style.margin = 'auto';
                                    this.loadedVideo.style.marginBottom = '3px';

                                    return size;
                                };
                            }

                            if (this.videoContainer && !this.videoContainer.contains(this.loadedVideo)) {
                                this.videoContainer.appendChild(this.loadedVideo);

                                const resolutionText = document.createElement('div');
                                Object.assign(resolutionText.style, RESOLUTION_STYLE);
                                resolutionText.textContent = getResolutionText(this.loadedVideo);
                                this.videoContainer.appendChild(resolutionText);
                            }

                            this.setDirtyCanvas(true);
                        };
                        this.loadedVideo.onerror = () => {
                            console.error("Failed to load video:", this.videoUrl);
                        };
                    }
                };

                if (this.imageUrl) {
                    loadAndDrawImage();
                } else if (this.videoUrl) {
                    loadAndDrawVideo();

                }
            };

            nodeType.prototype.onExecuted = function(message) {
                const protocol = window.location.protocol;
                const host = window.location.host;
                const baseUrl = `${protocol}//${host}/view`;

                this.imageUrl = null;
                this.videoUrl = null;
                this.loadedImage = null;
                this.loadedVideo = null;
                this.hasAdjustedHeight = false;
                this.videoBaseHeight = null;

                if (this.videoWidget) {
                    this.removeWidget(this.videoWidget);
                    this.videoWidget = null;
                    this.videoContainer = null;
                }

                if (nodeData.name === "DN_PreviewImage") {
                    if (message?.images?.[0]) {
                        const imageInfo = message.images[0];
                        if (imageInfo === null) {
                            this.setDirtyCanvas(true);
                            return;
                        }
                        const params = new URLSearchParams({
                            filename: imageInfo.filename,
                            type: imageInfo.type,
                            subfolder: imageInfo.subfolder
                        });
                        this.imageUrl = `${baseUrl}?${params}`;
                    } else if (message?.videos?.[0]) {
                        const videoInfo = message.videos[0];
                        if (videoInfo === null) {
                            this.setDirtyCanvas(true);
                            return;
                        }
                        const params = new URLSearchParams({
                            filename: videoInfo.filename,
                            type: videoInfo.type,
                            subfolder: videoInfo.subfolder
                        });
                        this.videoUrl = `${baseUrl}?${params}`;
                    }
                    this.setDirtyCanvas(true);
                }
            };

            nodeType.prototype.onResize = function(size) {
                this.setDirtyCanvas(true);
                if (this.videoWidget && this.videoWidget.computeLayoutSize) {
                    this.videoWidget.computeLayoutSize();
                }
            };
        }
    }
});