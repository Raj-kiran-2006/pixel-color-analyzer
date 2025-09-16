🎨 Pixel Color Analyzer

    A simple and interactive web application that lets users upload an image, click on any pixel, and view its
 detailed color information such as RGB, HEX, HSL, and the closest color name from a dataset.

🚀 Features

    Upload any image from your device

    Click on a pixel to detect its color

    Get instant RGB, HEX, and HSL values

    Find the closest color name from a predefined dataset

    Keep track of recently picked colors

    Smooth zoom controls for detailed inspection

    Modern, responsive, and user-friendly UI

🛠️ Tech Stack

    Backend: Python (Flask)

    Frontend: HTML5, CSS3, JavaScript

    Data: colors.csv 

📂 Project Structure

project/
│── app.py # Flask backend
│── colors.csv # Color dataset
│── templates/
│ └── index.html # Main frontend page
│── static/
│ ├── style.css # CSS styles
│ └── script.js # JavaScript logic
│── requirements.txt # Python dependencies
│── README.md # Documentation

⚙️ Installation & Setup

1. Clone the repository

Bash

git clone https://github.com/Raj-kiran-2006/pixel-color-analyzer
cd pixel-color-analyzer

2. (Optional) Create a virtual environment

Bash

python -m venv venv
source venv/bin/activate   # On macOS/Linux
venv\Scripts\activate      # On Windows

3. Install dependencies

Bash

pip install -r requirements.txt

4. Run the Flask app

Bash
python app.py

5. Open in your browser

Navigate to 👉 http://127.0.0.1:5000/