from flask import Flask, render_template, jsonify, request
import csv
import os

app = Flask(__name__)

# Load color database from CSV
def load_colors_from_csv():
    colors = []
    with open('colors.csv', 'r') as file:
        reader = csv.DictReader(file)
        for row in reader:
            colors.append({
                'name': row['name'],
                'hex': row['hex'],
                'r': int(row['r']),
                'g': int(row['g']),
                'b': int(row['b'])
            })
    return colors

COLOR_DATABASE = load_colors_from_csv()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/colors', methods=['GET'])
def get_colors():
    return jsonify(COLOR_DATABASE)

@app.route('/api/find_closest_color', methods=['POST'])
def find_closest_color():
    data = request.json
    r, g, b = data['r'], data['g'], data['b']
    
    min_distance = float('inf')
    closest_color = COLOR_DATABASE[0]
    
    for color in COLOR_DATABASE:
        distance = ((r - color['r']) ** 2 + 
                    (g - color['g']) ** 2 + 
                    (b - color['b']) ** 2) ** 0.5
        
        if distance < min_distance:
            min_distance = distance
            closest_color = color
    
    return jsonify(closest_color)

if __name__ == '__main__':
    app.run(debug=True)