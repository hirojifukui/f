// script4.js
const video = document.getElementById('video')

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('models'),
])
  .then(startVideo)
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
  // 1) Create overlay + offscreen canvases
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')
  faceapi.matchDimensions(canvas, {
    width:  video.videoWidth,
    height: video.videoHeight
  })

  const offCanvas = document.createElement('canvas')
  offCanvas.width  = video.videoWidth
  offCanvas.height = video.videoHeight
  const offCtx = offCanvas.getContext('2d')

  // 2) Repeated detection + drawing loop
  setInterval(async () => {
    // capture current frame
    offCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight)

    // face + landmarks
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    const resized = faceapi.resizeResults(detections, {
      width:  video.videoWidth,
      height: video.videoHeight
    })

    // clear previous overlay
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (resized.length === 0) return

    // use the first face's jaw outline
    const jaw = resized[0].landmarks.getJawOutline()
    if (!jaw.length) return

    // find the lowest jaw y-coordinate
    const maxY = Math.max(...jaw.map(p => p.y))

    // define a 10px slice just below that point
    const sliceH = 10
    const sliceY = Math.min(video.videoHeight - sliceH, Math.floor(maxY))

    // tile that slice downward
    for (let y = sliceY; y < video.videoHeight; y += sliceH) {
      ctx.drawImage(
        offCanvas,
        0, sliceY,                              // source x, y
        video.videoWidth, sliceH,               // source w, h
        0, y,                                   // dest x, y
        video.videoWidth, sliceH                // dest w, h
      )
    }
  }, 100)
}
