// script3.js
const video = document.getElementById('video')

// 1) Load your Roku frame
const rokuImage = new Image()
rokuImage.src = 'roku.png'

// 2) iOS detection (for potential fallbacks)
const isIOS = (
  /iP(hone|od|ad)/.test(navigator.platform) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
)

// 3) Load Face-API models, then wait for Roku image before starting
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('models'),
]).then(() => {
  if (rokuImage.complete) startVideo()
  else rokuImage.onload = startVideo
}).catch(err => console.error('Model load error:', err))

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
  // — overlay canvas for drawing
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  // — offscreen canvas for grabbing raw video frames
  const offCanvas = document.createElement('canvas')
  offCanvas.width  = video.videoWidth
  offCanvas.height = video.videoHeight
  const offCtx = offCanvas.getContext('2d')

  // keep face-api happy
  faceapi.matchDimensions(canvas, {
    width:  video.videoWidth,
    height: video.videoHeight
  })

  // how much we scale Roku → our canvas
  const bgScale  = video.videoWidth / rokuImage.width
  const bgHeight = rokuImage.height * bgScale

  // where the face goes on the Roku frame
  const faceSlot = {
    x: 420 * bgScale,
    y: 200 * bgScale,
    w: 130 * bgScale,
    h: 129 * bgScale
  }

  // redraw ~10fps
  setInterval(async () => {
    // capture current frame
    offCtx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height)

    // detect face + landmarks
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    const resized = faceapi.resizeResults(detections, {
      width:  video.videoWidth,
      height: video.videoHeight
    })

    // draw scaled Roku background
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(
      rokuImage,
      0, 0, rokuImage.width, rokuImage.height,
      0, 0, video.videoWidth, bgHeight
    )

    resized.forEach(det => {
      // 1) compute mapping from raw box → faceSlot
      const { x: fx, y: fy, width: fw, height: fh } = det.detection.box
      const scaleX  = faceSlot.w / fw
      const scaleY  = faceSlot.h / fh
      const offsetX = faceSlot.x - fx * scaleX
      const offsetY = faceSlot.y - fy * scaleY

      // 2) get the jaw polygon, mapped into slot coords
      const jaw = det.landmarks.getJawOutline()
      const jawMapped = jaw.map(p => ({
        x: p.x * scaleX + offsetX,
        y: p.y * scaleY + offsetY
      }))

      // 3) find the very top of the face (smallest y across all 68 landmarks)
      const allPts     = det.landmarks.positions
      const yTopRaw    = Math.min(...allPts.map(p => p.y))
      const yTopMapped = yTopRaw * scaleY + offsetY

      // 4) raise both end‐points of the jaw up to that top‐face y
      jawMapped[0].y                = yTopMapped
      jawMapped[jawMapped.length-1].y = yTopMapped

      // 5) clip to the adjusted jaw shape, then draw
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(jawMapped[0].x, jawMapped[0].y)
      jawMapped.forEach(pt => ctx.lineTo(pt.x, pt.y))
      ctx.closePath()
      ctx.clip()

      // 6) draw the face into the slot
      ctx.drawImage(
        offCanvas,
        fx, fy, fw, fh,
        faceSlot.x, faceSlot.y,
        faceSlot.w, faceSlot.h
      )
      ctx.restore()
    })
  }, 100)
}
