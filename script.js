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
  // canvas where we draw our masks
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  // offscreen canvas for sampling the video pixels
  const offCanvas = document.createElement('canvas')
  offCanvas.width = video.width
  offCanvas.height = video.height
  const offCtx = offCanvas.getContext('2d')

  const displaySize = { width: video.width, height: video.height }
  faceapi.matchDimensions(canvas, displaySize)

  setInterval(async () => {
    // draw current video frame into offscreen canvas
    offCtx.drawImage(video, 0, 0, video.width, video.height)

    // detect faces + landmarks
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()

    // resize to match our displayed canvas
    const resized = faceapi.resizeResults(detections, displaySize)

    // clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // for each face, mask out eyes, nose, mouth
    for (const det of resized) {
      const lm = det.landmarks

      // regions to cover
      const regions = [
        lm.getLeftEye(),
        lm.getRightEye(),
        lm.getNose(),
        lm.getMouth()
      ]

      for (const region of regions) {
        fillRegionWithAverageColor(offCtx, ctx, region)
      }
    }
  }, 100)
})

/**
 * Samples the video frame on sourceCtx under the polygon 'region',
 * computes the average RGB color, and fills that polygon on destCtx.
 */
function fillRegionWithAverageColor(sourceCtx, destCtx, region) {
  // compute bounding box
  const xs = region.map(p => p.x)
  const ys = region.map(p => p.y)
  const minX = Math.floor(Math.min(...xs))
  const minY = Math.floor(Math.min(...ys))
  const maxX = Math.ceil(Math.max(...xs))
  const maxY = Math.ceil(Math.max(...ys))
  const width = maxX - minX
  const height = maxY - minY
  if (width === 0 || height === 0) return

  // get the pixel data
  const imgData = sourceCtx.getImageData(minX, minY, width, height)
  const data = imgData.data

  // accumulate RGB for pixels inside the polygon
  let r = 0, g = 0, b = 0, count = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = minX + x, py = minY + y
      if (pointInPolygon({ x: px, y: py }, region)) {
        const idx = (y * width + x) * 4
        r += data[idx]
        g += data[idx + 1]
        b += data[idx + 2]
        count++
      }
    }
  }
  if (count === 0) return

  // average color
  r = Math.round(r / count)
  g = Math.round(g / count)
  b = Math.round(b / count)
  destCtx.fillStyle = `rgb(${r}, ${g}, ${b})`

  // draw & fill the polygon
  destCtx.beginPath()
  destCtx.moveTo(region[0].x, region[0].y)
  region.forEach(pt => destCtx.lineTo(pt.x, pt.y))
  destCtx.closePath()
  destCtx.fill()
}

/**
 * Classic ray-casting algorithm to test if point is inside polygon
 */
function pointInPolygon(point, vs) {
  const x = point.x, y = point.y
  let inside = false
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, yi = vs[i].y
    const xj = vs[j].x, yj = vs[j].y
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}
