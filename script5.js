// script3.js
const video = document.getElementById('video')

// Preload butterfly image
const butterfly = new Image()
butterfly.src = 'btfly.png'

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('models'),
]).then(startVideo)
  .catch(err => console.error('Model load error:', err))

function startVideo() {
  if (!navigator.mediaDevices?.getUserMedia) {
    console.error('getUserMedia not supported')
    return
  }

  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      video.srcObject = stream
      video.addEventListener('loadedmetadata', () => video.play())
      video.addEventListener('playing', onVideoPlaying)
    })
    .catch(err => console.error('Camera error:', err))
}

function onVideoPlaying() {
  // Main overlay canvas
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  faceapi.matchDimensions(canvas, {
    width:  video.videoWidth,
    height: video.videoHeight
  })

  setInterval(async () => {
    // Draw and detect on the live video
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    const resized = faceapi.resizeResults(detections, {
      width:  video.videoWidth,
      height: video.videoHeight
    })

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    resized.forEach(det => {
      // Only handle the mouth
      const mouthPoints = det.landmarks.getMouth()
      const xs = mouthPoints.map(p => p.x)
      const ys = mouthPoints.map(p => p.y)
      const margin = 25
      const x0 = Math.max(0, Math.floor(Math.min(...xs) - margin))
      const y0 = Math.max(0, Math.floor(Math.min(...ys) - margin))
      const x1 = Math.min(video.videoWidth,  Math.ceil(Math.max(...xs) + margin))
      const y1 = Math.min(video.videoHeight, Math.ceil(Math.max(...ys) + margin))
      const w  = x1 - x0, h = y1 - y0
      if (w > 0 && h > 0 && butterfly.complete) {
        ctx.drawImage(butterfly, x0, y0, w, h)
      }
    })
  }, 100)
}
