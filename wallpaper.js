const customEraserCursor = document.getElementById('custom-eraser-cursor')
const date = document.getElementById('date')
const time = document.getElementById('time')
const pageNumber = document.getElementById('page-number')
const inputColor = document.getElementById('input-color')
const sliderPen = document.getElementById('slider-pen')
const sliderEraser = document.getElementById('slider-eraser')
const undo = document.getElementById('undo')
const canvas = document.getElementById('canvas')
const ctx = canvas.getContext('2d')

canvas.width = window.innerWidth
canvas.height = window.innerHeight
const baseHeight = canvas.height
let cW = canvas.width
let cH = canvas.height

//  should not be able to draw in the toolbar
const minY = 100
const colors = {
  background: 'rgb(40,44,52)',
  purple: 'rgb(198,120,221)',
  darkPurple: 'rgb(150, 72, 173)',
  red: 'rgb(224, 108, 117)',
  darkRed: 'rgb(176, 60, 69)',
  green: 'rgb(152, 195, 121)',
  darkGreen: 'rgb(104, 147, 73)',
  blue: 'rgb(0, 194, 182)',
  darkBlue: 'rgb(0, 146, 134)',
  yellow: 'rgb(229, 192, 123)',
  darkYellow: 'rgb(191, 154, 85)'
}
let currentColor = colors.purple
let previousButton
let thickness = sliderPen.value
let eraserThickness = sliderEraser.value
let currentPageIndex = 0
let currentPageNum = 1
let totalPages = 1

let usingSelectorTool = false
let usingEraser = false
let isMouseDown = false
let movingSelectedArea = false
let hasMovedSelectedArea = false

let pos = { x: 0, y: 0 }
let previousPos = { x: 0, y: 0 }
let selectorStartPoint
let selectorEndPoint
let lastSelectedPoints

//  stores canvas states to undo button
let canvasPointStates = []
//  create a smaller array to add to total canvas states array
let currentPointState = []
//  an array containing the canvasPointStates for each page
let pagePointStates = []
// an array of selected lines
let selectedLines = []
//  key-value array: key = index of initial pos in canvasPointStates,
//  value is index of new position in canvasPointStates after selected and moved
let movedLinesMapping = []

let minSelectedX, maxSelectedX, minSelectedY, maxSelectedY

//  custom dynamic eraser cursor
let cursorEraserWidth = eraserThickness
let cursorEraserHeight = eraserThickness
customEraserCursor.style.width = eraserThickness
customEraserCursor.style.height = eraserThickness

window.onresize = () => {
  canvas.width = window.innerWidth
  cW = canvas.width
}

