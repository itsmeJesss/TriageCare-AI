from flask import Flask, request, jsonify
import os
import uuid
import random
from datetime import datetime

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# In-memory store for results (simulating a database)
results_store = {}

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'image' not in request.files:
        return jsonify({"error": "No image part"}), 400
    
    file = request.files['image']
    location = request.form.get('location', 'Unknown')
    
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    if file:
        patient_id = str(uuid.uuid4())
        filename = f"{patient_id}_{file.filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Simulate AI analysis
        severities = ['LOW', 'MEDIUM', 'HIGH']
        severity = random.choice(severities)
        
        result = {
            "patientId": patient_id,
            "severity": severity,
            "location": location,
            "timestamp": datetime.now().isoformat(),
            "status": "COMPLETED",
            "imageUrl": f"/uploads/{filename}"
        }
        
        results_store[patient_id] = result
        
        # Alert System Simulation
        if severity == 'HIGH':
            print(f"\n[!!! ALERT !!!] HIGH SEVERITY DETECTED")
            print(f"Patient ID: {patient_id}")
            print(f"Location: {location}")
            print(f"Action: Alerting nearest clinic...\n")
            
        return jsonify({
            "patientId": patient_id,
            "message": "Upload successful. AI analysis complete (simulated)."
        })

@app.route('/result/<patient_id>', methods=['GET'])
def get_result(patient_id):
    result = results_store.get(patient_id)
    if not result:
        return jsonify({"error": "Record not found"}), 404
    return jsonify(result)

if __name__ == '__main__':
    print(f"Flask Server starting on port 5000...")
    app.run(host='0.0.0.0', port=5000, debug=True)
