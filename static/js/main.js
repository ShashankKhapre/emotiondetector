document.addEventListener('DOMContentLoaded', () => {
    // Elements - Main UI
    const uploadForm = document.getElementById('upload-form');
    const imageUpload = document.getElementById('image-upload');
    const startCameraBtn = document.getElementById('start-camera');
    const captureImageBtn = document.getElementById('capture-image');
    const cameraFeed = document.getElementById('camera-feed');
    const capturedImageCanvas = document.getElementById('captured-image');
    const capturedContainer = document.getElementById('captured-container');
    const analyzeCapturedBtn = document.getElementById('analyze-captured');
    const retakePhotoBtn = document.getElementById('retake-photo');
    const resultsContainer = document.getElementById('results-container');
    const originalImage = document.getElementById('original-image');
    const emotionResults = document.getElementById('emotion-results');
    const emotionChartsContainer = document.getElementById('emotion-charts-container');
    const noFacesAlert = document.getElementById('no-faces-alert');
    const loadingSpinner = document.getElementById('loading-spinner');
    const clearResultsBtn = document.getElementById('clear-results');
    const cameraTab = document.getElementById('camera-tab');
    
    // Elements - Camera mode controls
    const modeCapture = document.getElementById('mode-capture');
    const modeRealtime = document.getElementById('mode-realtime');
    const captureModeControls = document.getElementById('capture-mode-controls');
    const realtimeModeControls = document.getElementById('realtime-mode-controls');
    const startRealtimeCameraBtn = document.getElementById('start-realtime-camera');
    const startRealtimeDetectionBtn = document.getElementById('start-realtime-detection');
    const stopRealtimeDetectionBtn = document.getElementById('stop-realtime-detection');
    const realtimeOverlay = document.getElementById('realtime-overlay');
    const fpsCounter = document.getElementById('fps-counter');
    const realtimeStatus = document.getElementById('realtime-status');
    
    // Stream and detection variables
    let stream = null;
    let capturedImageData = null;
    let isRealtimeDetectionActive = false;
    let realtimeDetectionInterval = null;
    let lastFrameTime = 0;
    let frameCount = 0;
    let detectionResults = [];
    
    // Event listeners - Main controls
    uploadForm.addEventListener('submit', handleImageUpload);
    startCameraBtn.addEventListener('click', startCamera);
    captureImageBtn.addEventListener('click', captureImage);
    analyzeCapturedBtn.addEventListener('click', analyzeCapture);
    retakePhotoBtn.addEventListener('click', retakePhoto);
    clearResultsBtn.addEventListener('click', clearResults);
    cameraTab.addEventListener('click', () => {
        // If camera tab is selected and camera is not active, start camera for the current mode
        if (!stream && modeCapture.checked) {
            startCamera();
        } else if (!stream && modeRealtime.checked) {
            startRealtimeCamera();
        }
    });
    
    // Event listeners - Mode switching
    modeCapture.addEventListener('change', function() {
        if (this.checked) {
            captureModeControls.classList.remove('d-none');
            realtimeModeControls.classList.add('d-none');
            stopRealtimeDetection();
            
            // Hide realtime-specific elements
            fpsCounter.classList.add('d-none');
            realtimeStatus.classList.add('d-none');
            realtimeOverlay.getContext('2d').clearRect(0, 0, realtimeOverlay.width, realtimeOverlay.height);
            
            // Reset stream if needed
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
                startCamera();
            }
        }
    });
    
    modeRealtime.addEventListener('change', function() {
        if (this.checked) {
            captureModeControls.classList.add('d-none');
            realtimeModeControls.classList.remove('d-none');
            capturedContainer.classList.add('d-none');
            
            // Reset stream if needed
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
                startRealtimeCamera();
            }
        }
    });
    
    // Event listeners - Real-time detection controls
    startRealtimeCameraBtn.addEventListener('click', startRealtimeCamera);
    startRealtimeDetectionBtn.addEventListener('click', startRealtimeDetection);
    stopRealtimeDetectionBtn.addEventListener('click', stopRealtimeDetection);
    
    /**
     * Handle image upload form submission
     * @param {Event} e - Form submit event
     */
    function handleImageUpload(e) {
        e.preventDefault();
        
        const file = imageUpload.files[0];
        if (!file) {
            showAlert('Please select an image file', 'warning');
            return;
        }
        
        // Check if the file is an image
        if (!file.type.match('image.*')) {
            showAlert('Please select a valid image file', 'warning');
            return;
        }
        
        // Check file size (limit to 5MB)
        const maxSize = 5 * 1024 * 1024; // 5MB in bytes
        if (file.size > maxSize) {
            showAlert('Image size is too large. Please select an image less than 5MB', 'warning');
            return;
        }
        
        // Create a FileReader to read the image
        const reader = new FileReader();
        reader.onload = function(event) {
            // Create an image to get dimensions
            const img = new Image();
            img.onload = function() {
                // Resize large images to prevent "413 Request Entity Too Large" error
                let imageData = event.target.result;
                
                if (img.width > 1200 || img.height > 1200) {
                    // Resize the image to more reasonable dimensions
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // Calculate new dimensions while maintaining aspect ratio
                    let width = img.width;
                    let height = img.height;
                    const maxDimension = 1200;
                    
                    if (width > height) {
                        if (width > maxDimension) {
                            height = Math.round(height * (maxDimension / width));
                            width = maxDimension;
                        }
                    } else {
                        if (height > maxDimension) {
                            width = Math.round(width * (maxDimension / height));
                            height = maxDimension;
                        }
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Convert to JPEG with lower quality to reduce size
                    imageData = canvas.toDataURL('image/jpeg', 0.8);
                }
                
                // Display the original (possibly resized) image
                originalImage.src = imageData;
                
                // Create a new FormData with the processed image
                const formData = new FormData();
                
                // If we resized the image, convert base64 to blob and append
                if (imageData !== event.target.result) {
                    // Convert base64 to blob
                    const byteString = atob(imageData.split(',')[1]);
                    const mimeString = imageData.split(',')[0].split(':')[1].split(';')[0];
                    const ab = new ArrayBuffer(byteString.length);
                    const ia = new Uint8Array(ab);
                    
                    for (let i = 0; i < byteString.length; i++) {
                        ia[i] = byteString.charCodeAt(i);
                    }
                    
                    const blob = new Blob([ab], {type: mimeString});
                    formData.append('image', blob, 'resized-image.jpg');
                } else {
                    // Use the original file
                    formData.append('image', file);
                }
                
                // Send image for emotion detection
                detectEmotions(formData, imageData);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
    
    /**
     * Start the camera stream
     */
    function startCamera() {
        // Check if the browser supports getUserMedia
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showAlert('Your browser does not support camera access', 'danger');
            return;
        }
        
        // Request camera access
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(videoStream => {
                stream = videoStream;
                cameraFeed.srcObject = stream;
                startCameraBtn.disabled = true;
                captureImageBtn.disabled = false;
                captureImageBtn.classList.remove('btn-secondary');
                captureImageBtn.classList.add('btn-primary');
            })
            .catch(error => {
                console.error('Error accessing camera:', error);
                showAlert('Could not access the camera. Please check your camera settings and permissions.', 'danger');
            });
    }
    
    /**
     * Capture image from camera feed
     */
    function captureImage() {
        if (!stream) return;
        
        // Set canvas dimensions to a reasonable size to prevent large uploads
        // This helps avoid the "413 Request Entity Too Large" error
        const canvas = capturedImageCanvas;
        const maxWidth = 640; // Max width for the image
        const maxHeight = 480; // Max height for the image
        let width = cameraFeed.videoWidth;
        let height = cameraFeed.videoHeight;
        
        // Calculate new dimensions while maintaining aspect ratio
        if (width > height) {
            if (width > maxWidth) {
                height = Math.round(height * (maxWidth / width));
                width = maxWidth;
            }
        } else {
            if (height > maxHeight) {
                width = Math.round(width * (maxHeight / height));
                height = maxHeight;
            }
        }
        
        // Set canvas to the new dimensions
        canvas.width = width;
        canvas.height = height;
        
        // Draw the current video frame to the canvas with resized dimensions
        const context = canvas.getContext('2d');
        context.drawImage(cameraFeed, 0, 0, width, height);
        
        // Get the image data as base64 but use JPEG with quality of 0.8 instead of PNG for smaller file size
        capturedImageData = canvas.toDataURL('image/jpeg', 0.8);
        
        // Show the captured image and relevant controls
        capturedContainer.classList.remove('d-none');
    }
    
    /**
     * Analyze the captured image
     */
    function analyzeCapture() {
        if (!capturedImageData) return;
        
        // Display the original image
        originalImage.src = capturedImageData;
        
        // Create form data with the captured image
        const formData = new FormData();
        formData.append('imageData', capturedImageData);
        
        // Send image for emotion detection
        detectEmotions(formData, capturedImageData);
    }
    
    /**
     * Reset camera capture UI for retaking a photo
     */
    function retakePhoto() {
        capturedContainer.classList.add('d-none');
        capturedImageData = null;
    }
    
    /**
     * Send an image to the server for emotion detection
     * @param {FormData} formData - Form data containing the image
     * @param {string} imageSource - Data URL of the original image
     */
    function detectEmotions(formData, imageSource) {
        // Show loading spinner
        loadingSpinner.classList.remove('d-none');
        
        // Reset the results container
        emotionChartsContainer.innerHTML = '';
        noFacesAlert.classList.add('d-none');
        
        fetch('/detect_emotion', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            // Hide loading spinner
            loadingSpinner.classList.add('d-none');
            
            if (!data.success) {
                throw new Error(data.error || 'An error occurred during emotion detection');
            }
            
            // Show the results container
            resultsContainer.classList.remove('d-none');
            
            // Check if faces were detected
            if (!data.results || data.results.length === 0) {
                noFacesAlert.classList.remove('d-none');
                return;
            }
            
            // Process and display the results
            displayResults(data.results, imageSource);
        })
        .catch(error => {
            // Hide loading spinner
            loadingSpinner.classList.add('d-none');
            
            // Show error
            console.error('Error during emotion detection:', error);
            showAlert(error.message || 'An error occurred during emotion detection', 'danger');
        });
    }
    
    /**
     * Display emotion detection results
     * @param {Array} results - Array of face detection results
     * @param {string} imageSource - Data URL of the original image
     */
    function displayResults(results, imageSource) {
        // Clear previous results
        emotionChartsContainer.innerHTML = '';
        
        // Create a copy of the original image to draw rectangles
        const img = new Image();
        img.onload = function() {
            // Create a canvas to draw the image with face rectangles
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Process each detected face
            results.forEach((result, index) => {
                // Draw rectangle around face
                const { box } = result;
                drawFaceBox(ctx, box, result.dominant_emotion, index + 1);
                
                // Create container for this face's results
                const faceResultDiv = document.createElement('div');
                faceResultDiv.className = 'emotion-chart-container mb-4';
                
                // Add face number heading
                const faceHeading = document.createElement('h6');
                faceHeading.className = 'mb-3';
                faceHeading.textContent = results.length > 1 ? `Face #${index + 1}` : 'Detected Face';
                faceResultDiv.appendChild(faceHeading);
                
                // Create row for charts
                const row = document.createElement('div');
                row.className = 'row';
                
                // Doughnut chart column
                const doughnutCol = document.createElement('div');
                doughnutCol.className = 'col-md-6 mb-3';
                const doughnutCanvasId = `emotion-chart-${index}`;
                doughnutCol.innerHTML = `<canvas id="${doughnutCanvasId}" height="200"></canvas>`;
                row.appendChild(doughnutCol);
                
                // Bar chart column
                const barCol = document.createElement('div');
                barCol.className = 'col-md-6 mb-3';
                const barCanvasId = `emotion-bar-${index}`;
                barCol.innerHTML = `<canvas id="${barCanvasId}" height="200"></canvas>`;
                row.appendChild(barCol);
                
                faceResultDiv.appendChild(row);
                
                // Add dominant emotion display
                const dominantDiv = document.createElement('div');
                dominantDiv.className = 'dominant-emotion text-center';
                dominantDiv.textContent = `Dominant Emotion: ${result.dominant_emotion}`;
                faceResultDiv.appendChild(dominantDiv);
                
                // Add to results container
                emotionChartsContainer.appendChild(faceResultDiv);
                
                // Create charts after adding to DOM
                setTimeout(() => {
                    createEmotionChart(doughnutCanvasId, result.emotions, result.dominant_emotion);
                    createEmotionBarChart(barCanvasId, result.emotions);
                }, 0);
            });
            
            // Update the original image with face boxes
            originalImage.src = canvas.toDataURL();
        };
        img.src = imageSource;
    }
    
    /**
     * Draw a rectangle around a detected face
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} box - Face bounding box coordinates
     * @param {string} emotion - Dominant emotion
     * @param {number} faceNum - Face number
     */
    function drawFaceBox(ctx, box, emotion, faceNum) {
        const [x, y, width, height] = box;
        
        // Set styles
        ctx.strokeStyle = '#007bff';
        ctx.lineWidth = 3;
        
        // Draw rectangle
        ctx.strokeRect(x, y, width, height);
        
        // Draw label background
        ctx.fillStyle = '#007bff';
        const labelText = `#${faceNum}: ${emotion}`;
        const textMetrics = ctx.measureText(labelText);
        const labelWidth = textMetrics.width + 10;
        const labelHeight = 24;
        ctx.fillRect(x, y - labelHeight, labelWidth, labelHeight);
        
        // Draw label text
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.fillText(labelText, x + 5, y - 7);
    }
    
    /**
     * Show an alert message
     * @param {string} message - Alert message
     * @param {string} type - Alert type (success, warning, danger)
     */
    function showAlert(message, type = 'info') {
        // Create alert element
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.setAttribute('role', 'alert');
        
        // Add message and close button
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        // Insert at the top of the page
        document.querySelector('main.container').prepend(alertDiv);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            const bsAlert = new bootstrap.Alert(alertDiv);
            bsAlert.close();
        }, 5000);
    }
    
    /**
     * Clear detection results and reset UI
     */
    function clearResults() {
        resultsContainer.classList.add('d-none');
        emotionChartsContainer.innerHTML = '';
        noFacesAlert.classList.add('d-none');
        
        // Reset file input
        imageUpload.value = '';
    }
    
    /**
     * Start the real-time camera stream
     */
    function startRealtimeCamera() {
        // Check if the browser supports getUserMedia
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showAlert('Your browser does not support camera access', 'danger');
            return;
        }
        
        // Request camera access
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(videoStream => {
                stream = videoStream;
                cameraFeed.srcObject = stream;
                startRealtimeCameraBtn.disabled = true;
                startRealtimeDetectionBtn.disabled = false;
                startRealtimeDetectionBtn.classList.remove('btn-secondary');
                startRealtimeDetectionBtn.classList.add('btn-success');
                
                // Set up canvas overlay dimensions
                const videoTrack = stream.getVideoTracks()[0];
                const settings = videoTrack.getSettings();
                realtimeOverlay.width = settings.width || 640;
                realtimeOverlay.height = settings.height || 480;
            })
            .catch(error => {
                console.error('Error accessing camera:', error);
                showAlert('Could not access the camera. Please check your camera settings and permissions.', 'danger');
            });
    }
    
    /**
     * Start real-time emotion detection
     */
    function startRealtimeDetection() {
        if (!stream) return;
        
        isRealtimeDetectionActive = true;
        
        // Show status UI
        realtimeStatus.classList.remove('d-none');
        fpsCounter.classList.remove('d-none');
        startRealtimeDetectionBtn.classList.add('d-none');
        stopRealtimeDetectionBtn.classList.remove('d-none');
        
        // Initialize FPS tracking
        lastFrameTime = performance.now();
        frameCount = 0;
        
        // Set interval for detection (aim for roughly 5 FPS to not overload the server)
        realtimeDetectionInterval = setInterval(captureAndAnalyzeFrame, 200);
    }
    
    /**
     * Stop real-time emotion detection
     */
    function stopRealtimeDetection() {
        isRealtimeDetectionActive = false;
        
        // Hide status UI
        realtimeStatus.classList.add('d-none');
        fpsCounter.classList.add('d-none');
        startRealtimeDetectionBtn.classList.remove('d-none');
        stopRealtimeDetectionBtn.classList.add('d-none');
        
        // Clear detection interval
        if (realtimeDetectionInterval) {
            clearInterval(realtimeDetectionInterval);
            realtimeDetectionInterval = null;
        }
        
        // Clear canvas overlay
        const ctx = realtimeOverlay.getContext('2d');
        ctx.clearRect(0, 0, realtimeOverlay.width, realtimeOverlay.height);
    }
    
    /**
     * Capture and analyze a frame from the camera feed for real-time detection
     */
    function captureAndAnalyzeFrame() {
        if (!stream || !isRealtimeDetectionActive) return;
        
        // Create a temporary canvas to capture the frame
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = realtimeOverlay.width;
        tempCanvas.height = realtimeOverlay.height;
        
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(cameraFeed, 0, 0, tempCanvas.width, tempCanvas.height);
        
        // Get the image data as base64
        const imageData = tempCanvas.toDataURL('image/jpeg', 0.7);
        
        // Create form data with the captured frame
        const formData = new FormData();
        formData.append('imageData', imageData);
        
        // Send frame for emotion detection
        fetch('/detect_emotion', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                console.error(data.error || 'Error during real-time detection');
                return;
            }
            
            // Draw detection results on overlay canvas
            drawRealtimeResults(data.results);
            
            // Update FPS counter
            updateFpsCounter();
        })
        .catch(error => {
            console.error('Error during real-time detection:', error);
        });
    }
    
    /**
     * Draw real-time detection results on the overlay canvas
     * @param {Array} results - Array of face detection results
     */
    function drawRealtimeResults(results) {
        if (!results || !isRealtimeDetectionActive) return;
        
        const ctx = realtimeOverlay.getContext('2d');
        ctx.clearRect(0, 0, realtimeOverlay.width, realtimeOverlay.height);
        
        // Save current detection results for any UI that needs it
        detectionResults = results;
        
        // Draw rectangles and labels for each detected face
        results.forEach((result, index) => {
            const { box } = result;
            
            // Draw rectangle around face
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.strokeRect(box[0], box[1], box[2], box[3]);
            
            // Draw background for text
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(box[0], box[1] - 20, box[2], 20);
            
            // Draw emotion text
            ctx.fillStyle = '#ffffff';
            ctx.font = '14px Arial';
            ctx.fillText(result.dominant_emotion, box[0] + 5, box[1] - 5);
        });
    }
    
    /**
     * Update the FPS counter
     */
    function updateFpsCounter() {
        const now = performance.now();
        frameCount++;
        
        // Update FPS every second
        if (now - lastFrameTime >= 1000) {
            const fps = Math.round((frameCount * 1000) / (now - lastFrameTime));
            fpsCounter.textContent = `FPS: ${fps}`;
            
            // Reset counters
            frameCount = 0;
            lastFrameTime = now;
        }
    }
    
    /**
     * Clean up resources when leaving the page
     */
    window.addEventListener('beforeunload', () => {
        // Stop real-time detection if active
        if (isRealtimeDetectionActive) {
            stopRealtimeDetection();
        }
        
        // Stop camera stream if active
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    });
});
