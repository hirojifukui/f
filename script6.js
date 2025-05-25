// script3.js
const video = document.getElementById('video')

// 1) Load your Roku frame
const rokuImage = new Image()
rokuImage.src = 'roku.png'

// 2) iOS detection (for other fallbacks, if needed)
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
  // — overlay canvas for drawing everything
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  // — offscreen canvas for raw video pixels
  const offCanvas = document.createElement('canvas')
  offCanvas.width  = video.videoWidth
  offCanvas.height = video.videoHeight
  const offCtx = offCanvas.getContext('2d')

  // match dimensions so face-api resizing works
  faceapi.matchDimensions(canvas, {
    width:  video.videoWidth,
    height: video.videoHeight
  })

  // scale your Roku background to fill the video width
  const bgScale  = video.videoWidth / rokuImage.width
  const bgHeight = rokuImage.height * bgScale

  // define your face‐slot on the Roku frame, scaled
  const faceSlot = {
    x: 428 * bgScale,
    y: 222 * bgScale,
    w: 120 * bgScale,
    h:  99 * bgScale
  }

  // redraw ~10fps
  setInterval(async () => {
    // grab video frame
    offCtx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height)

    // detect faces + landmarks
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    const resized = faceapi.resizeResults(detections, {
      width:  video.videoWidth,
      height: video.videoHeight
    })

    // clear & draw Roku background
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(
      rokuImage,
      0, 0, rokuImage.width, rokuImage.height,    // source
      0, 0, video.videoWidth, bgHeight            // dest
    )

    // for each face, map & clip to jaw shape, then draw
    resized.forEach(det => {
      const { x: fx, y: fy, width: fw, height: fh } = det.detection.box

      // compute linear mapping from original box → faceSlot
      const scaleX = faceSlot.w / fw
      const scaleY = faceSlot.h / fh
      const offsetX = faceSlot.x - fx * scaleX
      const offsetY = faceSlot.y - fy * scaleY

      // pull out the jaw‐outline points
      const jaw = det.landmarks.getJawOutline()

      // map them into the faceSlot coordinate space
      const jawMapped = jaw.map(p => ({
        x: p.x * scaleX + offsetX,
        y: p.y * scaleY + offsetY
      }))

      // 1) clip everything **outside** the jaw polygon
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(jawMapped[0].x, jawMapped[0].y)
      jawMapped.forEach(pt => ctx.lineTo(pt.x, pt.y))
      ctx.closePath()
      ctx.clip()   // after this, only inside-jaw drawing is visible

      // 2) draw the face from the offscreen video into the slot
      ctx.drawImage(
        offCanvas,
        fx, fy, fw, fh,                  // source: full face rect
        faceSlot.x, faceSlot.y,         // dest top-left
        faceSlot.w, faceSlot.h          // dest size
      )
      ctx.restore()
    })
  }, 100)
}
