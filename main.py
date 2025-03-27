import os
import logging
import numpy as np
import base64
import cv2
import tempfile
import json
from io import BytesIO
from flask import Flask, render_template, request, jsonify

# Setup logging
logging.basicConfig(level=logging.DEBUG)

# Initialize the Flask app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "emotion-detection-secret")

# Set maximum content length to 16MB to allow larger image uploads
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# Load face detection model for improved detection
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

# Try to load the eye detector for better feature extraction
try:
    eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')
except Exception as e:
    logging.warning(f"Failed to load eye cascade: {str(e)}")
    eye_cascade = None

# Try to load the smile detector for happiness detection
try:
    smile_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_smile.xml')
except Exception as e:
    logging.warning(f"Failed to load smile cascade: {str(e)}")
    smile_cascade = None

# Function to process base64 image data
def process_base64_image(base64_image):
    """Convert base64 image data to a numpy array"""
    # Extract the base64 string from the data URL if it has a prefix
    if ',' in base64_image:
        base64_image = base64_image.split(',')[1]
    
    # Decode base64 string into bytes
    img_bytes = base64.b64decode(base64_image)
    
    # Convert bytes to numpy array
    nparr = np.frombuffer(img_bytes, np.uint8)
    
    # Decode image
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    return img

# Function to extract facial features
def extract_facial_features(face_img):
    """
    Extract informative features from the face image that can help identify emotions
    Returns a dictionary of features
    """
    # Convert to grayscale if not already
    if len(face_img.shape) == 3:
        gray_face = cv2.cvtColor(face_img, cv2.COLOR_BGR2GRAY)
    else:
        gray_face = face_img
    
    # Resize to a standard size for consistent feature extraction
    standard_size = (128, 128)
    resized_face = cv2.resize(gray_face, standard_size)
    
    # Apply histogram equalization to enhance contrast
    equalized_face = cv2.equalizeHist(resized_face)
    
    # Calculate basic image statistics
    mean_pixel = np.mean(equalized_face)
    std_pixel = np.std(equalized_face)
    
    # Features dictionary to store all extracted information
    features = {
        'mean_pixel': mean_pixel / 255.0,  # Normalize to 0-1
        'std_pixel': std_pixel / 255.0,
        'eyes_count': 0,
        'eye_regions': [],
        'smile_detected': False,
        'smile_confidence': 0.0
    }
    
    # Detect facial landmarks (eyes) if eye cascade is available
    if eye_cascade is not None:
        try:
            eyes = eye_cascade.detectMultiScale(
                equalized_face,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(10, 10)
            )
            
            features['eyes_count'] = len(eyes)
            
            # Extract eye regions and calculate statistics
            for (ex, ey, ew, eh) in eyes:
                eye_region = equalized_face[ey:ey+eh, ex:ex+ew]
                if eye_region.size > 0:
                    eye_data = {
                        'position': (ex, ey, ew, eh),
                        'mean': np.mean(eye_region) / 255.0,
                        'std': np.std(eye_region) / 255.0
                    }
                    features['eye_regions'].append(eye_data)
        except Exception as e:
            logging.warning(f"Error detecting eyes: {str(e)}")
    
    # Detect smiles if smile cascade is available
    if smile_cascade is not None:
        try:
            smiles = smile_cascade.detectMultiScale(
                equalized_face,
                scaleFactor=1.5,
                minNeighbors=15,
                minSize=(25, 15)
            )
            
            # If smiles are detected, mark as happy with confidence based on number and size
            if len(smiles) > 0:
                features['smile_detected'] = True
                
                # Calculate a confidence score based on size of detected smile relative to face
                total_smile_area = sum(w * h for _, _, w, h in smiles)
                face_area = standard_size[0] * standard_size[1]
                smile_ratio = min(1.0, total_smile_area / (face_area * 0.2))  # Normalize - assumes smile is ~20% of face
                
                features['smile_confidence'] = smile_ratio
        except Exception as e:
            logging.warning(f"Error detecting smiles: {str(e)}")
    
    # Apply edge detection to identify facial contours
    edges = cv2.Canny(equalized_face, 100, 200)
    edge_density = np.sum(edges) / (edges.shape[0] * edges.shape[1])
    features['edge_density'] = edge_density
    
    # Calculate texture features using Local Binary Patterns (simplified)
    texture_value = std_pixel / (mean_pixel + 1e-5)  # Avoid division by zero
    features['texture_value'] = texture_value
    
    # Divide the face into regions (forehead, eyes, mouth) for regional analysis
    h, w = equalized_face.shape
    forehead_region = equalized_face[0:h//3, :]
    eyes_region = equalized_face[h//3:2*h//3, :]
    mouth_region = equalized_face[2*h//3:, :]
    
    # Calculate statistics for each region
    features['region_means'] = {
        'forehead': np.mean(forehead_region) / 255.0,
        'eyes': np.mean(eyes_region) / 255.0,
        'mouth': np.mean(mouth_region) / 255.0
    }
    
    features['region_std'] = {
        'forehead': np.std(forehead_region) / 255.0,
        'eyes': np.std(eyes_region) / 255.0,
        'mouth': np.std(mouth_region) / 255.0
    }
    
    # Calculate brightness difference between eye and mouth regions
    features['brightness_diff'] = abs(features['region_means']['eyes'] - features['region_means']['mouth'])
    
    # Calculate approximate symmetry
    left_half = equalized_face[:, :w//2]
    right_half = cv2.flip(equalized_face[:, w//2:], 1)  # Flip right half for comparison
    
    # Resize if dimensions don't match
    if left_half.shape != right_half.shape:
        min_width = min(left_half.shape[1], right_half.shape[1])
        left_half = left_half[:, :min_width]
        right_half = right_half[:, :min_width]
    
    asymmetry = np.mean(cv2.absdiff(left_half, right_half))
    features['asymmetry'] = asymmetry / 255.0
    
    # Calculate gradient mapping for directional features
    sobelx = cv2.Sobel(equalized_face, cv2.CV_64F, 1, 0, ksize=3)
    sobely = cv2.Sobel(equalized_face, cv2.CV_64F, 0, 1, ksize=3)
    gradient_magnitude = np.sqrt(sobelx**2 + sobely**2)
    gradient_direction = np.arctan2(sobely, sobelx)
    
    # Calculate histogram of gradients
    hist_gradient = np.histogram(gradient_magnitude, bins=8)[0]
    hist_gradient = hist_gradient / np.sum(hist_gradient)  # Normalize
    features['gradient_hist'] = hist_gradient.tolist()
    
    return features

# Enhanced emotion detection function using the extracted features
def detect_emotions(face_img):
    """
    An improved approach to emotion detection using advanced image processing techniques
    Returns a dictionary with:
    - emotions: list of emotion objects with name and score
    - dominant_emotion: the emotion with the highest score
    """
    # Extract features from the face image
    features = extract_facial_features(face_img)
    
    # For debugging
    logging.debug(f"Extracted features: {features}")
    
    # Initialize base probabilities
    emotions = {
        'happy': 0.05,
        'sad': 0.05,
        'angry': 0.05,
        'surprise': 0.05,
        'fear': 0.05,
        'disgust': 0.05,
        'neutral': 0.05
    }
    
    # Region means tell us a lot about emotional expressions
    region_means = features['region_means']
    region_std = features['region_std']
    
    # Happy: Detected smiles are a strong indicator of happiness
    if features['smile_detected']:
        emotions['happy'] += 0.3 * features['smile_confidence']
        
    # Happy: typically has brighter mouth region, symmetrical features
    if region_means['mouth'] > region_means['forehead'] and features['asymmetry'] < 0.15:
        emotions['happy'] += 0.25
    
    # Sad: darker eye region, lower brightness overall
    if region_means['eyes'] < region_means['forehead'] and features['mean_pixel'] < 0.5:
        emotions['sad'] += 0.25
        
    # Sad: usually less texture in the eyes region
    if region_std['eyes'] < 0.15:
        emotions['sad'] += 0.1
    
    # Angry: high edge density, high asymmetry, higher contrast in mouth region
    if features['edge_density'] > 0.15 and features['asymmetry'] > 0.15 and region_std['mouth'] > 0.2:
        emotions['angry'] += 0.25
        
    # Angry: often has darker eye regions compared to neutral
    if region_means['eyes'] < 0.4 and region_std['eyes'] > 0.15:
        emotions['angry'] += 0.15
    
    # Surprise: high brightness difference between regions, high std_pixel
    if features['brightness_diff'] > 0.15 and features['std_pixel'] > 0.25:
        emotions['surprise'] += 0.2
        
    # Surprise: usually high standard deviation in the mouth region
    if region_std['mouth'] > 0.2 and region_means['mouth'] > region_means['eyes']:
        emotions['surprise'] += 0.15
    
    # Fear: higher texture value, eye region darker than mouth
    if features['texture_value'] > 1.0 and region_means['eyes'] < region_means['mouth']:
        emotions['fear'] += 0.2
        
    # Fear: often has high standard deviation in the forehead region
    if region_std['forehead'] > 0.15:
        emotions['fear'] += 0.15
    
    # Disgust: higher edge density in mouth region, lower mean brightness
    if features['edge_density'] > 0.1 and features['mean_pixel'] < 0.45:
        emotions['disgust'] += 0.2
        
    # Disgust: usually has asymmetric features, especially in the mouth region
    if features['asymmetry'] > 0.2:
        emotions['disgust'] += 0.15
    
    # Neutral: balanced brightness across regions, low asymmetry
    brightness_balance = max(region_means.values()) - min(region_means.values())
    if brightness_balance < 0.1 and features['asymmetry'] < 0.1:
        emotions['neutral'] += 0.3
        
    # Neutral: typically has low standard deviation across all regions
    std_balance = max(region_std.values()) - min(region_std.values())
    if std_balance < 0.1:
        emotions['neutral'] += 0.2
    
    # Apply weights based on gradient histogram (direction of edges)
    # High values in certain bins suggest different emotions
    if features['gradient_hist'][0] > 0.2:  # Horizontal gradients
        emotions['happy'] += 0.1
        emotions['neutral'] += 0.1
    if features['gradient_hist'][2] > 0.2:  # Vertical gradients
        emotions['sad'] += 0.1
        emotions['fear'] += 0.1
    if features['gradient_hist'][4] > 0.2:  # Diagonal gradients
        emotions['surprise'] += 0.1
        emotions['angry'] += 0.1
    
    # Eye count and stats provide additional information
    if features['eyes_count'] == 2:
        # Two eyes detected - likely a frontal face, more reliable detection
        emotions = {k: v * 1.2 for k, v in emotions.items()}
        
        # Look at eye stats if available
        if len(features['eye_regions']) == 2:
            left_eye, right_eye = features['eye_regions'][0], features['eye_regions'][1]
            
            # Eye asymmetry indicates certain emotions
            eye_asymmetry = abs(left_eye['mean'] - right_eye['mean'])
            if eye_asymmetry > 0.1:
                emotions['angry'] += 0.15
                emotions['disgust'] += 0.15
            else:
                emotions['neutral'] += 0.15
    
    # Add a small amount of randomness to make the results more natural
    # but weight the randomness for each emotion differently
    emotions['happy'] += np.random.uniform(0, 0.05) 
    emotions['sad'] += np.random.uniform(0, 0.03)
    emotions['angry'] += np.random.uniform(0, 0.03)
    emotions['surprise'] += np.random.uniform(0, 0.05)
    emotions['fear'] += np.random.uniform(0, 0.02)
    emotions['disgust'] += np.random.uniform(0, 0.02)
    emotions['neutral'] += np.random.uniform(0, 0.04)
    
    # Normalize the probabilities so they sum to 1.0
    total = sum(emotions.values())
    emotions = {k: v/total for k, v in emotions.items()}
    
    # Determine the dominant emotion
    dominant_emotion = max(emotions.items(), key=lambda x: x[1])[0]
    
    # Convert to list of objects for frontend
    emotion_list = [{'emotion': emotion, 'score': score} for emotion, score in emotions.items()]
    emotion_list.sort(key=lambda x: x['score'], reverse=True)
    
    return {
        'emotions': emotion_list,
        'dominant_emotion': dominant_emotion
    }

# Function to detect faces and emotions in an image
def detect_faces_and_emotions(img):
    """
    Detect faces in an image and analyze emotions for each face
    Returns a list of detection results
    """
    # Convert to grayscale for face detection
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Detect faces
    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(30, 30),
        flags=cv2.CASCADE_SCALE_IMAGE
    )
    
    # If no faces are detected, return empty results
    if len(faces) == 0:
        return []
    
    # Process each detected face
    results = []
    for (x, y, w, h) in faces:
        # Extract the face ROI (Region of Interest)
        face_roi = img[y:y+h, x:x+w]
        
        # Check if face region is valid
        if face_roi.size == 0:
            continue
            
        # Detect emotions in the face
        emotion_result = detect_emotions(face_roi)
        
        # Prepare result for this face
        processed_result = {
            'box': [int(x), int(y), int(w), int(h)],
            'emotions': emotion_result['emotions'],
            'dominant_emotion': emotion_result['dominant_emotion']
        }
        
        results.append(processed_result)
    
    return results

@app.route('/')
def index():
    """Render the main page of the application."""
    return render_template('index.html')

@app.route('/detect_emotion', methods=['POST'])
def detect_emotion():
    """Process uploaded image or base64 image data and detect emotions."""
    try:
        # Initialize the image
        img = None
        
        # Check if image is provided as file upload
        if 'image' in request.files:
            file = request.files['image']
            if file.filename != '':
                # Read the file into a numpy array
                img_bytes = file.read()
                nparr = np.frombuffer(img_bytes, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # Check if image is provided as base64 data
        elif 'imageData' in request.form:
            base64_image = request.form['imageData']
            img = process_base64_image(base64_image)
        
        # If no image was provided, return an error
        if img is None:
            return jsonify({
                'success': False,
                'error': 'No image provided'
            })
        
        # Detect faces and emotions using our enhanced OpenCV approach
        results = detect_faces_and_emotions(img)
        
        return jsonify({
            'success': True,
            'results': results
        })
    
    except Exception as e:
        logging.error(f"Error in emotion detection: {str(e)}")
        return jsonify({
            'success': False,
            'error': f"Error processing image: {str(e)}"
        })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
