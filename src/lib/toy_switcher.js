// toy types
const TT_COLLECTING_RAIN = 0;
const TT_SPILLING_PAINT = 1;

const SELECTED_CLASS = "selected";

let TOY = COLLECTING_RAIN;
let TOY_P5, CANVAS_PARENT;

function switchToy(newToy, button, allButtons)
{
  if (button.classList.contains(SELECTED_CLASS)) return;

  const currentScroll = window.pageYOffset;
  
  if (TOY_P5)
  {
    window.onblur = null;
    window.onclick = null;
    window.onmousedown = null;
    window.onmouseup = null;
    window.ontouchstart = null;
    window.ontouchend = null;
    TOY_P5.remove();
  }

  allButtons.forEach((button) => {
    button.classList.remove(SELECTED_CLASS);
  })
  button.classList.add(SELECTED_CLASS);

  CANVAS_PARENT = document.getElementById("toy_canvas");

  switch (newToy)
  {
  case TT_COLLECTING_RAIN:
    TOY = COLLECTING_RAIN;
    break;

  case TT_SPILLING_PAINT:
    TOY = SPILLING_PAINT;
    break;
  }

  TOY_P5 = new p5(TOY, CANVAS_PARENT);
  window.scrollTo(0, currentScroll);
}