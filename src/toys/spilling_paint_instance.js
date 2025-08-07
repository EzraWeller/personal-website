// Notes
  // make it flash red when you _don't_ meet a goal then _reset_!
  // you have to get all the goals in one shot to win

const SPILLING_PAINT = (sk) =>
{
  //// UTILITY ////
  {
    function rand_range(min, max)
    {
      return Math.random() * (max - min) + min
    }

    function vec2distanceSq(v1, v2)
    {
      const x = v1[0] - v2[0];
      const y = v1[1] - v2[1];
      return x * x + y * y;
    }

    function clamp(n, min, max)
    {
      return Math.min(Math.max(n, min), max);
    }

    // frame rate independent alpha using exponential
    function exp_lerp_alpha(speed, delta)
    {
      return 1.0 - Math.exp(-speed * delta);
    }
  }

  //// CONSTANTS ////
  const CIRCLE_STYLE_COUNT = 3;
  const CIRCLE_COUNT_START = 4;
  const CIRCLE_COUNT_MAX = 7;

  const CIRCLE_STATE_NONE = 0;
  const CIRCLE_STATE_BIRTH = 1;
  const CIRCLE_STATE_READY = 2;
  const CIRCLE_STATE_GROW = 3;
  const CIRCLE_STATE_DONE = 4;
  const CIRCLE_STATE_SHRINK = 5;
  const CIRCLE_STATE_DRAG = 6;

  const CIRCLE_RENDERING_DATA_STRIDE = 5;
  const CIRCLE_X_IDX = 0;
  const CIRCLE_Y_IDX = 1;
  const CIRCLE_RAD_IDX = 2;
  const CIRCLE_PRIO_IDX = 3;
  const CIRCLE_TRANS_IDX = 4;
  const CIRCLE_INITIAL_RADIUS = 0.075;
  const CIRCLE_RADIUS_EPS = 0.001;
  const CIRCLE_COL_BUFF = 0.05;
  const CIRCLE_BIRTH_SPEED = 5.0;
  const CIRCLE_GROWTH_SPEED = 0.15;
  const CIRCLE_SHRINK_SPEED = 3.5;
  const CIRCLE_DRAG_SPEED = 4.0;
  const CIRCLE_TRANS_SPEED = 4.0;

  const SCREEN_FULL_MEAS_STEPS = 5.0;
  const CIRCLE_COVERAGE_MEAS_STEPS = 32.0;

  const SCREEN_FULL_SEQ_TIME = 1.7;

  const GOAL_MOSTLY_FULL_SINGLE_FRACT = 0.75;
  const GOAL_MOSTLY_FULL_DOUBLE_FRACT = 0.36;
  const GOAL_MOSTLY_FULL_TRIPLE_FRACT = 0.17;

  const CIRCLES_SEC_FRACT = 0.8;
  // const GOALS_SEC_FRACT = 1.0 - CIRCLES_SEC_FRACT;

  //// STATE ////
  STATE = 
  {
    circles: {
      count: CIRCLE_COUNT_START,
      maxCount: CIRCLE_COUNT_MAX,
      anyGrowingOrShrinking: false,
      rendering: [],
      state: [],
      dragStartPos: [],
      draggingToPos: [],
      shouldSetupNew: false
    },
    measurement: {
      screenFull: false,
      screenFullStopwatch: 0,
      circleCoverage: [],
      goals: new Array(5).fill(0.0),
      completedAGoal: false
    },
    shaders : {
      fade: {},
      circles: {},
      goals: {},
      post: {},
      fbo1: {},
      fbo2: {},
      fbo3: {}
    },
    paused: false,
    time: {
      delta: 0.0,
      elapsed: 0.0,
    }
  };

  //// CIRCLES ////
  {
    function setupCircles()
    {
      // blue noise algo
        // split space into circle_count grid spaces
        // make an array of these
        // select randomly from this array
        // select a random location in that grid space
        // pop the grid space out of the grid array
        // repeat
      let unusedGridCells = [];

      const rowColumnCount = Math.ceil(Math.sqrt(STATE.circles.maxCount));
      for (let i = 0; i < rowColumnCount; i++)
      for (let j = 0; j < rowColumnCount; j++)
      {
        unusedGridCells.push({ x: i, y: j });
      }
      unusedGridCells = sk.shuffle(unusedGridCells);

      const rowSize = 1.0 / rowColumnCount;
      const columnSize = rowSize * CIRCLES_SEC_FRACT;

      // make sure these are reset, since we sometimes use this mid-session
      STATE.circles.rendering = [];
      STATE.circles.state = [];
      STATE.circles.draggingToPos = [];

      // xy, radius, priority, growing/shrinking
      for (let i = 0; i < STATE.circles.count; i++)
      {
        const gridCell = unusedGridCells.pop();
        STATE.circles.rendering.push(
          gridCell.x * rowSize + CIRCLE_INITIAL_RADIUS +
          rand_range(0.0, rowSize - CIRCLE_INITIAL_RADIUS * 2.0)
        ); // x
        STATE.circles.rendering.push(
          gridCell.y * columnSize + CIRCLE_INITIAL_RADIUS +
          rand_range(0.0, columnSize - CIRCLE_INITIAL_RADIUS * 2.0)
        ); // y
        STATE.circles.rendering.push(0.0); // radius
        STATE.circles.rendering.push(0); // transitioning
        STATE.circles.rendering.push(0); // priority

        STATE.circles.state.push(CIRCLE_STATE_BIRTH);

        STATE.circles.draggingToPos.push(circleUV(i));
      }
    }

    function setupNewCircle()
    {
      if (STATE.circles.count >= STATE.circles.maxCount) return;

      let unusedGridCells = [];
      let uv, circleInCell;
      const rowColumnCount = Math.ceil(Math.sqrt(STATE.circles.maxCount));
      const rowSize = 1.0 / rowColumnCount;
      const columnSize = rowSize * CIRCLES_SEC_FRACT;

      // get unused grid cells
      for (let i = 0; i < rowColumnCount; i++)
      for (let j = 0; j < rowColumnCount; j++)
      {
        circleInCell = false;
        for (let k = 0; k < STATE.circles.count; k++)
        {
          uv = circleUV(k);
          if (
            uv[0] >= i * rowSize && uv[0] < (i + 1) * rowSize &&
            uv[1] >= j * columnSize && uv[1] < (j + 1) * columnSize
          )
          {
            circleInCell = true;
            break;
          }
        }
        if (!circleInCell) unusedGridCells.push({ x: i, y: j });
      }
      unusedGridCells = sk.shuffle(unusedGridCells);

      const gridCell = unusedGridCells.pop();
      STATE.circles.rendering.push(
        gridCell.x * rowSize + CIRCLE_INITIAL_RADIUS +
        rand_range(0.0, rowSize - CIRCLE_INITIAL_RADIUS * 2.0)
      ); // x
      STATE.circles.rendering.push(
        gridCell.y * columnSize + CIRCLE_INITIAL_RADIUS +
        rand_range(0.0, columnSize - CIRCLE_INITIAL_RADIUS * 2.0)
      ); // y
      STATE.circles.rendering.push(0.0); // radius
      STATE.circles.rendering.push(0); // priority
      STATE.circles.rendering.push(0); // transitioning

      STATE.circles.state.push(CIRCLE_STATE_BIRTH);

      STATE.circles.draggingToPos.push(circleUV(STATE.circles.count));

      STATE.circles.count += 1;
    }

    function circleUV(idx)
    {
      return [
        STATE.circles.rendering[
          idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_X_IDX
        ],
        STATE.circles.rendering[
          idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_Y_IDX
        ]
      ];
    }

    function pointInCircle(u, v, i)
    {
      const distSq = vec2distanceSq([u, v], circleUV(i));
      const r = STATE.circles.rendering[
        i * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_RAD_IDX
      ];
      return distSq < r * r;
    }

    function tryInteractCircle(u, v)
    {
      // no interaction after growth has started
      if (STATE.circles.anyGrowingOrShrinking) return;

      // try to start dragging a circle
      for (let i = 0; i < STATE.circles.count; i++)
      {
        if (pointInCircle(u, v, i))
        {
          // start dragging and record initial drag position
          STATE.circles.state[i] = CIRCLE_STATE_DRAG;
          // STATE.circles.rendering[i * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_TRANS_IDX] = 0.0;
          STATE.circles.dragStartPos[i] = [u, v];
          return;
        }
      }
    }

    function tryEndInteraction(u, v)
    {
      console.log("tried end at ", u, v);
      // try to click on a circle
      for (let i = 0; i < STATE.circles.count; i++)
      {
        if (STATE.circles.state[i] === CIRCLE_STATE_DRAG)
        {
          STATE.circles.state[i] = CIRCLE_STATE_READY;
          // STATE.circles.rendering[i * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_TRANS_IDX] = 0.0;

          // a "click" only happened if start and end interaction were in close to same position
          if (
            pointInCircle(u, v, i) &&
            vec2distanceSq(
              STATE.circles.dragStartPos[i],
              circleUV(i)
            ) < CIRCLE_RADIUS_EPS
          )
          {
            // start growing!
            STATE.circles.state[i] = CIRCLE_STATE_GROW;
            // STATE.circles.rendering[i * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_TRANS_IDX] = 1.0;
            STATE.circles.anyGrowingOrShrinking = true;
            return;
          }
        }
      }
    }

    function circlesOvlerap(idx1, idx2)
    {
      // is distance between the two circle origins less than 
      // the sum of their radii?
      const originDistSq = vec2distanceSq(circleUV(idx1), circleUV(idx2));
      const radiiSum = STATE.circles.rendering[
        idx1 * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_RAD_IDX
      ] + STATE.circles.rendering[
        idx2 * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_RAD_IDX
      ];

      return {
        result: originDistSq < radiiSum * radiiSum, 
        originDistSq, 
        radiiSum 
      };
    }

    function birthCircle(idx)
    {
      // lerp torwards the initial radius
      STATE.circles.rendering[
        idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_RAD_IDX
      ] = sk.lerp(
        STATE.circles.rendering[
          idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_RAD_IDX
        ],
        CIRCLE_INITIAL_RADIUS,
        exp_lerp_alpha(CIRCLE_BIRTH_SPEED, STATE.time.delta)
      );

      // if close to proper size, stop birthing
      if (STATE.circles.rendering[
        idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_RAD_IDX
      ] + CIRCLE_RADIUS_EPS >= CIRCLE_INITIAL_RADIUS)
      {
        STATE.circles.rendering[
          idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_RAD_IDX
        ] = CIRCLE_INITIAL_RADIUS;

        // go to default state
        STATE.circles.state[idx] = CIRCLE_STATE_READY;
      }
    }

    function growCircle(idx)
    {
      // grow circle
      STATE.circles.rendering[
        idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_RAD_IDX
      ] = sk.lerp(
        STATE.circles.rendering[
          idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_RAD_IDX
        ],
        1.5, // some radius for a circle bigger than the screen
        exp_lerp_alpha(CIRCLE_GROWTH_SPEED, STATE.time.delta)
      );

      // check collision with other circles
      for (let i = 0; i < STATE.circles.count; i++)
      {
        if (
          i === idx || // not self
          STATE.circles.state[i] === CIRCLE_STATE_DONE // not circles that already grew
        ) continue;

        if (circlesOvlerap(i, idx).result)
        {
          // we can assume the overlapped circle is not growing, since only 
          // 1 should ever grow at once

          // stop current circle from growing more
          STATE.circles.state[idx] = CIRCLE_STATE_DONE;
          // STATE.circles.rendering[idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_TRANS_IDX] = 0.0;

          // set overlapped circle's priority 1 higher than current circle
          STATE.circles.rendering[
            i * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_PRIO_IDX
          ] = STATE.circles.rendering[
            idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_PRIO_IDX
          ] + 1;

          // start overlapped circle growing
          STATE.circles.state[i] = CIRCLE_STATE_GROW;
          // STATE.circles.rendering[i * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_TRANS_IDX] = 1.0;

          break;
        }
      }
    }

    function shrinkCircle(idx)
    {
      // shrink circle
      STATE.circles.rendering[
        idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_RAD_IDX
      ] = sk.lerp(
        STATE.circles.rendering[
          idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_RAD_IDX
        ],
        CIRCLE_INITIAL_RADIUS,
        exp_lerp_alpha(CIRCLE_SHRINK_SPEED, STATE.time.delta)
      );

      // if small enough, stop
      if (STATE.circles.rendering[
        idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_RAD_IDX
      ] < CIRCLE_INITIAL_RADIUS + CIRCLE_RADIUS_EPS)
      {
        STATE.circles.rendering[
          idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_RAD_IDX
        ] = CIRCLE_INITIAL_RADIUS;
        /*
        STATE.circles.rendering[
          idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_TRANS_IDX
        ] = 0.0;
        */
        // reset state
        STATE.circles.state[idx] = CIRCLE_STATE_READY;
      }
    }

    function dragCircle(idx, updateDragTo = true)
    {
      if (
        STATE.circles.state[idx] === CIRCLE_STATE_GROW || 
        STATE.circles.state[idx] === CIRCLE_STATE_SHRINK
      ) 
      {
        return;
      }

      // get drag to position
      // TODO make this work for touch, too
      if (updateDragTo)
      {
        STATE.circles.draggingToPos[idx] = [ 
          clamp(sk.mouseX / sk.width, 0.0, 1.0), 
          clamp(sk.mouseY / sk.height, 0.0, CIRCLES_SEC_FRACT)
        ];
      }

      // if circle has never been dragged, we can skip
      // if (STATE.circles.draggingToPos[idx] === undefined) return;

      // lerp to drag to position
      STATE.circles.rendering[
        idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_X_IDX
      ] = sk.lerp(
        STATE.circles.rendering[
          idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_X_IDX
        ],
        STATE.circles.draggingToPos[idx][0],
        exp_lerp_alpha(CIRCLE_DRAG_SPEED, STATE.time.delta)
      );
      STATE.circles.rendering[
        idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_Y_IDX
      ] = sk.lerp(
        STATE.circles.rendering[
          idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_Y_IDX
        ],
        STATE.circles.draggingToPos[idx][1],
        exp_lerp_alpha(CIRCLE_DRAG_SPEED, STATE.time.delta)
      );

      // don't care about collision while growing/shrinking
      if (STATE.circles.anyGrowingOrShrinking) return;

      let overlaps = { 
        result: false, 
        originDistSq: 0, 
        radiiSum: 0,
        pos: [0.0, 0.0],
        count: 0
      };

      const draggingToPos = STATE.circles.draggingToPos[idx];
      const radius = STATE.circles.rendering[
        idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_RAD_IDX
      ];

      // find the average of all overlaps to use, including edges
      // circle overlaps
      for (let i = 0; i < STATE.circles.count; i++)
      {
        // not self
        if (i === idx) continue;

        // overlap = circlesOvlerap(i, idx); not using because we the drag to pos avoids glitchy movement
        const uv = circleUV(i);
        const originDistSq = vec2distanceSq(draggingToPos, uv);
        const radiiSum = radius + STATE.circles.rendering[
          i * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_RAD_IDX
        ];

        const res = originDistSq < radiiSum * radiiSum;
        if (res)
        {
          overlaps.result = true;
          overlaps.originDistSq += originDistSq;
          overlaps.radiiSum += radiiSum;
          overlaps.pos[0] += uv[0];
          overlaps.pos[1] += uv[1];
          overlaps.count += 1;
        }
      }

      if (overlaps.result)
      {
        overlaps.originDistSq /= overlaps.count;
        overlaps.radiiSum /= overlaps.count;
        overlaps.pos[0] /= overlaps.count; 
        overlaps.pos[1] /= overlaps.count;
        // move instead to closest non-overlapping position
        // find normalized direction from overlapping circle to our circle
        const uv1 = circleUV(idx);
        const uv2 = overlaps.pos;
        let dir = [uv1[0] - uv2[0], uv1[1] - uv2[1]];
        const dirLen = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1]);
        dir = [ dir[0] / dirLen, dir[1] / dirLen ];
        // find distance from overlapping circle to our circle
        const distToMove = overlaps.radiiSum - Math.sqrt(overlaps.originDistSq) + CIRCLE_COL_BUFF;
        // move our circle's position in that direction enough to avoid overlap
        STATE.circles.draggingToPos[idx][0] 
        // STATE.circles.rendering[idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_X_IDX] 
          =  clamp(draggingToPos[0] + dir[0] * distToMove, 0.0, 1.0);
        STATE.circles.draggingToPos[idx][1] 
        // STATE.circles.rendering[idx * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_Y_IDX] 
          = clamp(draggingToPos[1] + dir[1] * distToMove, 0.0, CIRCLES_SEC_FRACT);
      }
    }

    function lerpCircleTransitionState(i, goal)
    {
      STATE.circles.rendering[i * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_TRANS_IDX] = sk.lerp(
        STATE.circles.rendering[i * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_TRANS_IDX],
        goal,
        exp_lerp_alpha(CIRCLE_TRANS_SPEED, STATE.time.delta)
      );
    }

    function updateCircles()
    {
      let anyShrinking = false;
      for (let i = 0; i < STATE.circles.count; i++)
      {
        switch (STATE.circles.state[i])
        {
          default:
          case CIRCLE_STATE_NONE:
            break;

          case CIRCLE_STATE_BIRTH:
            birthCircle(i);
            break;

          case CIRCLE_STATE_READY:
            dragCircle(i, false);
            lerpCircleTransitionState(i, 0.0);
            break;

          case CIRCLE_STATE_GROW:
            growCircle(i);
            lerpCircleTransitionState(i, 1.0);
            break;

          case CIRCLE_STATE_DONE:
            lerpCircleTransitionState(i, 0.0);
            break;

          case CIRCLE_STATE_SHRINK:
            shrinkCircle(i);
            anyShrinking = true;
            lerpCircleTransitionState(i, 1.0);
            break;

          case CIRCLE_STATE_DRAG:
            lerpCircleTransitionState(i, 0.0);
            dragCircle(i);
            break;
        }
      }

      // if any were shrinking to start, now check if we are done shrinking
      if (anyShrinking)
      {
        let notDoneShrinking = false;
        for (let i = 0; i < STATE.circles.count; i++)
        {
          notDoneShrinking |= 
            STATE.circles.state[i] === CIRCLE_STATE_SHRINK;
        }

        // done shrinking!
        if (!notDoneShrinking) 
        {
          STATE.circles.anyGrowingOrShrinking = false;
          // here is where we reset this, not at the start of shrinking
          STATE.measurement.screenFull = false;

          if (STATE.circles.shouldSetupNew)
          {
            setupNewCircle();
            STATE.circles.shouldSetupNew = false;
          }
          
          // reset priorities
          for (let i = 0; i < STATE.circles.count; i++)
          {
            STATE.circles.rendering[i * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_PRIO_IDX] = 0.0;
          }
        }
      }
    }
  }

  //// MEASUREMENT ////
  {
    function screenFullTick()
    {
      // if not already, check screen full
      if (STATE.measurement.screenFull === false)
      {
        getCircleCoverage(SCREEN_FULL_MEAS_STEPS);
        // console.log("screen full coverage ", STATE.measurement.circleCoverage);
        if (STATE.measurement.circleCoverage[0] > 0)
        {
          // console.log("screen not full");
          STATE.measurement.screenFull = false;
          return;
        }
        console.log("screen full");
        STATE.measurement.screenFull = true;
        checkGoals();

        // set all circles to done
        for (let i = 0; i < STATE.circles.count; i++)
        {
          STATE.circles.state[i] = CIRCLE_STATE_DONE;
          // STATE.circles.rendering[i * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_TRANS_IDX] = 0.0;
        }

        STATE.circles.anyGrowingOrShrinking = false;
      }

      // don't do screen full effects while growing/shrinking
      if (STATE.circles.anyGrowingOrShrinking) return;

      // do screen full effects
      console.log("ticking screen full sequence");
      STATE.measurement.screenFullStopwatch += STATE.time.delta;

      const goalTime = SCREEN_FULL_SEQ_TIME;
        // - (1.0 - Number(STATE.measurement.completedAGoal)) * 0.5 * SCREEN_FULL_SEQ_TIME;

      sk.shader(STATE.shaders.circles);
      let time_fract = STATE.measurement.screenFullStopwatch / goalTime;
      if (STATE.measurement.completedAGoal)
      {
        // smooth in / out the circle color
        const color_out = sk.sin(sk.PI * time_fract);
        STATE.shaders.circles.setUniform('white_out', color_out * color_out);
        if (color_out >= 0.96)
        {
          sk.shader(STATE.shaders.goals);
          STATE.shaders.goals.setUniform('goals_achieved', STATE.measurement.goals);
        }

        // if all goals are now complete
        if (
          STATE.measurement.goals[0] === 1.0
          && STATE.measurement.goals[1] === 1.0
          && STATE.measurement.goals[2] === 1.0
          && STATE.measurement.goals[3] === 1.0
          && STATE.measurement.goals[4] === 1.0
        )
        {
          startFireworks();
        }
      } else {
        // two quick flashes, ending on solid red
        const time_fract_2 = (time_fract * 2) % 1.0;
        const color_out = time_fract <= 0.5 ? sk.sin(sk.PI * time_fract_2) : 1.0 - Math.pow(1.0 - time_fract_2, 4);
        STATE.shaders.circles.setUniform('red_out', color_out * color_out);
      }

      // all done
      if (STATE.measurement.screenFullStopwatch >= goalTime)
      {
        console.log("screen full sequence done");

        STATE.shaders.circles.setUniform('white_out', 0.0);
        STATE.shaders.circles.setUniform('red_out', 0.0);

        STATE.measurement.screenFullStopwatch = 0.0;

        // if we failed to complete a goal, reset everything!
        if (STATE.measurement.completedAGoal === false)
        {
          // circles
          STATE.circles.count = CIRCLE_COUNT_START;
          setupCircles();
          // STATE.circles.rendering = STATE.circles.rendering.slice(0, CIRCLE_COUNT_START * CIRCLE_RENDERING_DATA_STRIDE);
          // STATE.circles.state = STATE.circles.state.slice(0, CIRCLE_COUNT_START);

          // goals
          STATE.measurement.goals = new Array(5).fill(0.0);
          sk.shader(STATE.shaders.goals);
          STATE.shaders.goals.setUniform('goals_achieved', STATE.measurement.goals);

          STATE.measurement.screenFull = false;
        }
        else // start shrinking
        {
          for (let i = 0; i < STATE.circles.count; i++)
          {
            STATE.circles.state[i] = CIRCLE_STATE_SHRINK;
            // STATE.circles.rendering[i * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_TRANS_IDX] = 2.0;
          }

          STATE.circles.anyGrowingOrShrinking = true;
        }
      }
    }

    function getCircleCoverage(steps)
    {
      // this array is organized by circle _priority_
      // so to look up the coverage for a circle based on its idx:
      // idx -> priority -> use priority as index into coverage array
      STATE.measurement.circleCoverage = new Array(STATE.circles.count + 1).fill(0);

      const uStride = 1.0 / steps;
      const vStride = CIRCLES_SEC_FRACT / steps;
      let highestCircleIdx;
      // half strides are to put grid points in the middle
      // of squares instead of edges
      for (let u = uStride * 0.5; u < 1.0; u += uStride)
      for (let v = vStride * 0.5; v < CIRCLES_SEC_FRACT; v += vStride)
      {
        // idx 0 will indicate no circle
        highestCircleIdx = 0; 
        for (let i = 0; i < STATE.circles.count; i++)
        {
          if (pointInCircle(u, v, i))
          {
            highestCircleIdx = Math.max(
              highestCircleIdx,
              // add 1 to reserve 0 as noted above
              STATE.circles.rendering[
                i * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_PRIO_IDX
              ] + 1
            );
          }
        }
        STATE.measurement.circleCoverage[highestCircleIdx] += 1;
      }
    }
  }

  //// GOALS ////
  {
    function checkGoals()
    {
      // get most common "colors"
      getCircleCoverage(CIRCLE_COVERAGE_MEAS_STEPS);

      // we need to actually
        // combine coverages for circles of same style (mod circle id by style - 1)
        // we need to find all, not just top
      let totalCoverage = new Array(CIRCLE_STYLE_COUNT).fill(0);
      // for each circle, get prio -> look up coverage, add to total coverage for that style
      console.log(STATE.measurement.circleCoverage);
      for (let i = 0; i < STATE.circles.count; i++)
      {
        const prio = STATE.circles.rendering[
          i * CIRCLE_RENDERING_DATA_STRIDE + CIRCLE_PRIO_IDX
        ];
        console.log("prio ", prio);
        const style_id = i % (CIRCLE_STYLE_COUNT);
        console.log("style id", style_id, " id ", i);
        totalCoverage[style_id] += STATE.measurement.circleCoverage[prio + 1];
        console.log("adding coverage ", STATE.measurement.circleCoverage[prio + 1]);
      }
      console.log("total coverage ", totalCoverage);

      const covSq = CIRCLE_COVERAGE_MEAS_STEPS * CIRCLE_COVERAGE_MEAS_STEPS;

      STATE.measurement.completedAGoal = false;
      // after each completed goal, we add a new circle
      // 1. mostly red
      if (
        STATE.measurement.goals[0] === 0.0 &&
        totalCoverage[0] / covSq > GOAL_MOSTLY_FULL_SINGLE_FRACT
      )
      {
        console.log("goal 1 achieved");
        STATE.measurement.goals[0] = 1.0;
        STATE.measurement.completedAGoal = true;
      }
      // 2. mostly blue
      if (
        STATE.measurement.goals[1] === 0.0 &&
        totalCoverage[1] / covSq > GOAL_MOSTLY_FULL_SINGLE_FRACT
      )
      {
        console.log("goal 2 achieved");
        STATE.measurement.goals[1] = 1.0;
        STATE.measurement.completedAGoal = true;
      }
      // 3. mostly green
      if (
        STATE.measurement.goals[2] === 0.0 &&
        totalCoverage[2] / covSq > GOAL_MOSTLY_FULL_SINGLE_FRACT
      )
      {
        console.log("goal 3 achieved");
        STATE.measurement.goals[2] = 1.0;
        STATE.circles.shouldSetupNew = true;
        STATE.measurement.completedAGoal = true;
      }
      // 4. mostly red and blue
      if (
        STATE.measurement.goals[3] === 0.0 &&
        totalCoverage[0] / covSq > GOAL_MOSTLY_FULL_DOUBLE_FRACT &&
        totalCoverage[1] / covSq > GOAL_MOSTLY_FULL_DOUBLE_FRACT
      )
      {
        console.log("goal 4 achieved");
        STATE.measurement.goals[3] = 1.0;
        STATE.circles.shouldSetupNew = true;
        STATE.measurement.completedAGoal = true;
      }
      // 5. roughly equal
      if (
        STATE.measurement.goals[4] === 0.0 &&
        totalCoverage[0] / covSq > GOAL_MOSTLY_FULL_TRIPLE_FRACT &&
        totalCoverage[1] / covSq > GOAL_MOSTLY_FULL_TRIPLE_FRACT &&
        totalCoverage[2] / covSq > GOAL_MOSTLY_FULL_TRIPLE_FRACT
      )
      {
        console.log("goal 5 achieved");
        STATE.measurement.goals[4] = 1.0;
        STATE.circles.shouldSetupNew = true;
        STATE.measurement.completedAGoal = true;
      }
    }
  }

  //// SHADERS ////
  {
    const SHADER_CIRCLE_PATTERN = `
      vec4 circle_pattern(float id, float scale_factor)
      {
    
        id = mod_float(id, 3.0);
        const vec2 origin = vec2(0.5, 0.5);

        if (id == 0.0)
        {
          // red squares
          vec2 tiledUV = rotate_vec2_around_center(vTexCoord, 0.25);
          tiledUV = fract(tiledUV * 16.0 * scale_factor);
          float dsq = ceil(sdf_square(origin, tiledUV, 0.75));
          // 
          return mix(
            vec4(0.5, 0.0, 0.0, 1.0),
            vec4(1.0, 0.2, 0.2, 1.0),
            dsq
          );
        }
        else if (id == 1.0)
        {
          // blue circles
          vec2 tiledUV = rotate_vec2_around_center(vTexCoord, 1.2);
          tiledUV = fract(tiledUV * 32.0 * scale_factor);
          float dsq = ceil(sdf_circle_sq(origin, tiledUV, 0.25));
          // 
          return mix(
            vec4(0.0, 0.0, 0.5, 1.0),
            vec4(0.2, 0.2, 1.0, 1.0),
            dsq
          );
        }
        else
        {
          // gold lines
          vec2 tiledUV = rotate_vec2_around_center(vTexCoord, 2.333);
          tiledUV = fract(tiledUV * 24.0 * scale_factor);
          float dsq = ceil(sdf_zigzag(origin, tiledUV, 0.1));
          // 
          return mix(
            vec4(0.5, 0.25, 0.0, 1.0),
            vec4(1.0, 0.93, 0.0, 1.0),
            dsq
          );
        }
      }
    `;

    const CIRCLES_F_SHADER = `
      precision highp float;

      const float border_width = 2.0;
      const float border_width_inv = 1.0 / border_width;

      // uniform vec2 canvasSize;
      uniform float time;
      const int max_circle_count = 100;
      const int circle_stride = 5;
      const int circle_x = 0;
      const int circle_y = 1;
      const int circle_radius = 2;
      const int circle_priority = 3;
      const int circle_trans = 4;
      uniform int circle_count;
      uniform float circles[circle_stride * max_circle_count];
      uniform float white_out;
      uniform float red_out;

      // x,y coordinates, given from the vertex shader
      varying vec2 vTexCoord;

    ` + SHADER_LIB + SHADER_CIRCLE_PATTERN + `

      vec4 get_color(vec2 coord)
      {
        const vec4 red = vec4(0.8, 0.0, 0.0, 1.0);
        vec4 z = vec4(0.0);
        float priority = 0.0;
        float circleToRender = -1.0;
        float bestDSq, bestRSq, bestR;
        vec2 modCoord;
        for (int i = 0; i < max_circle_count; i++)
        {
          if (i >= circle_count) break;

          float c = circles[i * circle_stride + circle_trans];
          modCoord = vec2(
            coord.x + c * sin(fract(time * 0.9) * PI * 2.0 + coord.x * 41.0) / 81.0,
            coord.y + c * sin(fract(time * 0.8) * PI * 2.0 + coord.y * 37.0) / 93.0
          );

          float distSq = vec2_distance_sq(modCoord, 
            vec2(circles[i * circle_stride + circle_x], circles[i * circle_stride + circle_y])
          );
          // pulse when not wiggling
          float pulse = (1.0 - c) * 0.04 * sin((fract(time * 0.5) + float(i) * 0.25) * PI);
          float radiusSq = circles[i * circle_stride + circle_radius] * circles[i * circle_stride + circle_radius]
            + pulse * pulse;
          if (
            distSq < radiusSq &&
            circles[i * circle_stride + circle_priority] >= priority
          )
          {
            circleToRender = float(i);
            priority = circles[i * circle_stride + circle_priority];
            bestDSq = distSq;
            bestRSq = radiusSq;
            bestR = circles[i * circle_stride + circle_radius];

          }
        }
        if (circleToRender < 0.0) return z;

        float main_scale = 1.0 - bestR * 0.5;
        float border = bestDSq / bestRSq * 0.95;

        return mix(
          mix(
            circle_pattern(circleToRender, main_scale),
            z,
            min(white_out, 0.9)
          ),
          red,
          min(red_out, 1.0)
        );
      }

      void main() {
        gl_FragColor = get_color(vTexCoord);
      }
    `;

    const GOALS_F_SHADER = `
      precision highp float;

      // x,y coordinates, given from the vertex shader
      varying vec2 vTexCoord;

    ` + SHADER_LIB + SHADER_CIRCLE_PATTERN + `

      const int goal_count = 5;
      // units is uvs
      const float starting_v = 0.8;
      const float goal_side = 1.0 / float(goal_count) * 0.85;
      const float half_goal_side = goal_side * 0.5;
      const float padding1 = 1.0 / (float(goal_count) + 1.0) * 0.15;
      const float symbol_side = goal_side * 0.667;

      const vec4 goal_background_waiting = vec4(0.8, 0.8, 0.8, 1.0);
      const vec4 goal_background_achieved = vec4(0.0, 0.7, 0.0, 1.0);

      uniform float goals_achieved[goal_count];

      vec2 make_goal_origin(float i)
      {
        return vec2(
          half_goal_side + padding1 + (goal_side + padding1) * i, 
          starting_v + half_goal_side
        );
      }

      /*
        // goals have a 2 part structure: symbol and background
        for a given pixel, do something like
          // is it part of a goal's symbol? return the correct color for that
          // else is it part of a goal's background? return the correct color for that
      */

      vec4 get_symbol_color(float i, float top)
      {
        const float scale = 1.2;
        if (i == 0.0)
        {
          return mix(
            circle_pattern(0.0, scale),
            vec4(1.0),
            float(vTexCoord.y > top + symbol_side * 0.75)
          );
        }
        else if (i == 1.0)
        {
          return mix(
            circle_pattern(1.0, scale),
            vec4(1.0),
            float(vTexCoord.y > top + symbol_side * 0.75)
          );
        }
        else if (i == 2.0)
        {
          return mix(
            circle_pattern(2.0, scale),
            vec4(1.0),
            float(vTexCoord.y > top + symbol_side * 0.75)
          );
        }
        else if (i == 3.0)
        {
          return mix(
            circle_pattern(0.0, scale),
            circle_pattern(1.0, scale),
            float(vTexCoord.y > top + symbol_side * 0.5)
          );
        }
        else if (i == 4.0)
        {
          return mix(
            circle_pattern(0.0, scale),
            mix(
              circle_pattern(1.0, scale),
              circle_pattern(2.0, scale),
              float(vTexCoord.y > top + symbol_side * 0.667)
            ),
            float(vTexCoord.y > top + symbol_side * 0.333)
          );
        }
      }

      vec4 get_color()
      {
        vec2 go;
        float d;
        // for each goal, check the sdf
        for (int i = 0; i < goal_count; i++)
        {
          go = make_goal_origin(float(i));

          // check symbol
          d = sdf_square(go, vTexCoord, symbol_side);
          if (d <= 0.0)
          {
            if (d <= -0.006) // inside square
            {
              return get_symbol_color(float(i), go.y - symbol_side * 0.5);
            }
            return vec4(0.0, 0.0, 0.0, 1.0); // border
          }

          // check background
          if (sdf_square(go, vTexCoord, goal_side) <= 0.0)
          {
            return mix(
              goal_background_waiting,
              goal_background_achieved,
              goals_achieved[i]
            );
          }
        }

        return vec4(0.0);
      }

      void main() {
        gl_FragColor = get_color();
      }
    `;

  // prev frame trail
  const FADE_F_SHADER = `
    precision highp float;

    uniform sampler2D fbo;
    uniform sampler2D fboPrev;

    // x,y coordinates, given from the vertex shader
    varying vec2 vTexCoord;

    void main() {
      const float trail_length = 0.7;
      vec4 prev = texture2D(fboPrev, vTexCoord);
      prev.a *= trail_length;
      vec4 new = texture2D(fbo, vTexCoord);

      gl_FragColor = mix(prev, new, new.a);

      // test pass through
      // gl_FragColor = texture2D(fboPrev, vTexCoord);

      // gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0);
    }
  `;

  // blur + prev frame trail
  const POST_F_SHADER = `
    precision highp float;

    uniform vec2 canvasSize;
    uniform float time;
    uniform sampler2D fbo;
    uniform int bigBlur;

    // x,y coordinates, given from the vertex shader
    varying vec2 vTexCoord; 

    vec4 blurColor(vec2 uv, vec2 pixelUV)
    {
      vec4 bc = vec4(0.0);

      float weight, totalWeight;
      // const int bigBlur = 1;

      if (bigBlur == 1)
      {
        const float sigma = 5.0;
        const int blurSize = 10;

        for (int i = blurSize * -1; i <= blurSize; i++)
        for (int j = blurSize * -1; j <= blurSize; j++)
        {
          weight = exp(-float(i*i + j*j) / (2.0 * sigma * sigma));

          bc += texture2D(
            fbo, 
            clamp(uv + vec2(float(i), float(j)) * pixelUV, 0.0, 1.0)
          ) * weight;

          totalWeight += weight;
        }
      }
      else
      {
        const float sigma = 0.8;
        const int blurSize = 1;

        for (int i = blurSize * -1; i <= blurSize; i++)
        for (int j = blurSize * -1; j <= blurSize; j++)
        {
          // gaussian 
          weight = exp(-float(i*i + j*j) / (2.0 * sigma * sigma));

          bc += texture2D(
            fbo, 
            clamp(uv + vec2(float(i), float(j)) * pixelUV, 0.0, 1.0)
          ) * weight;

          totalWeight += weight;
        }
      }


      return bc / totalWeight;
    }

    void main() {
      vec2 pixelUV = vec2(1.0) / canvasSize;

      // faded edges
      vec2 e1 = min(
        vTexCoord,
        1.0 - vTexCoord
      );
      float e2 = smoothstep(0.0, 0.025, min(e1.x, e1.y));

      vec4 blurred = blurColor(vTexCoord, pixelUV);
      blurred.a *= e2;

      gl_FragColor = blurred;

      // test pass through
      // gl_FragColor = texture2D(fbo, vTexCoord);
    }
  `;

    function setupShaders()
    {
      STATE.shaders.fade = sk.createShader(GENERIC_V_SHADER, FADE_F_SHADER);

      STATE.shaders.circles = sk.createShader(GENERIC_V_SHADER, CIRCLES_F_SHADER);
      sk.shader(STATE.shaders.circles);
      STATE.shaders.circles.setUniform('white_out', 0.0);
      STATE.shaders.circles.setUniform('red_out', 0.0);

      STATE.shaders.goals = sk.createShader(GENERIC_V_SHADER, GOALS_F_SHADER);

      STATE.shaders.blur = sk.createShader(GENERIC_V_SHADER, POST_F_SHADER);

      STATE.shaders.fbo1 = sk.createFramebuffer({ format: sk.FLOAT });
      STATE.shaders.fbo2 = sk.createFramebuffer({ format: sk.FLOAT });
      STATE.shaders.fbo3 = sk.createFramebuffer({ format: sk.FLOAT });
    }
  }

  //// DOM STUFF ////
  {
    function setupWindow()
    {
      windowResized();

      // disable default scrolling behavior on touch
      sk.canvas.style.touchAction = 'none';

      // bind pause/unpause methods to events
      window.onblur = pause;
      // window.onfocus = unpause;
      // window.onclick = handleClick;

      window.onmousedown = handleMouseDown;
      window.onmouseup = handleMouseUp;

      window.ontouchstart = handleTouchStart;
      window.ontouchend = handleTouchEnd;
    }

    function pause()
    {
      // console.log("pausing")

      // pause shader actions
      sk.shader(STATE.shaders.blur);
      STATE.shaders.blur.setUniform("bigBlur", 1);

      // draw one frame with the updated uniform
      draw();

      STATE.paused = true;
    }

    function unpause()
    {
      console.log("unpausing")

      // unpause shader actions
      sk.shader(STATE.shaders.blur);
      STATE.shaders.blur.setUniform("bigBlur", 0);

      STATE.paused = false;
    }
    
    // on mouse/touch down, start drag potentially and record position
    // on mouse/touch up, 
    function handleMouseDown(e)
    {
      e.preventDefault();
      if (e.target.classList.contains("toy_button")) return;
      if (e.target === sk.canvas)
      {
        // console.log("click ", e.offsetX, " ", e.offsetY);
        if (STATE.paused === false) 
          tryInteractCircle(e.offsetX / sk.width, e.offsetY / sk.height);
        unpause();
      }
      else pause();
    }

    function handleMouseUp(e)
    {
      e.preventDefault();
      if (STATE.paused === true) return;

      tryEndInteraction(e.offsetX / sk.width, e.offsetY / sk.height);
    }

    function handleTouchStart(e)
    {
      e.preventDefault();
      if (e.target.classList.contains("toy_button")) return;
      if (e.target === sk.canvas)
      {
        // console.log("touch ", sk.touches[0].x, " ", sk.touches[0].y);
        if (STATE.paused === false)
        {
          // tryInteractCircle(sk.touches[0].x / sk.width, sk.touches[0].y / sk.height);
          e.changedTouches.forEach(touch => {
            tryInteractCircle(
              (touch.clientX - sk.canvas.offsetLeft) / sk.width, 
              (touch.clientY - sk.canvas.offsetTop) / sk.height
            );
          })
        }
        unpause();
      }
      else pause();
    }

    function handleTouchEnd(e)
    {
      // console.log("touch ended", e, e.changedTouches[0], sk.canvas);
      e.preventDefault();
      if (e.target !== sk.canvas) return;
      if (STATE.paused === true) return;

      e.changedTouches.forEach(touch => {
        tryEndInteraction(
          (touch.clientX - sk.canvas.offsetLeft) / sk.width, 
          (touch.clientY - sk.canvas.offsetTop) / sk.height
        );
      })
    }
  }

  //// CORE P5 METHODS ////
  {
    function windowResized() 
    {
      const newWidth = Math.min(sk.windowWidth * 0.9, sk.windowHeight * 0.9);
      sk.resizeCanvas(newWidth, newWidth, true);

      unpause();
    }

    function setup() 
    {
      // create initial canvas
      const minDim = Math.min(sk.windowWidth, sk.windowHeight);
      renderer = sk.createCanvas(
        minDim, 
        minDim, 
        sk.WEBGL
      );
      // reparent to our customizable div "toy_canvas" and remove the "main" element p5 generates
      /*
      let main = sk.canvas.parentElement;
      renderer.parent('toy_canvas');
      main.remove();
      */

      // set up shaders
      setupShaders();
      setupWindow();
      setupCircles();
      setupFireworks(sk);
    }

    function draw() 
    {
      { // HANDLE PAUSE
        if (renderer.GL === undefined)
        {
          // console.log("No valid WebGL found!")
          return;
        }
        if (STATE.paused) 
        {
          // console.log("paused")
          return;
        }
      }

      
      { // UPDATING
        // state updated at the start of each frame
        STATE.time.delta = sk.deltaTime / 1000.0; // convert ms to sec
        STATE.time.elapsed += STATE.time.delta;

        // update game state
        updateCircles();
        screenFullTick();

        // update shader uniforms
        sk.shader(STATE.shaders.circles);
        STATE.shaders.circles.setUniform('time', STATE.time.elapsed);
        STATE.shaders.circles.setUniform('circle_count', STATE.circles.count);
        STATE.shaders.circles.setUniform('circles', STATE.circles.rendering);

        sk.shader(STATE.shaders.fade);
        STATE.shaders.fade.setUniform('fboPrev', STATE.shaders.fbo3);

        sk.shader(STATE.shaders.blur);
        STATE.shaders.blur.setUniform('canvasSize', [ sk.width, sk.height ]);
        STATE.shaders.blur.setUniform('time', STATE.time.elapsed);

        updateFireworks(sk, STATE.time.delta, STATE.time.elapsed);
      }

      { // DRAWING 
        // draw to buffer
        STATE.shaders.fbo1.begin();
          sk.noStroke();
          sk.clear();

          // circles
          sk.shader(STATE.shaders.circles);
          sk.rect(-sk.width * 0.5, -sk.height * 0.5, sk.width, sk.height);

          // goals
          sk.shader(STATE.shaders.goals);
          sk.rect(-sk.width * 0.5, -sk.height * 0.5, sk.width, sk.height);

          // fireworks
          drawFireworks(sk);
        STATE.shaders.fbo1.end();

        // update and draw trail to second buffer
        sk.shader(STATE.shaders.fade);
        STATE.shaders.fade.setUniform('fbo', STATE.shaders.fbo1);

        STATE.shaders.fbo2.begin();
          sk.noStroke();
          sk.clear();
          sk.rect(-sk.width * 0.5, -sk.height * 0.5, sk.width, sk.height);
        STATE.shaders.fbo2.end();

        // update and draw blur
        sk.shader(STATE.shaders.blur);
        STATE.shaders.blur.setUniform('fbo', STATE.shaders.fbo2);

        sk.clear();
        sk.noStroke();
        sk.rect(-sk.width * 0.5, -sk.height * 0.5, sk.width, sk.height);
      }
      
      { // END OF FRAME CLEAN UP - state updated at the end of each frame

        // swap buffers 2 and 3
        const temp = STATE.shaders.fbo2;
        STATE.shaders.fbo2 = STATE.shaders.fbo3;
        STATE.shaders.fbo3 = temp;
      }
    }
  }

  //// OBJECT PUBLICS ////
  {
    sk.pause = pause;
    sk.unpause = unpause;
    sk.windowResized = windowResized;
    sk.setup = setup;
    sk.draw = draw;
  }
}