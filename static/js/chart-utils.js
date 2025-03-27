/**
 * Creates a doughnut chart to visualize emotion scores
 * @param {string} canvasId - The ID of the canvas element
 * @param {Array} emotions - Array of emotion objects with emotion name and score
 * @param {string} dominantEmotion - The emotion with the highest score
 * @returns {Chart} The created Chart.js instance
 */
function createEmotionChart(canvasId, emotions, dominantEmotion) {
    // Define colors for each emotion
    const emotionColors = {
        'happy': 'rgba(255, 193, 7, 0.8)',    // Amber
        'sad': 'rgba(13, 110, 253, 0.8)',     // Blue
        'angry': 'rgba(220, 53, 69, 0.8)',    // Red
        'surprise': 'rgba(111, 66, 193, 0.8)', // Purple
        'fear': 'rgba(108, 117, 125, 0.8)',   // Gray
        'disgust': 'rgba(25, 135, 84, 0.8)',  // Green
        'neutral': 'rgba(173, 181, 189, 0.8)' // Light gray
    };

    // Default color for any unlisted emotions
    const defaultColor = 'rgba(23, 162, 184, 0.8)'; // Cyan

    // Prepare data for Chart.js
    const labels = emotions.map(item => item.emotion);
    const data = emotions.map(item => (item.score * 100).toFixed(1)); // Convert to percentage
    
    // Get colors based on emotion names
    const backgroundColor = emotions.map(item => 
        emotionColors[item.emotion] || defaultColor
    );
    
    // Get the canvas element and create the chart
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    return new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColor,
                borderColor: 'rgba(0, 0, 0, 0.1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#fff',
                        font: {
                            size: 12
                        },
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map(function(label, i) {
                                    const value = data.datasets[0].data[i];
                                    return {
                                        text: `${label}: ${value}%`,
                                        fillStyle: data.datasets[0].backgroundColor[i],
                                        strokeStyle: data.datasets[0].borderColor[i],
                                        lineWidth: data.datasets[0].borderWidth,
                                        hidden: isNaN(data.datasets[0].data[i]) || chart.getDatasetMeta(0).data[i].hidden,
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            return `${label}: ${value}%`;
                        }
                    }
                }
            },
            cutout: '60%',
            animation: {
                animateScale: true,
                animateRotate: true
            }
        }
    });
}

/**
 * Creates a horizontal bar chart to visualize emotion scores
 * @param {string} canvasId - The ID of the canvas element
 * @param {Array} emotions - Array of emotion objects with emotion name and score
 * @returns {Chart} The created Chart.js instance
 */
function createEmotionBarChart(canvasId, emotions) {
    // Define colors for each emotion
    const emotionColors = {
        'happy': 'rgba(255, 193, 7, 0.8)',    // Amber
        'sad': 'rgba(13, 110, 253, 0.8)',     // Blue
        'angry': 'rgba(220, 53, 69, 0.8)',    // Red
        'surprise': 'rgba(111, 66, 193, 0.8)', // Purple
        'fear': 'rgba(108, 117, 125, 0.8)',   // Gray
        'disgust': 'rgba(25, 135, 84, 0.8)',  // Green
        'neutral': 'rgba(173, 181, 189, 0.8)' // Light gray
    };

    // Default color for any unlisted emotions
    const defaultColor = 'rgba(23, 162, 184, 0.8)'; // Cyan

    // Prepare data for Chart.js
    const labels = emotions.map(item => item.emotion);
    const data = emotions.map(item => (item.score * 100).toFixed(1)); // Convert to percentage
    
    // Get colors based on emotion names
    const backgroundColor = emotions.map(item => 
        emotionColors[item.emotion] || defaultColor
    );
    
    // Get the canvas element and create the chart
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Confidence (%)',
                data: data,
                backgroundColor: backgroundColor,
                borderColor: 'rgba(0, 0, 0, 0.1)',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y', // Horizontal bars
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw || 0;
                            return `Confidence: ${value}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        color: '#adb5bd'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                y: {
                    ticks: {
                        color: '#adb5bd'
                    },
                    grid: {
                        display: false
                    }
                }
            },
            animation: {
                duration: 1000
            }
        }
    });
}
