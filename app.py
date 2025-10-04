from flask import Flask, jsonify, request
from flask_cors import CORS
import json
import os

app = Flask(__name__)
CORS(app)



@app.route('/')
def home():
    return jsonify({"message": "Backend if running!"})



@app.route('/get-food-name')
def get_food_name():
    with open('food_data.json', 'r') as f:
        food_info = json.load(f)
    food_name = food_info['food_name']

    return jsonify({"food_form_json": food_name,
                    "full_data": food_info})
    
if __name__ == '__main__':
    app.run(debug=True)
