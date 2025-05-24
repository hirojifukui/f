// script3.js
const video = document.getElementById('video')

// 1) Load the models, then start the camera
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

      // 2) As soon as metadata (videoWidth/videoHeight) is ready, kick off playback
      video.addEventListener('loadedmetadata', () => {
        video.play()
      })

      // 3) Only once the video is actually playing do we create our canvases
      video.addEventListener('playing', onVideoPlaying)
    })
    .catch(err => console.error('Camera error:', err))
}

function onVideoPlaying() {
  // Create overlay canvas once
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  // Offscreen canvas for sampling pixels
  const offCanvas = document.createElement('canvas')
  offCanvas.width  = video.videoWidth
  offCanvas.height = video.videoHeight
  const offCtx = offCanvas.getContext('2d')

  // Make sure Face-API knows our dimensions
  faceapi.matchDimensions(canvas, {
    width:  video.videoWidth,
    height: video.videoHeight
  })

  // Main loop: grab a frame, detect landmarks, blur regions
  setInterval(async () => {
    offCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight)

    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    const resized = faceapi.resizeResults(detections, {
      width:  video.videoWidth,
      height: video.videoHeight
    })

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    resized.forEach(det => {
      const lm = det.landmarks
      const features = [
        lm.getLeftEye(),
        lm.getRightEye(),
        lm.getNose(),
        lm.getMouth()
      ]

      features.forEach(region => {
        const xs = region.map(p => p.x), ys = region.map(p => p.y)
        const margin = 25
        const x0 = Math.max(0, Math.floor(Math.min(...xs) - margin))
        const y0 = Math.max(0, Math.floor(Math.min(...ys) - margin))
        const x1 = Math.min(video.videoWidth,  Math.ceil(Math.max(...xs) + margin))
        const y1 = Math.min(video.videoHeight, Math.ceil(Math.max(...ys) + margin))
        const w  = x1 - x0, h = y1 - y0
        if (w <= 0 || h <= 0) return

        // your existing blur-repaint steps, unchanged
        ctx.save(); ctx.filter = 'blur(25px)'; ctx.drawImage(offCanvas, x0, y0, w, h, x0, y0, w, h); ctx.restore()
        ctx.save(); ctx.filter = 'blur(25px)'; ctx.drawImage(offCanvas, x0, y0, w, h, x0, y0, w, h); ctx.restore()
        ctx.save(); ctx.filter = 'blur(25px)'; ctx.drawImage(offCanvas, x0, y0, w, h, x0, y0, w, h); ctx.restore()
        ctx.save(); ctx.filter = 'blur(20px)'; ctx.drawImage(offCanvas, x0, y0, w, h, x0, y0, w, h); ctx.restore()
      })
    })
  }, 100)
}
