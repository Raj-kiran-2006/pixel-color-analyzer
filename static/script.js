// DOM elements
const imageUpload = document.getElementById('imageUpload');
const imagePreview = document.getElementById('imagePreview');
const colorDisplay = document.getElementById('colorDisplay');
const rgbValue = document.getElementById('rgbValue');
const hexValue = document.getElementById('hexValue');
const colorName = document.getElementById('colorName');
const hslValue = document.getElementById('hslValue');
const recentColorsContainer = document.getElementById('recentColors');
const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const loadingIndicator = document.getElementById('loading');

// State variables
let currentImage = null;
let zoomLevel = 1;
let recentColors = [];

// Initialize
function init() {
    // Load recent colors from localStorage if available
    const savedColors = localStorage.getItem('recentColors');
    if (savedColors) {
        recentColors = JSON.parse(savedColors);
        updateRecentColors();
    }
    
    // Set up event listeners
    imageUpload.addEventListener('change', handleImageUpload);
    imagePreview.addEventListener('click', handleColorPick);
    zoomInBtn.addEventListener('click', () => adjustZoom(0.1));
    zoomOutBtn.addEventListener('click', () => adjustZoom(-0.1));
}

// Handle image upload
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    loadingIndicator.style.display = 'block';
    
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            currentImage = img;
            renderImage();
            loadingIndicator.style.display = 'none';
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// Render image to preview
function renderImage() {
    imagePreview.innerHTML = '';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas dimensions
    const maxWidth = 800;
    const maxHeight = 400;
    let width = currentImage.width;
    let height = currentImage.height;
    
    // Scale image if too large
    if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
    }
    if (height > maxHeight) {
        width = (maxHeight / height) * width;
        height = maxHeight;
    }
    
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(currentImage, 0, 0, width, height);
    
    // Add canvas to preview
    imagePreview.appendChild(canvas);
    
    // Add zoom controls
    imagePreview.appendChild(zoomInBtn.parentElement);
}

// Handle color picking from image
function handleColorPick(e) {
    if (!currentImage) return;
    
    const canvas = imagePreview.querySelector('canvas');
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / zoomLevel);
    const y = Math.floor((e.clientY - rect.top) / zoomLevel);
    
    const ctx = canvas.getContext('2d');
    const pixelData = ctx.getImageData(x, y, 1, 1).data;
    
    const r = pixelData[0];
    const g = pixelData[1];
    const b = pixelData[2];
    
    displayColorInfo(r, g, b);
    addToRecentColors(r, g, b);
}

// Display color information
function displayColorInfo(r, g, b) {
    // Update color display
    const colorHex = rgbToHex(r, g, b);
    colorDisplay.style.backgroundColor = colorHex;
    
    // Update RGB value
    rgbValue.textContent = `RGB(${r}, ${g}, ${b})`;
    
    // Update HEX value
    hexValue.textContent = colorHex;
    
    // Find closest color name via API
    findClosestColor(r, g, b).then(closestColor => {
        colorName.textContent = closestColor.name;
    }).catch(error => {
        console.error('Error finding closest color:', error);
        colorName.textContent = 'Unknown';
    });
    
    // Update HSL value
    const hsl = rgbToHsl(r, g, b);
    hslValue.textContent = `HSL(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`;
}

// Find the closest color name from the API
async function findClosestColor(r, g, b) {
    try {
        const response = await fetch('/api/find_closest_color', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ r, g, b })
        });
        
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching closest color:', error);
        return { name: 'Unknown' };
    }
}

// Convert RGB to HEX
function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

// Convert RGB to HSL
function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    
    if (max === min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        
        h /= 6;
    }
    
    return {
        h: h * 360,
        s: s * 100,
        l: l * 100
    };
}

// Add color to recent colors
function addToRecentColors(r, g, b) {
    const colorHex = rgbToHex(r, g, b);
    const colorObj = { r, g, b, hex: colorHex };
    
    // Remove if already exists
    recentColors = recentColors.filter(c => c.hex !== colorHex);
    
    // Add to beginning
    recentColors.unshift(colorObj);
    
    // Keep only 10 recent colors
    if (recentColors.length > 10) {
        recentColors.pop();
    }
    
    // Save to localStorage
    localStorage.setItem('recentColors', JSON.stringify(recentColors));
    
    // Update UI
    updateRecentColors();
}

// Update recent colors display
function updateRecentColors() {
    recentColorsContainer.innerHTML = '';
    
    for (const color of recentColors) {
        const colorItem = document.createElement('div');
        colorItem.className = 'color-item';
        colorItem.style.backgroundColor = color.hex;
        colorItem.textContent = color.hex;
        
        colorItem.addEventListener('click', () => {
            displayColorInfo(color.r, color.g, color.b);
        });
        
        recentColorsContainer.appendChild(colorItem);
    }
}

// Adjust zoom level
function adjustZoom(delta) {
    zoomLevel += delta;
    zoomLevel = Math.max(0.5, Math.min(3, zoomLevel)); // Clamp between 0.5 and 3
    
    if (currentImage) {
        const canvas = imagePreview.querySelector('canvas');
        if (canvas) {
            canvas.style.transform = `scale(${zoomLevel})`;
            canvas.style.transformOrigin = 'center center';
        }
    }
}

// Initialize the application
init();