const update = () => {
  const diffx = pos.x - previousPos.x
  const diffy = pos.y - previousPos.y
  const diffsq = diffx * diffx + diffy * diffy

  handleClock()

  if (isMouseDown && diffsq >= 16) {
    if (pos.y > minY) {
      if (usingEraser) {
        currentPointState.push({
          x: pos.x,
          y: pos.y,
          currentColor,
          thick: eraserThickness
        })
      } else {
        currentPointState.push({ x: pos.x, y: pos.y, currentColor, thickness })
      }
    }

    ctx.strokeStyle = currentColor
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(previousPos.x, previousPos.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()

    previousPos.x = pos.x
    previousPos.y = pos.y
  }
}

sliderPen.addEventListener('input', () => {
  thickness = sliderPen.value
  if (!usingEraser) {
    ctx.lineWidth = thickness
  }
})

sliderEraser.addEventListener('input', () => {
  eraserThickness = sliderEraser.value
  if (usingEraser) {
    ctx.lineWidth = eraserThickness
  }
  handleEraserCursorThickness()
})

const handleClock = () => {
  const d = new Date()
  date.innerText = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`

  //  convert military time to standard time
  var timeValue
  const hours = d.getHours()
  const minutes = d.getMinutes()
  const seconds = d.getSeconds()
  if (hours > 0 && hours <= 12) {
    timeValue = '' + hours
  } else if (hours > 12) {
    timeValue = '' + (hours - 12)
  } else if (hours == 0) {
    timeValue = '12'
  }

  timeValue += minutes < 10 ? ':0' + minutes : ':' + minutes // get minutes
  timeValue += seconds < 10 ? ':0' + seconds : ':' + seconds // get seconds
  timeValue += hours >= 12 ? ' P.M.' : ' A.M.' // get AM/PM
  time.innerText = timeValue
}

const handlePreviousPage = () => {
  //  check if previous page exists
  if (currentPageIndex === 0) return

  clearPage()
  pagePointStates[currentPageIndex] = [...canvasPointStates]
  currentPageIndex--

  drawPoints(pagePointStates[currentPageIndex])
  canvasPointStates = pagePointStates[currentPageIndex]
  currentPageNum--
  pageNumber.innerText = `${currentPageNum} of ${totalPages}`
}

const handleNextPage = () => {
  clearPage()
  pagePointStates[currentPageIndex] = [...canvasPointStates]
  currentPageIndex++

  if (pagePointStates[currentPageIndex]) {
    drawPoints(pagePointStates[currentPageIndex])
    canvasPointStates = pagePointStates[currentPageIndex]
  } else {
    totalPages++
    canvasPointStates = []
  }
  currentPageNum++
  pageNumber.innerText = `${currentPageNum} of ${totalPages}`
}

const handleUndo = () => {
  //  if undoing a select move, have to update movedLinesMapping accordingly
  //  and allow original shape to be reverted
  // for (let lineMap of movedLinesMapping) {
  //   if (lineMap.movedLine === canvasPointStates.length - 1) {
  //     //  {2,5}
  //     movedLinesMapping.pop()
  //   }
  //   // console.log(lineMap)
  //   // if (lineMap.movedLine === canvasPointStates.length) {
  //   //   //  delete key-value in movedLinesMapping

  //   //   movedLinesMapping.pop()
  //   // }
  // }

  canvasPointStates.pop()
  clearPage()
  drawPoints(canvasPointStates)
}

const handleSelector = () => {
  //  get all points between top-left and bottom-right
  minSelectedX = Math.min(selectorStartPoint.x, selectorEndPoint.x)
  maxSelectedX = Math.max(selectorStartPoint.x, selectorEndPoint.x)
  minSelectedY = Math.min(selectorStartPoint.y, selectorEndPoint.y)
  maxSelectedY = Math.max(selectorStartPoint.y, selectorEndPoint.y)

  //  save all points in the selected area
  let numSelectionsCount = 0
  for (let i = 0; i < canvasPointStates.length; i++) {
    for (let point of canvasPointStates[i]) {
      if (
        point.x >= minSelectedX &&
        point.x <= maxSelectedX &&
        point.y >= minSelectedY &&
        point.y <= maxSelectedY
      ) {
        //  if the line contains a point in selected region, add it to selectedLines array
        //  we have to check if selectedLines already contains canvasPointStates[i] or we get a bug
        //  in which there are duplicated lines which causes selectedLines to double in size upon each selection
        if (
          !selectedLines.some(
            (line) =>
              JSON.stringify(line) === JSON.stringify(canvasPointStates[i])
          )
        ) {
          selectedLines.push([...canvasPointStates[i]])
        }
        movedLinesMapping.push({
          originalLine: i,
          movedLine: canvasPointStates.length + numSelectionsCount
        })
        numSelectionsCount++
        break //for now if any pixel is touching selected area
      }
    }
  }
}

const handleEraserCursorThickness = () => {
  cursorEraserWidth = eraserThickness
  cursorEraserHeight = eraserThickness
  customEraserCursor.style.width = eraserThickness
  customEraserCursor.style.height = eraserThickness
}

const drawPoints = (cPoints) => {
  for (let i = 0; i < cPoints.length; i++) {
    if (cPoints[i].length > 0) {
      ctx.strokeStyle = cPoints[i][0].currentColor
      ctx.lineWidth = cPoints[i][0].thick
    }

    //  if the line was selected and moved, don't draw the original
    let lineMoved = false
    movedLinesMapping = []
    /*
    for (let lineMap of movedLinesMapping) {
      if (lineMap.originalLine === i) lineMoved = true
    }
    if (lineMoved) continue
    */
    for (let pointIdx = 0; pointIdx < cPoints[i].length - 1; pointIdx++) {
      //  connect the two points
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(cPoints[i][pointIdx].x, cPoints[i][pointIdx].y)
      ctx.lineTo(cPoints[i][pointIdx + 1].x, cPoints[i][pointIdx + 1].y)
      ctx.stroke()
    }
  }
  //  drawPoints changes lineWidth to previous point, have to change thickness back to current point
  if (usingEraser) {
    ctx.lineWidth = eraserThickness
  } else {
    ctx.lineWidth = thickness
  }
}

const clearPage = () => {
  ctx.fillStyle = colors.background
  ctx.clearRect(0, 0, cW, cH)
  ctx.fillRect(0, 0, cW, cH)
}

//  add event listeners and background colors to pen color divs
document.querySelectorAll('.pen-color').forEach((colorButton) => {
  colorButton.addEventListener('click', () => {
    usingEraser = false
    usingSelectorTool = false

    customEraserCursor.style.display = 'none'

    if (previousButton) {
      switch (previousButton.id) {
        case 'pen-purple':
          previousButton.style.backgroundColor = colors.purple
          break
        case 'pen-red':
          previousButton.style.backgroundColor = colors.red
          break
        case 'pen-blue':
          previousButton.style.backgroundColor = colors.blue
          break
        case 'pen-green':
          previousButton.style.backgroundColor = colors.green
          break
        case 'pen-yellow':
          previousButton.style.backgroundColor = colors.yellow
          break
      }
    }

    switch (colorButton.id) {
      case 'pen-purple':
        colorButton.style.backgroundColor = colors.darkPurple
        currentColor = colors.purple
        break
      case 'pen-red':
        colorButton.style.backgroundColor = colors.darkRed
        currentColor = colors.red
        break
      case 'pen-blue':
        colorButton.style.backgroundColor = colors.darkBlue
        currentColor = colors.blue
        break
      case 'pen-green':
        colorButton.style.backgroundColor = colors.darkGreen
        currentColor = colors.green
        break
      case 'pen-yellow':
        colorButton.style.backgroundColor = colors.darkYellow
        currentColor = colors.yellow
        break
      case 'eraser':
        usingEraser = true
        currentColor = colors.background
        customEraserCursor.style.display = 'initial'
        handleEraserCursorThickness()
        break
      case 'selector':
        usingSelectorTool = true
        break
      case 'undo':
        handleUndo()
        break
      case 'reset':
        canvasPointStates = []
        clearPage()
        break
      case 'previous-page':
        handlePreviousPage()
        break
      case 'next-page':
        handleNextPage()
        break
    }
    ctx.lineWidth = colorButton.id === 'eraser' ? eraserThickness : thickness
    previousButton = colorButton
  })
})

window.addEventListener('mousedown', (e) => {
  const x = e.clientX
  const y = e.clientY

  isMouseDown = true

  // //  removed the outline of the selector
  if (selectorStartPoint) {
    clearPage()
    drawPoints(canvasPointStates)
  }

  if (!usingSelectorTool) {
    currentPointState = []
    if (previousPos.x !== x && previousPos.y !== y && y > minY) {
      if (usingEraser) {
        currentPointState.push({
          x: pos.x,
          y: pos.y,
          currentColor,
          thick: eraserThickness
        })
      } else {
        currentPointState.push({
          x: pos.x,
          y: pos.y,
          currentColor,
          thick: thickness
        })
      }
    }

    //  if wallpaper on multiple monitors, possible to have mouse cords be out of bounds
    if (x < 1 || x >= cW - 1) return

    previousPos.x = x
    previousPos.y = y

    //  draw a single dot point
    ctx.strokeStyle = currentColor
    ctx.beginPath()
    ctx.moveTo(x - 1, y - 1)
    ctx.lineTo(x + 1, y + 1)
    currentPointState.push({
      x: x - 1,
      y: y - 1,
      currentColor,
      thick: thickness
    })
    ctx.stroke()
  } else {
    selectorStartPoint = { x, y }
    lastSelectedPoints = { x, y }
  }

  //  if a grid has been selected and user clicks it
  if (
    selectedLines.length > 0 &&
    x >= minSelectedX &&
    x <= maxSelectedX &&
    y >= minSelectedY &&
    y <= maxSelectedY
  ) {
    movingSelectedArea = true
  } else {
    selectedLines = []
  }
})

window.addEventListener('mousemove', (e) => {
  const x = e.clientX
  const y = e.clientY

  customEraserCursor.style.top = y - cursorEraserHeight / 2
  customEraserCursor.style.left = x - cursorEraserWidth / 2

  //  draw the outline of the selected area
  if (
    selectorStartPoint &&
    usingSelectorTool &&
    isMouseDown &&
    canvasPointStates.length > 0
  ) {
    //  clear the canvas and redraw last state (removed the previous selector outline)
    clearPage()
    drawPoints(canvasPointStates)
    ctx.lineWidth = '2'
    ctx.setLineDash([10])
    ctx.strokeStyle = 'GRAY'
    ctx.rect(
      selectorStartPoint.x,
      selectorStartPoint.y,
      x - selectorStartPoint.x,
      y - selectorStartPoint.y
    )
    ctx.stroke()
    ctx.setLineDash([0])
  }

  if (!usingSelectorTool) {
    pos.x = x
    pos.y = y
  }

  if (movingSelectedArea) {
    const distX = x - lastSelectedPoints.x
    const distY = y - lastSelectedPoints.y
    hasMovedSelectedArea = true

    lastSelectedPoints.x = x
    lastSelectedPoints.y = y

    //  update selectedLines points
    const tempLines = [...canvasPointStates]
    for (let line of selectedLines) {
      for (let point of line) {
        point.x += distX
        point.y += distY
      }
      tempLines.push(line)
    }

    clearPage()
    drawPoints(tempLines)
  }
})

window.addEventListener('mouseup', (e) => {
  isMouseDown = false

  if (hasMovedSelectedArea && movingSelectedArea) {
    //  Do not push to point states yet, do implementing this feature
    //  If you move a line and undo, the line will just get deleted, will not go back to
    //  previous position
    // for (let pointState of selectedLines) {
    //   canvasPointStates.push(pointState)
    // }
    clearPage()
    drawPoints(canvasPointStates)

    movingSelectedArea = false
    hasMovedSelectedArea = false
  }

  if (!usingSelectorTool) {
    //  add to total state and clear current point state
    if (e.clientY > minY) {
      canvasPointStates.push([...currentPointState])
    }
    currentPointState = []
  } else {
    selectorEndPoint = { x: e.clientX, y: e.clientY }
    handleSelector()
  }
})

const init = () => {
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, cW, cH)
  ctx.lineWidth = 4

  setInterval(update, 0)
}
init()
