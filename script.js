// script.js
const video = document.getElementById('video')

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('models'),
  faceapi.nets.faceRecognitionNet.loadFromUri('models'),
  faceapi.nets.faceExpressionNet.loadFromUri('models')
]).then(startVideo)

function startVideo() {
  navigator.getUserMedia(
    { video: {} },
    stream => video.srcObject = stream,
    err => console.error(err)
  )
}

video.addEventListener('play', () => {
  // onscreen canvas
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  // offscreen canvas for sampling pixels
  const offCanvas = document.createElement('canvas')
  offCanvas.width = video.width
  offCanvas.height = video.height
  const offCtx = offCanvas.getContext('2d')

  faceapi.matchDimensions(canvas, { width: video.width, height: video.height })

  setInterval(async () => {
    // grab current frame
    offCtx.drawImage(video, 0, 0, video.width, video.height)
    // detect faces
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
    const resized = faceapi.resizeResults(detections, { width: video.width, height: video.height })

    // clear previous
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // for each face, mask a filled ellipse
    resized.forEach(det => {
      const box = det.detection.box
      fillFaceOval(offCtx, ctx, box)
    })
  }, 100)
})

/**
 * Samples the sourceCtx over the ellipse defined by `box`:
 *   center at (box.x+box.width/2, box.y+box.height/2),
 *   radii (box.width/2, box.height/2).
 * Computes the average RGB color inside that ellipse and
 * fills the same ellipse on destCtx.
 */
function fillFaceOval(sourceCtx, destCtx, box) {
  const minX = Math.floor(box.x)
  const minY = Math.floor(box.y)
  const width = Math.ceil(box.width)
  const height = Math.ceil(box.height)
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  const radiusX = box.width / 2
  const radiusY = box.height / 2

  // get all pixels in the bounding box
  const imgData = sourceCtx.getImageData(minX, minY, width, height)
  const data = imgData.data
  let r = 0, g = 0, b = 0, count = 0

  // iterate and test ellipse membership
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = minX + x
      const py = minY + y
      const dx = (px - centerX) / radiusX
      const dy = (py - centerY) / radiusY
      if (dx * dx + dy * dy <= 1) {
        const idx = (y * width + x) * 4
        r += data[idx]
        g += data[idx + 1]
        b += data[idx + 2]
        count++
      }
    }
  }
  if (!count) return

  // compute average color
  r = Math.round(r / count)
  g = Math.round(g / count)
  b = Math.round(b / count)
  destCtx.fillStyle = `rgb(${r}, ${g}, ${b})`

  // draw & fill the ellipse
  destCtx.beginPath()
  destCtx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI)
  destCtx.fill()
}
