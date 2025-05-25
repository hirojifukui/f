// script6.js
// extracting face based on face landmarks
// and overlay ontop of roku.png

const video = document.getElementById('video')

// load your Roku frame image
const rokuImage = new Image()
rokuImage.src = 'roku.png'

const isIOS = (
  /iP(hone|od|ad)/.test(navigator.platform) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
)

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('models'),
]).then(() => {
  // wait for Roku image to load before starting video
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
  // main overlay canvas
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  // offscreen canvas to capture raw video pixels
  const offCanvas = document.createElement('canvas')
  offCanvas.width  = video.videoWidth
  offCanvas.height = video.videoHeight
  const offCtx = offCanvas.getContext('2d')

  faceapi.matchDimensions(canvas, {
    width:  video.videoWidth,
    height: video.videoHeight
  })

  // compute how much we're scaling the Roku image to fill the canvas width
  const bgScale = video.videoWidth / rokuImage.width
  const bgHeight = rokuImage.height * bgScale

  // the face‐slot on the Roku frame, scaled to match canvas
  const faceSlot = {
    x: 428 * bgScale,
    y: 222 * bgScale,
    w: 120 * bgScale,
    h: 99  * bgScale
  }

  setInterval(async () => {
    // grab current video frame
    offCtx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height)

    // detect face + landmarks
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    const resized  = faceapi.resizeResults(detections, {
      width:  video.videoWidth,
      height: video.videoHeight
    })

    // clear and draw Roku background
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(rokuImage, 0, 0, rokuImage.width, rokuImage.height,
                              0, 0, video.videoWidth, bgHeight)

    // for each detected face, extract & draw into the Roku face‐slot
    resized.forEach(det => {
      // use the bounding box around the whole face
      const { x: fx, y: fy, width: fw, height: fh } = det.detection.box

      // extract and scale the face into the slot
      ctx.drawImage(
        offCanvas,
        fx, fy, fw, fh,                   // source face rect
        faceSlot.x, faceSlot.y,          // destination top-left
        faceSlot.w, faceSlot.h           // destination size
      )
    })
  }, 100)
}
