// script3.js
const video = document.getElementById('video')

// 1) Load models, then start the camera
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('models'),
]).then(startVideo).catch(err => console.error(err))

function startVideo() {
  if (!navigator.mediaDevices?.getUserMedia) {
    console.error('getUserMedia not supported')
    return
  }

  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      video.srcObject = stream

      // 2) Wait until metadata is loaded so videoWidth/videoHeight are set
      video.addEventListener('loadedmetadata', () => {
        video.play()
        onPlay()
      })
    })
    .catch(err => console.error('camera error:', err))
}

async function onPlay() {
  // 3) Create the overlay canvas only once
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  // 4) Offscreen canvas for pixel sampling
  const offCanvas = document.createElement('canvas')
  offCanvas.width  = video.videoWidth
  offCanvas.height = video.videoHeight
  const offCtx = offCanvas.getContext('2d')

  // 5) Make sure face-api knows the right dims
  faceapi.matchDimensions(canvas, {
    width:  video.videoWidth,
    height: video.videoHeight
  })

  // 6) Main loop: sample frame, detect, blur
  setInterval(async () => {
    // draw current frame offscreen
    offCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight)

    // detect faces + landmarks
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    const resized = faceapi.resizeResults(detections, {
      width:  video.videoWidth,
      height: video.videoHeight
    })

    // clear previous overlays
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // for each face, blur each feature
    resized.forEach(det => {
      const lm = det.landmarks
      const features = [
        lm.getLeftEye(),
        lm.getRightEye(),
        lm.getNose(),
        lm.getMouth()
      ]

      features.forEach(region => {
        // compute tight bounding box + small margin
        const xs = region.map(p => p.x), ys = region.map(p => p.y)
        const margin = 25
        const x0 = Math.max(0, Math.floor(Math.min(...xs) - margin))
        const y0 = Math.max(0, Math.floor(Math.min(...ys) - margin))
        const x1 = Math.min(video.videoWidth,  Math.ceil(Math.max(...xs) + margin))
        const y1 = Math.min(video.videoHeight, Math.ceil(Math.max(...ys) + margin))
        const w  = x1 - x0, h = y1 - y0
        if (w <= 0 || h <= 0) return

        // apply blur filter and redraw just that patch (same as before)
        ctx.save()
        ctx.filter = 'blur(25px)'
        ctx.drawImage(offCanvas, x0, y0, w, h, x0, y0, w, h)
        ctx.restore()
        ctx.save()
        ctx.filter = 'blur(25px)'
        ctx.drawImage(offCanvas, x0, y0, w, h, x0, y0, w, h)
        ctx.restore()
        ctx.save()
        ctx.filter = 'blur(25px)'
        ctx.drawImage(offCanvas, x0, y0, w, h, x0, y0, w, h)
        ctx.restore()
        ctx.save()
        ctx.filter = 'blur(20px)'
        ctx.drawImage(offCanvas, x0, y0, w, h, x0, y0, w, h)
        ctx.restore()
      })
    })
  }, 100)
}
