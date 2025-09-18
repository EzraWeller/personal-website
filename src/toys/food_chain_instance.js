/*
  A fairly fine grid that draws when we drag around

    - triangles grow vines up and down
    - the longer chain they are part of, the longer they live (exponentially?)

    - circles migrate left and right, reproduce when they make it across
    - circles can cut through vines

    - squares grow out in any direction, if they are close to enough other squares (>half neighbors?)
    - should be calibrated such that they start growing out, 
        but as the center dies, they eventually can't grow more, 
        _unless_ the clump hit another clump of squares
    - squares "life extension" comes from being surrounded by a _medium_ number of other squares: not too many, not too few 
    - vines can grow through clumps of squares, protecting them
    - circles have to go around clumps, slowing them down
*/ 

/*
  Implementation
  - for the grid, we need to:
    - know if a square is clicked on
    - know if / what is in it
    - check what is in neighbor squares
*/

const FOOD_CHAIN = (sk) =>
{
  //// UTILITY ////
  {
    function array_2d_idx(a, b, b_max)
    {
      return a * b_max + b;
    }

    function grid_idx(x, y)
    {
      return array_2d_idx(y, x, GRID_COLUMNS) * 4;
    }

    function safe_grid_content_from_idx(idx)
    {
      return (idx < 0 || idx >= GRID_COLUMNS * GRID_ROWS * 4) ? 
        GRID_CONTENT_TYPE.INVALID : 
        STATE.grid.data.pixels[idx]
      ;
    }

    function safe_grid_content(x, y)
    {
      if (x < 0 || x >= GRID_COLUMNS || y < 0 || y >= GRID_ROWS) 
        return GRID_CONTENT_TYPE.INVALID;
      
      const idx = grid_idx(x, y);
      return safe_grid_content_from_idx(idx);
    }

    function fract(a)
    {
      return a - Math.floor(a);
    }

    function get_grid_loc_x()
    {
      return -sk.width * 0.5 + sk.width * (1.0 - GRID_HORIZ_FRACT);
    }

    function get_grid_loc_y()
    {
      return -sk.height * 0.5;
    }

    function get_not_birth_or_death(idx)
    {
      return STATE.grid.data.pixels[idx + 1] > BIRTH_TICKS + 1 // birth
        && STATE.grid.data.pixels[idx + 1] < LIFETIME_TICKS - DEATH_TICKS - 1 // death
      ; 
    }
  }

  //// CONSTANTS ////
  // grid content types
  const GRID_CONTENT_TYPE = {
    NONE: 0,
    TRIANGLE: 1,
    CIRCLE: 2,
    SQUARE: 3,
    INVALID: 4
  };
  
  const GRID_COLUMNS = 20;
  const GRID_VERTICAL_FRACT = 0.9;
  const GRID_HORIZ_FRACT = 0.87;
  // we assume the canvas is square
  const GRID_ROWS = Math.floor(GRID_COLUMNS * GRID_VERTICAL_FRACT / GRID_HORIZ_FRACT);

  const BIRTH_TICKS = 8;
  const DEATH_TICKS = 16;

  const INT_TICK_LENGTH = 0.04;

  const LIFETIME_TICKS = 255;

  const DRAW_METER_MAX = 10;
  const DRAW_RECOVERY_SPEED = 1.0;

  //// STATE ////
  STATE = 
  {
    grid: {
      // r is content type
      // g is time since being created (always 0 if content is none)
      // b is open to be used in a different way by each shape
      // a must be 255/1 for rendering (dunno why)
      data: sk.createImage(GRID_COLUMNS, GRID_ROWS),
      brush: GRID_CONTENT_TYPE.TRIANGLE,
      last_drawn_xy: -1
    },
    draws_left: DRAW_METER_MAX,
    shaders: {
      grid: {},
      brush: {},
      meter: {},
      brush_selections: [1.0, 0.0, 0.0],
      fade: {},
      blur: {},
      fbo1: {},
      fbo2: {},
      fbo3: {}
    },
    paused: false,
    time: {
      delta: 0.0,
      elapsed: 0.0,
      int_ticks: 0,
      int_tick_this_frame: false,
    }
  };

  //// GRID ////
  {
    function addGridContent(x, y, content)
    {
      if (x > GRID_COLUMNS - 1 || y > GRID_ROWS - 1 || x < 0 || y < 0) return;

      let idx = grid_idx(x, y);

      STATE.grid.data.pixels[idx] = content; // shape
      STATE.grid.data.pixels[idx + 1] = 0; // starting lifetime
      STATE.grid.data.pixels[idx + 2] = 0; // unused
      // needs to be 255 for the shader to work for some reason
      STATE.grid.data.pixels[idx + 3] = 255;

      // starting direction of the circle should be toward the further wall
      switch (content)
      {
        case GRID_CONTENT_TYPE.CIRCLE:
          // for circles, the first bit is the direction it is traveling
          STATE.grid.data.pixels[idx + 2] = (x > GRID_COLUMNS * 0.5) | 0;
          break;

        case GRID_CONTENT_TYPE.SQUARE:
          // start with 0 neighbors and generation 1
          STATE.grid.data.pixels[idx + 2] = 1; // ...0000 (neighbors) 0001 (generation)
          break;

        default:
          break;
      }

      return idx;
    }

    function processUserDrawing()
    {
      if (STATE.draws_left < 1) return;
      /*
       get all mouse down locations and touch locations
      */
      const active_locations = [];
      if (sk.mouseIsPressed)
      {
        active_locations.push([sk.mouseX, sk.mouseY]);
      }
      // handle touches
      if (sk.touches.length > 0)
      {
        console.log(sk.touches);
        sk.touches.forEach(t => {
          active_locations.push([t.x, t.y]);
        })
      }

      if (active_locations.length > 0)
      {
        // handle those active locations
        let l;
        const canvas_x = get_grid_loc_x() + sk.width * 0.5;
        const canvas_y = get_grid_loc_y() + sk.height * 0.5;
        for (let i = 0; i < active_locations.length; i++)
        {
          l = active_locations[i];

          // canvas location to texture index
          //// canvas location to texture location
          l = [ l[0] - canvas_x, l[1] - canvas_y ];
          //// texture location to grid coordinates
          l = [ 
            Math.floor(l[0] / (sk.width * GRID_HORIZ_FRACT) * GRID_COLUMNS), 
            Math.floor(l[1] / (sk.height * GRID_VERTICAL_FRACT) * GRID_ROWS) 
          ];
          //// ensure we don't wrap
          if (
            l[0] > GRID_COLUMNS - 1 ||
            l[1] > GRID_ROWS - 1 ||
            l[0] < 0 || l[1] < 0
          ) continue;

          // don't redraw the same square over and over
          if (
            l[0] === STATE.grid.last_drawn_xy[0]
            && l[1] === STATE.grid.last_drawn_xy[1]
          ) return;

          addGridContent(l[0], l[1], STATE.grid.brush);
          STATE.grid.last_drawn_xy = l;
          STATE.draws_left = Math.max(STATE.draws_left - 1, 0);
        }
      }
    }

    function updateGridLifetimes()
    {
      if (STATE.time.int_tick_this_frame === false) return; 

      let idx;
      for (let x = 0; x < GRID_COLUMNS; x++)
      for (let y = 0; y < GRID_ROWS; y++)
      {
        idx = grid_idx(x, y);
        const not_birth_or_death = get_not_birth_or_death(idx); 

        switch (STATE.grid.data.pixels[idx])
        {
          default:
          case GRID_CONTENT_TYPE.NONE:
            break;
          
          case GRID_CONTENT_TYPE.TRIANGLE:
            const chain_val = Math.min(STATE.grid.data.pixels[idx + 2] / (GRID_ROWS * 0.75), 1.0);

            if (chain_val < 0.95 || !not_birth_or_death) STATE.grid.data.pixels[idx + 1] += 1;
            
            // safely reset chain level for all triangles here
            STATE.grid.data.pixels[idx + 2] = 1;

            break;

          case GRID_CONTENT_TYPE.CIRCLE:
            if (not_birth_or_death)
            {
              STATE.grid.data.pixels[idx + 1] += 1 * ((STATE.time.int_ticks % 2 === 0) | 0);
            }
            else
            {
              STATE.grid.data.pixels[idx + 1] += 1;
            }

            // reset the circles' "turn" so they can "go" next step (first bit of idx + 2 should be 0)
            STATE.grid.data.pixels[idx + 2] &= ~(1 << 1);
            break;

          case GRID_CONTENT_TYPE.SQUARE:
            const generation = STATE.grid.data.pixels[idx + 2] & 15; // 15 is all 0s and four 1s

            if (!not_birth_or_death) 
            {
              STATE.grid.data.pixels[idx + 1] += 1;
            }
            else
            {
              switch (generation)
              {
                default:
                case 1:
                case 2:
                  STATE.grid.data.pixels[idx + 1] += 1;
                  break;

                case 3:
                  STATE.grid.data.pixels[idx + 1] += 1 * ((STATE.time.int_ticks % 64 === 0) | 0);
                  break;
              }
            }
            
            break;
        }

        if (STATE.grid.data.pixels[idx + 1] === LIFETIME_TICKS)
        {
          STATE.grid.data.pixels[idx] = GRID_CONTENT_TYPE.NONE;
        }
      }
    }

    function triangleBehavior(x, y, idx)
    {
      // console.log("triangle behavior");

      // finish finding chain length (from top to bottom)
      // we already found the full chain length at the top of the chains, so we just need to fill those down
        // check upper neighbors for triangles
      const upper_neighbor_idx = [
        grid_idx(x - 1, y - 1),
        grid_idx(x,     y - 1),
        grid_idx(x + 1, y - 1)
      ];
      upper_neighbor_idx.forEach(uidx => {
        // if it's a tri
        if (safe_grid_content_from_idx(uidx) === GRID_CONTENT_TYPE.TRIANGLE)
        {
          // set the current idx to that chain value if higher (handles multiple previous chains)
          STATE.grid.data.pixels[idx + 2] = Math.max(
            STATE.grid.data.pixels[uidx + 2], 
            STATE.grid.data.pixels[idx + 2]
          ); 
          // console.log("final chain value for idx ", idx, STATE.grid.data.pixels[idx + 2]);
        }
      });

      // const lifetime = STATE.grid.data.pixels[idx + 1];

      const not_birth_or_death = get_not_birth_or_death(idx);

      if (
        !not_birth_or_death
        || (STATE.time.int_ticks + idx) % 8 !== 0
      ) return;

      // chance to grow up or down when in this arrangement:
      /*
        0 0 0  or   *
          *       0 0 0
      */
      // (don't grow up or down if a left/right neighbor has already done so, more or less)
      const upper_neighbors = upper_neighbor_idx.map(lidx => { 
        return safe_grid_content_from_idx(lidx);
      });
      const lower_neighbors = [
        safe_grid_content(x - 1, y + 1),
        safe_grid_content(x,     y + 1),
        safe_grid_content(x + 1, y + 1)
      ];
      const options = (((
        (upper_neighbors[0] === GRID_CONTENT_TYPE.NONE || upper_neighbors[0] === GRID_CONTENT_TYPE.SQUARE) &&
        (upper_neighbors[1] === GRID_CONTENT_TYPE.NONE || upper_neighbors[1] === GRID_CONTENT_TYPE.SQUARE) &&
        (upper_neighbors[2] === GRID_CONTENT_TYPE.NONE || upper_neighbors[2] === GRID_CONTENT_TYPE.SQUARE)
      ) | 0) << 1) | ((
        (lower_neighbors[0] === GRID_CONTENT_TYPE.NONE || lower_neighbors[0] === GRID_CONTENT_TYPE.SQUARE) &&
        (lower_neighbors[1] === GRID_CONTENT_TYPE.NONE || lower_neighbors[1] === GRID_CONTENT_TYPE.SQUARE) &&
        (lower_neighbors[2] === GRID_CONTENT_TYPE.NONE || lower_neighbors[2] === GRID_CONTENT_TYPE.SQUARE)
      ) | 0); // this stupid "\ 0" is a hack to tell js to convert to a number

      if (options === 0) return;

      // console.log("options ", options);

      const roll = Math.random();

      const chanceNotToCreate = 0.5;

      if (roll <= chanceNotToCreate) return;

      // give a chance to spawn to the left or right, not only directly above
      x += (Math.random() > 0.95 | 0) * (Math.round(Math.random()) * 2.0 - 1.0);

      switch (options)
      {
        default:
          break;

        case 1: // just bottom
          addGridContent(x, y + 1, GRID_CONTENT_TYPE.TRIANGLE);
          break;

        case 2: // just top
          addGridContent(x, y - 1, GRID_CONTENT_TYPE.TRIANGLE);
          break;

        case 3: // both
          console.log("both case");
          addGridContent(x, y + Math.round(Math.random()) * 2.0 - 1.0, GRID_CONTENT_TYPE.TRIANGLE);
          break;
      }
    }

    // no moving diagonal 
    function circleBehavior(x, y, idx)
    {
      if (STATE.time.int_tick_this_frame === false || STATE.time.int_ticks % 15 !== 0) return;

      const circleWent = (STATE.grid.data.pixels[idx + 2] >> 1) & 1;
      if (circleWent) return; // this is how we indicate a circle already "went" this step

      // shift out the first two bits
      let circleWallClock = STATE.grid.data.pixels[idx + 2] >> 2;

      const circleGoingLeft = (STATE.grid.data.pixels[idx + 2] & 1); // first bit shows if we are going left
      console.log(idx, "going left? ", circleGoingLeft, STATE.grid.data.pixels[idx + 2]);
      const not_birth_or_death = get_not_birth_or_death(idx);
      
      // is circle on goal edge?
      console.log(circleGoingLeft, x);
      const circleOnGoalEdge = (circleGoingLeft && x === 0) || 
        (!circleGoingLeft && x === GRID_COLUMNS - 1);

      // no behavior if birthing/dying
      if (not_birth_or_death === false) return;

      // if it is, check if we should reproduce or switch direction
      if (circleOnGoalEdge)
      {
        console.log("circle on goal edge");
        // tick the wall clock
        circleWallClock += 1;
        STATE.grid.data.pixels[idx + 2] = (circleWallClock << 2) 
          | (0 << 1) // went is always 0 if we got this far
          | circleGoingLeft; // keep this the same for now

        let neighbor_xy = [
          //[x - 1, y - 1], 
          [x - 1, y], 
          //[x - 1, y + 1],
          [x, y - 1], [x, y + 1],
          //[x + 1, y - 1], 
          [x + 1, y], 
          //[x + 1, y + 1]
        ];
        sk.shuffle(neighbor_xy, true);

        // are we ready to reproduce?
        if (circleWallClock === 3)
        {
          console.log("trying to reproduce");
          // nearby empty square?
          let chosen_xy, content;
          let found_xy = false; 
          for (let i = 0; i < neighbor_xy.length - 1; i++)
          {
            content = safe_grid_content(neighbor_xy[i][0], neighbor_xy[i][1]);
            if (content === GRID_CONTENT_TYPE.NONE || content === GRID_CONTENT_TYPE.TRIANGLE)
            {
              chosen_xy = neighbor_xy[i];
              found_xy = true;
              break;
            }
          }
          if (found_xy === true)
          {
            addGridContent(chosen_xy[0], chosen_xy[1], GRID_CONTENT_TYPE.CIRCLE);

            // reset lifetime to new adulthood
            STATE.grid.data.pixels[idx + 1] = BIRTH_TICKS;
          }
        }
        // are we ready to keep going?
        else if (circleWallClock > 4)
        {
          console.log("trying to switch directions");
          // switch direction
          STATE.grid.data.pixels[idx + 2] ^= 1;

          // reset wall clock
          STATE.grid.data.pixels[idx + 2] &= (1 << 1) | 1;
        }

        STATE.grid.data.pixels[idx + 2] |= (1 << 1); // indicate the circle has "gone" this step
      }
      else // we should move!
      {
        console.log("trying to move circle", idx);
        // find empty square to move to
          // put this array in a semi-randomized but prioritized order
        let neighbor_xy;
        if (circleGoingLeft)
        {
          neighbor_xy = [
            [x - 1, y],
            // ...sk.shuffle([[x - 1, y + 1], [x - 1, y - 1]], true),
            ...sk.shuffle([[x, y + 1], [x, y - 1]], true),
            //...sk.shuffle([
              // [x + 1, y + 1], 
            [x + 1, y], 
              // [x + 1, y - 1]
            // ], true)
          ];
        }
        else
        {
          neighbor_xy = [
            [x + 1, y],
            // ...sk.shuffle([[x + 1, y + 1], [x + 1, y - 1]], true),
            ...sk.shuffle([[x, y + 1], [x, y - 1]], true),
            //...sk.shuffle([
              // [x - 1, y + 1], 
            [x - 1, y], 
              // [x - 1, y - 1]
            // ], true)
          ];
        }

        let chosen_xy, content;
        let found_xy = false; 
        for (let i = 0; i < neighbor_xy.length - 1; i++)
        {
          content = safe_grid_content(neighbor_xy[i][0], neighbor_xy[i][1]);
          console.log("content ", neighbor_xy[i], content);
          console.log("idx ", grid_idx(neighbor_xy[i][0], neighbor_xy[i][1]));
          if (content === GRID_CONTENT_TYPE.NONE || content === GRID_CONTENT_TYPE.TRIANGLE)
          {
            chosen_xy = neighbor_xy[i];
            found_xy = true;
            break;
          }
        }

        console.log("moving to ", chosen_xy);

        // move there
        if (found_xy === true)
        {
          const new_idx = grid_idx(chosen_xy[0], chosen_xy[1]);
          STATE.grid.data.pixels[new_idx] = STATE.grid.data.pixels[idx];
          STATE.grid.data.pixels[new_idx + 1] = STATE.grid.data.pixels[idx + 1];
          STATE.grid.data.pixels[new_idx + 2] = STATE.grid.data.pixels[idx + 2] | 1 << 1; // mark the circle having "gone"
          STATE.grid.data.pixels[new_idx + 3] = STATE.grid.data.pixels[idx + 3];

          // empty the previous grid pixel
          STATE.grid.data.pixels[idx] = GRID_CONTENT_TYPE.NONE;
          STATE.grid.data.pixels[idx + 1] = 0;
          STATE.grid.data.pixels[idx + 2] = 0;
          STATE.grid.data.pixels[idx + 3] = 0;
        }
      }
    }

    // reproduce 3 times, then stop and the last one lives extra long?
    // when we stop, record the number of neighbors
    // then, if the number of neighbors increases after that, we reset lifespan and reproduction to allow it again
    // so we need to store 1) number of neighbors and 2) reproductions left
    function squareBehavior(x, y, idx)
    {
      // behavior frequency
      if (STATE.time.int_tick_this_frame === false) return;

      const not_birth_or_death = get_not_birth_or_death(idx);

      if (
        !not_birth_or_death
        || (STATE.time.int_ticks) % 32 !== 0 // behavior rate
      ) return;

      // get generation
      let generation = STATE.grid.data.pixels[idx + 2] & 15; // 15 is all 0s and four 1s
      console.log("generation ", generation);

      // get neighbor info
      const prev_sq_neighbors = STATE.grid.data.pixels[idx + 2] >> 4;
      const neighbor_xy = [
        [x - 1, y - 1],
        [x - 1, y],
        [x - 1, y + 1],
        [x, y - 1],
        [x, y + 1],
        [x + 1, y - 1],
        [x + 1, y],
        [x + 1, y + 1],
      ];
      let open_neighbors = [];
      let square_neighbors = 0;
      let content;
      neighbor_xy.forEach(xy => {
        content = safe_grid_content(xy[0], xy[1]);
        if (
          content === GRID_CONTENT_TYPE.NONE
          || content === GRID_CONTENT_TYPE.CIRCLE
        )
        {
          open_neighbors.push(xy);
        }
        else if (content === GRID_CONTENT_TYPE.SQUARE) square_neighbors++;
      });

      // allow growth again if we are gen 3 and neighbors have increased
      if (
        generation === 3 
        && prev_sq_neighbors + 1 < square_neighbors 
        && prev_sq_neighbors > 0 // disallow newly created squares w/out cached neighbors
      )
      {
        console.log("resetting growth ", generation, prev_sq_neighbors, square_neighbors);
        
        // set back to gen 1
        STATE.grid.data.pixels[idx + 2] = (square_neighbors << 4) | 2;

        // reset liftime
        STATE.grid.data.pixels[idx + 1] = BIRTH_TICKS + 1;

        // return early
        return;
      }

      // do reproductions
      if (generation < 3 && open_neighbors.length > 2)
      {
        sk.shuffle(open_neighbors, true);

        let nidx = addGridContent(open_neighbors[0][0], open_neighbors[0][1], GRID_CONTENT_TYPE.SQUARE);
        // start with 0 neighbors and next generation
        STATE.grid.data.pixels[nidx + 2] = generation + 1; // ...0000 (neighbors) 0001 (generation)

        nidx = addGridContent(open_neighbors[1][0], open_neighbors[1][1], GRID_CONTENT_TYPE.SQUARE);
        STATE.grid.data.pixels[nidx + 2] = generation + 1;

        nidx = addGridContent(open_neighbors[2][0], open_neighbors[2][1], GRID_CONTENT_TYPE.SQUARE);
        STATE.grid.data.pixels[nidx + 2] = generation + 1;

        // add more neighbors we've just created
        square_neighbors += 3;

        // set to unused generation number
        generation = 4;
      }

      // record neighbor number AFTER reproductions
      STATE.grid.data.pixels[idx + 2] = (square_neighbors << 4) | generation;
    }

    function doGridAbilities()
    {
      if (STATE.time.int_tick_this_frame === false) return; 

      let idx;
      for (let x = 0; x < GRID_COLUMNS; x++)
      for (let y = 0; y < GRID_ROWS; y++)
      {
        idx = grid_idx(x, y);
        switch (STATE.grid.data.pixels[idx])
        {
          default:
          case GRID_CONTENT_TYPE.NONE:
            break;
          
          case GRID_CONTENT_TYPE.TRIANGLE:
            triangleBehavior(x, y, idx);
            break;

          case GRID_CONTENT_TYPE.CIRCLE:
            circleBehavior(x, y, idx);
            break;

          case GRID_CONTENT_TYPE.SQUARE:
            squareBehavior(x, y, idx);
            break;
        }
      }
    }

    // find chain length bottom to top 
    // -- has real chain length only at top of chain
    // -- we iterate again top to bottom to fill these lengths back down the chain
    function startChainLength(idx, x, y)
    {
      // start by assuming length of 1 -- not needed because we are resetting on a safer step
      // STATE.grid.data.pixels[idx + 2] = 1;
      // check lower neighbors for triangles
      const lower_neighbor_idx = [
        grid_idx(x - 1, y + 1),
        grid_idx(x,     y + 1),
        grid_idx(x + 1, y + 1)
      ];
      lower_neighbor_idx.forEach(lidx => {
        // if it's a tri
        if (safe_grid_content_from_idx(lidx) === GRID_CONTENT_TYPE.TRIANGLE)
        {
          // increase it's chain value by 1
          STATE.grid.data.pixels[lidx + 2] += 1;
          // set the current idx to that chain value if higher (handles multiple previous chains)
          STATE.grid.data.pixels[idx + 2] = Math.max(
            STATE.grid.data.pixels[lidx + 2], 
            STATE.grid.data.pixels[idx + 2]
          );
        }
      });
      // console.log("initial chain level for ", idx, STATE.grid.data.pixels[idx + 2]);
    }

    function doBottomTopGridProcesses()
    {
      if (STATE.time.int_tick_this_frame === false) return; 

      for (let x = GRID_COLUMNS - 1; x >= 0; x--)
      for (let y = GRID_ROWS - 1; y >= 0; y--)
      {
        idx = grid_idx(x, y);
        switch (STATE.grid.data.pixels[idx])
        {
          default:
          case GRID_CONTENT_TYPE.NONE:
            break;
          
          case GRID_CONTENT_TYPE.TRIANGLE:
            startChainLength(idx, x, y);
            break;

          case GRID_CONTENT_TYPE.CIRCLE:
          case GRID_CONTENT_TYPE.SQUARE:
            break;
        }
      }
    }
    
    function updateGrid()
    {
      processUserDrawing();

      doBottomTopGridProcesses();

      doGridAbilities();

      updateGridLifetimes();

      STATE.grid.data.updatePixels();
    }
  }

  //// METER ////
  {
    function updateMeter()
    {
      // no regen while holding down
      if (sk.mouseIsPressed || sk.touches.length > 0) return;

      STATE.draws_left = Math.min(
        STATE.draws_left + STATE.time.delta * DRAW_RECOVERY_SPEED,
        DRAW_METER_MAX
      );
    }
  }

  //// GOALS ////
  {
    
  }

  //// BRUSHES ////
  {
    function getBrushInfo()
    {
      const res = {
        side: sk.width * (1.0 - GRID_HORIZ_FRACT),
        x: sk.width * -0.5,
        y_padding: sk.height * GRID_VERTICAL_FRACT * 0.1
      };
      res.y_start = sk.height * -0.5 + res.y_padding;
      return res;
    }

    function tryBrushSwitch(location)
    {
      console.log("trying brush switch at ", location);
      let { side, x, y_padding, y_start }  = getBrushInfo();
      y = y_start;

      // adjust to "mouse space" instead of "render space" (thanks p5)
      x += sk.width * 0.5;
      y += sk.height * 0.5;

      for (let i = 1; i < 4; i++)
      {
        console.log("checking ", x, " ", y);

        if (
          location[0] >= x &&
          location[0] <= x + side &&
          location[1] >= y &&
          location[1] <= y + side
        )
        {
          STATE.grid.brush = i;
          console.log("swapped to ", i);
          return;
        }

        y += (side + y_padding);
      }
    }

    function updateBrushSelection()
    {
      const update_amt = 7.0 * STATE.time.delta;
      switch (STATE.grid.brush)
      {
        default:
        case GRID_CONTENT_TYPE.NONE:
          STATE.shaders.brush_selections = [
            Math.max(STATE.shaders.brush_selections[0] - update_amt, 0.0),
            Math.max(STATE.shaders.brush_selections[1] - update_amt, 0.0),
            Math.max(STATE.shaders.brush_selections[2] - update_amt, 0.0)
          ];
          break;

        case GRID_CONTENT_TYPE.TRIANGLE:
          STATE.shaders.brush_selections = [
            Math.min(STATE.shaders.brush_selections[0] + update_amt, 1.0),
            Math.max(STATE.shaders.brush_selections[1] - update_amt, 0.0),
            Math.max(STATE.shaders.brush_selections[2] - update_amt, 0.0)
          ];
          break;

        case GRID_CONTENT_TYPE.CIRCLE:
          STATE.shaders.brush_selections = [
            Math.max(STATE.shaders.brush_selections[0] - update_amt, 0.0),
            Math.min(STATE.shaders.brush_selections[1] + update_amt, 1.0),
            Math.max(STATE.shaders.brush_selections[2] - update_amt, 0.0)
          ];
          break;

        case GRID_CONTENT_TYPE.SQUARE:
          STATE.shaders.brush_selections = [
            Math.max(STATE.shaders.brush_selections[0] - update_amt, 0.0),
            Math.max(STATE.shaders.brush_selections[1] - update_amt, 0.0),
            Math.min(STATE.shaders.brush_selections[2] + update_amt, 1.0)
          ];
          break;
      }
    }

    function drawBrushes()
    {
      const { side, x, y_padding, y_start }  = getBrushInfo();

      sk.shader(STATE.shaders.brush);

      for (let i = 0.0; i < 3.0; i++)
      {
        STATE.shaders.brush.setUniform("shape", i + 1.0);
        sk.rect(
          x, 
          y_start + (side + y_padding) * i, 
          side, 
          side
        );
      }
    }
  }

  function drawMeter()
  {
    const padding_fract = (1.0 - GRID_VERTICAL_FRACT) * 0.35;
    const topLeft = [-sk.width * 0.5, -sk.height * 0.5];
    sk.shader(STATE.shaders.meter);
    sk.rect(
      topLeft[0] + sk.width * padding_fract,
      topLeft[0] + sk.height * (GRID_VERTICAL_FRACT + padding_fract),
      sk.width * (1.0 - (padding_fract * 2.0)),
      sk.height * (1.0 - GRID_VERTICAL_FRACT - padding_fract * 2.0)
    );
  }

  //// SHADERS ////
  {
    const GRID_F_SHADER = `
      precision highp float;

      uniform float grid_columns;
      uniform float grid_rows;
      uniform sampler2D grid_data;
      uniform float time;

      const float birth_time =`+ sk.str(BIRTH_TICKS) +`.0;
      const float inv_birth_time = 1.0 / birth_time;
      const float death_time =`+ sk.str(DEATH_TICKS) +`.0;
      const float death_ticks =`+ sk.str(LIFETIME_TICKS) +`.0;

      // x,y coordinates, given from the vertex shader
      varying vec2 vTexCoord;

    ` + SHADER_LIB + `

      // r is the content type
      // g is the content lifetime
      // b,a are the grid square uv
      vec4 uv_to_content_and_local_uv(vec2 uv)
      {
        float x = uv.x * grid_columns;
        float y = uv.y * grid_rows;

        // clamp uv to the center of a grid square to avoid texture upscaling magic smoothing
        uv.x = floor(x) / grid_columns + 1.0 / grid_columns * 0.5;
        uv.y = floor(y) / grid_rows + 1.0 / grid_rows * 0.5;
        vec4 res = texture2D(grid_data, uv);
        res.b = fract(x);
        res.a = fract(y);

        return res;
      }

      float sdf_to_alpha(float sdf)
      {
        return float(sdf <= 0.0);
      }

      vec4 shape_color(vec4 info)
      {
        const vec2 uv_center = vec2(0.5, 0.5);

        // convert back from 0.0-1.0 to 0,1,2,3, etc.
        vec2 shape_time = info.rg * 255.0;

        vec4 color;

        float scale_mod = min(shape_time.y, birth_time) * inv_birth_time;
        scale_mod *= clamp((death_ticks - shape_time.y) / death_time, 0.0, 1.0);

        // grid lines
        float d = min(
          info.a,
          1.0 - info.b
        );
        color = vec4(0.8, 0.8, 0.0, smoothstep(0.15, 0.0, d));

        

        float a;
        if (shape_time.x == 0.0){}
        else if (shape_time.x == 1.0) // triangle
        {
          // wiggles
          float angle = sin(PI * time * 2.0) * PI * 0.15;
          angle *= angle * (float(angle > 0.0) * 2.0 - 1.0);
          info.ba = rotate_vec2_around_center(info.ba, angle);

          a = sdf_to_alpha(sdf_triangle(uv_center, 1.0 - info.ba, 0.85 * scale_mod));
          if (a > 0.0)
          {
            color = vec4(0.0, 1.0, 0.0, a);
          }
        }
        else if (shape_time.x == 2.0) // circle
        {
          // squish
          const float squish_amount = 0.2;
          float squish = sin(PI * fract(time)) * squish_amount + 1.0;
          info.a = (info.a - 0.5) * squish + 0.5;
          squish = squish = sin(PI * fract(time + 0.5)) * squish_amount + 1.0;
          info.b = (info.b - 0.5) * squish + 0.5;

          a = sdf_to_alpha(sdf_circle_sq(uv_center, info.ba, 0.35 * scale_mod));
          if (a > 0.0)
          {
            color = vec4(0.0, 0.0, 1.0, a);
          }
        }
        else if (shape_time.x == 3.0) // square
        {
          // slow rotation
          float angle = mod_float(time * 0.667, PI * 2.0);
          info.ba = rotate_vec2_around_center(info.ba, angle);

          a = sdf_to_alpha(sdf_square(uv_center, info.ba, 0.6 * scale_mod));
          if (a > 0.0)
          {
            color = vec4(1.0, 0.0, 0.0, a);
          }
        }

        // color.a = float(color.a <= 0.0);

        return color;
      }

      void main()
      {
        vec4 info = uv_to_content_and_local_uv(vTexCoord);

        gl_FragColor = shape_color(info);
      }
    `;

    const BRUSH_F_SHADER = `
      precision highp float;

      uniform float time;
      uniform float shape;
      uniform float selected[3];

      // x,y coordinates, given from the vertex shader
      varying vec2 vTexCoord;

      const vec2 uv_origin = vec2(0.5, 0.5);

    ` + SHADER_LIB + `

      float sdf_to_alpha(float sdf)
      {
        return float(sdf <= 0.0);
      }

      float sdf_to_alpha_selected(float sdf)
      {
        return float(sdf <= -0.1);
      }

      vec4 shape_color()
      {
        float sdf, selected_a;
        vec4 res;

        if (shape == 0.0) {}
        else if (shape == 1.0) selected_a = selected[0];
        else if (shape == 2.0) selected_a = selected[1];
        else if (shape == 3.0) selected_a = selected[2];

        float scale_factor = 1.0 + 0.333 * selected_a;
        float color_factor = 0.5 * (1.0 - selected_a);

        if (shape == 0.0) {}
        else if (shape == 1.0)
        {
          sdf = sdf_triangle(uv_origin, 1.0 - vTexCoord, 0.6 * scale_factor);
          res.rgb = vec3(color_factor, 1.0 * (1.0 - color_factor), color_factor);
        }
        else if (shape == 2.0)
        {
          sdf = sdf_circle_sq(uv_origin, vTexCoord, 0.25 * scale_factor);
          res.rgb = vec3(color_factor, color_factor, 1.0 * (1.0 - color_factor));
        }
        else if (shape == 3.0)
        {
          sdf = sdf_square(uv_origin, vTexCoord, 0.45 * scale_factor);
          res.rgb = vec3(1.0 * (1.0 - color_factor), color_factor, color_factor);
        }

        float alpha_factor = 0.667 + 0.333 * selected_a;
        res.a = sdf_to_alpha(sdf) * alpha_factor;

        return res;
      }

      void main()
      {
        gl_FragColor = shape_color();
      }
    `;

    // do something where we show how many individual objects can be drawn
    const METER_F_SHADER = `
      precision highp float;

      uniform float time;
      uniform float count;
      const float max_count = ` + sk.str(DRAW_METER_MAX) +`.0; // for lines

      // x,y coordinates, given from the vertex shader
      varying vec2 vTexCoord;

      float get_meter_alpha()
      {
        const float border_thickness = 0.1;

        if (
          1.0 - vTexCoord.y < border_thickness 
          || vTexCoord.y < border_thickness
          || vTexCoord.x > count / max_count
        )
        {
          return 0.0;
        }
        return 1.0;
      }

      float get_line_alpha()
      {
        float stride = 1.0 / max_count;

        float min = 2.0;
        float current;
        for (float i = 1.0; i < max_count; i++)
        {
          current = abs(vTexCoord.x - stride * i);
          if (current < min) min = current;
        }

        return min < 0.005 ? 1.0 : 0.0;
      }

      void main()
      {
        float meter_alpha = get_meter_alpha();
        float line_alpha = get_line_alpha();

        gl_FragColor = mix(
          mix(
            vec4(0.9, 0.9, 0.9, 1.0),
            vec4(0.2, 0.2, 0.2, 1.0),
            meter_alpha
          ),
          vec4(1.0, 1.0, 1.0, 1.0),
          line_alpha
        );
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
        const float trail_length = 0.8;
        vec4 prev = texture2D(fboPrev, vTexCoord);
        prev.a *= trail_length;
        vec4 new = texture2D(fbo, vTexCoord);

        gl_FragColor = mix(prev, new, new.a);
      }
    `;

    // blur
    const BLUR_F_SHADER = `
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
          const float sigma = 0.7;
          const int blurSize = 2;

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
        /*
        vec2 e1 = min(
          vTexCoord,
          1.0 - vTexCoord
        );
        float e2 = smoothstep(0.0, 0.005, min(e1.x, e1.y));
        */

        vec4 blurred = blurColor(vTexCoord, pixelUV);
        // blurred.a *= e2;

        gl_FragColor = blurred;
      }
    `;

    function setupShaders()
    {
      STATE.shaders.grid = sk.createShader(GENERIC_V_SHADER, GRID_F_SHADER);
      sk.shader(STATE.shaders.grid);
      STATE.shaders.grid.setUniform("grid_columns", GRID_COLUMNS);
      STATE.shaders.grid.setUniform("grid_rows", GRID_ROWS);
      STATE.grid.data.loadPixels(); // we just keep these loaded all the time

      STATE.shaders.brush = sk.createShader(GENERIC_V_SHADER, BRUSH_F_SHADER);
      STATE.shaders.meter = sk.createShader(GENERIC_V_SHADER, METER_F_SHADER);
      STATE.shaders.fade = sk.createShader(GENERIC_V_SHADER, FADE_F_SHADER);
      STATE.shaders.blur = sk.createShader(GENERIC_V_SHADER, BLUR_F_SHADER);

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
      console.log("pausing")

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
      console.log("handle mouse down");
      if (e.target.classList.contains("toy_button")) return;
      if (e.target === sk.canvas)
      {
        e.preventDefault();

        if (STATE.paused === false) 
        {
          // tryInteractCircle(e.offsetX / sk.width, e.offsetY / sk.height);
          tryBrushSwitch([e.offsetX, e.offsetY]);
        }
        unpause();
      }
      else 
      {
        pause();
        console.log("didn't target canvas");
      }
    }

    function handleMouseUp(e)
    {
      e.preventDefault();

      // tryEndInteraction(e.offsetX / sk.width, e.offsetY / sk.height);
    }

    function handleTouchStart(e)
    {
      if (e.target.classList.contains("toy_button")) return;
      if (e.target === sk.canvas)
      {
        e.preventDefault();
        
        if (STATE.paused === false)
        {
          e.touches.forEach((touch, idx) => {
            /*
            tryInteractCircle(
              (touch.pageX - sk.canvas.offsetLeft) / sk.width, 
              (touch.pageY - sk.canvas.offsetTop) / sk.height,
              idx
            );
            */
            tryBrushSwitch([
              touch.pageX - sk.canvas.offsetLeft, 
              touch.pageY - sk.canvas.offsetTop
            ]);
          });
        }
        unpause();
      }
      else pause();
    }

    function handleTouchEnd(e)
    {
      if (e.target !== sk.canvas) return;
      
      e.changedTouches.forEach(touch => {
        /*
        tryEndInteraction(
          (touch.pageX - sk.canvas.offsetLeft) / sk.width, 
          (touch.pageY - sk.canvas.offsetTop) / sk.height
        );
        */
      });
      
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

      // set up shaders
      setupShaders();
      setupWindow();
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
        if (STATE.time.elapsed / INT_TICK_LENGTH > STATE.time.int_ticks)
        {
          STATE.time.int_ticks += 1;
          STATE.time.int_tick_this_frame = true;
        }
        else
        {
          STATE.time.int_tick_this_frame = false;
        }

        // update game state
        updateGrid();
        updateMeter();
        updateBrushSelection();

        // update shader uniforms
        sk.shader(STATE.shaders.grid);
        STATE.shaders.grid.setUniform("grid_data", STATE.grid.data);
        STATE.shaders.grid.setUniform("time", STATE.time.elapsed);

        sk.shader(STATE.shaders.brush);
        STATE.shaders.brush.setUniform("time", STATE.time.elapsed);
        STATE.shaders.brush.setUniform("selected", STATE.shaders.brush_selections);

        sk.shader(STATE.shaders.meter);
        STATE.shaders.meter.setUniform("time", STATE.time.elapsed);
        STATE.shaders.meter.setUniform("count", STATE.draws_left);

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
          sk.clear();
          sk.noStroke();

          drawBrushes();

          drawMeter();

          // draw grid
          sk.shader(STATE.shaders.grid);
          sk.rect(
            get_grid_loc_x(), 
            get_grid_loc_y(), 
            sk.width * GRID_HORIZ_FRACT, 
            sk.height * GRID_VERTICAL_FRACT
          );

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

        // draw final rect
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