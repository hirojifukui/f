// … after you ctx.clip() to jaw shape …

// 1) draw the face in grayscale (so we keep its light/dark detail)
ctx.save()
ctx.filter = 'grayscale(100%)'
ctx.drawImage(
  offCanvas,
  fx, fy, fw, fh,
  faceSlot.x, faceSlot.y,
  faceSlot.w, faceSlot.h
)

// 2) apply your target color over it, using the 'color' blend mode
ctx.filter = 'none'
ctx.globalCompositeOperation = 'color'
ctx.fillStyle = 'rgb(158,132,117)'
ctx.fillRect(
  faceSlot.x, faceSlot.y,
  faceSlot.w, faceSlot.h
)

// 3) restore default composite so future draws are normal
ctx.globalCompositeOperation = 'source-over'
ctx.restore()
