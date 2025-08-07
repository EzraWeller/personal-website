const COLLECTING_RAIN = (sk) => 
{
  //// constants and "types" ////
  const EXPECTED_WIDTH = 200.;
  const EXPECTED_HEIGHT = 200.;

  const BOTTOM_STRIP_HEIGHT = 40.;

  // shape types
  const RAINDROP = 0;
  const DIAMOND = 1;
  const STAR = 2;
  const HEART = 3;
  const BUCKET = 4;
  const GOAL = 5;

  // vectors that define an axis aligned box used for collision
  // x and y are half-width and half-height
  const AABB_DIMS_RAINDROP = {x: 0.5, y: 0.5};
  const AABB_DIMS_DIAMOND = {x: 0.5, y: 0.5};
  const AABB_DIMS_STAR = {x: 0.5, y: 0.5};
  const AABB_DIMS_HEART = {x: 0.5, y: 0.5};
  const AABB_DIMS_BUCKET = {x: 0.5, y: 0.5};

  const RAINDROP_COLOR = [ 0.0, 0.0, 1.0, 1.0 ];
  const DIAMOND_COLOR = [ 1.0, 0.0, 0.0, 1.0 ];
  const STAR_COLOR = [ 1.0, 0.85, 0.0, 1.0 ];
  const HEART_COLOR = [ 0.4, 0.4, 0.4, 1.0 ];
  const BUCKET_BG_COLOR = [ 0.1, 0.1, 0.1, 1.0 ];
  const HEART_BUCKET_BG_COLOR = [ 1.0, 0.6, 0.8, 1.0 ];

  const SHAPE_VELOCITY = { min: 0.02, max: 0.04 };
  const FALLING_SHAPE_SCALE = 36.;
  const FALLING_SHAPE_DRAG_SCALE_COEF = 1.2;

  // bucket constants
  const BASE_BUCKET_SCALE = 19.;
  const MAX_BUCKET_SCALE = 30.;
  const MIN_BUCKET_SCALE = 15.;
  const BUCKET_X = 20.;
  const BUCKET_COUNT = 4;

  const BUCKET_GROWTH_RATE = 3.2;
  const BUCKET_SHRINK_RATE = -1.6;

  const BUCKET_UNLOCK_ALPHA = 0.75;
  const BUCKET_LOCK_ALPHA = 0.1;
  const BUCKET_UNLOCK_SCALE = MIN_BUCKET_SCALE * (1 - BUCKET_UNLOCK_ALPHA) + 
      MAX_BUCKET_SCALE * BUCKET_UNLOCK_ALPHA;
  const BUCKET_LOCK_SCALE = MIN_BUCKET_SCALE * (1 - BUCKET_LOCK_ALPHA) + 
    MAX_BUCKET_SCALE * BUCKET_LOCK_ALPHA;

  // timer constants
  const SHAPE_SPAWN_TIME = { min: 1.6, max: 0.12 };
  const INITIAL_SHAPE_SPAWN_TIME = SHAPE_SPAWN_TIME.min;
  const INITIAL_BUCKET_SHRINK_TIME = 2.5;

  // Goal appearance -- each goal wil have a frame plus a small image inside it
  // the frame has two modes: unachieved and achieved

  // goal types
  const GOAL_RAIN_DIAMONDS = 0;
  const GOAL_ALL_FOUR = 1;
  const GOAL_RAIN_HEARTS = 2;
  const GOAL_ONLY_STARS = 3;
  const GOAL_ALL_FOUR_BIG = 4;
  const GOAL_TYPES = [
    GOAL_RAIN_DIAMONDS,
    GOAL_ALL_FOUR,
    GOAL_RAIN_HEARTS,
    GOAL_ONLY_STARS,
    GOAL_ALL_FOUR_BIG
  ];
  const GOAL_SCALE = 34.;

  const UNACHIEVED_GOAL_COLOR = [ 0.75, 0.75, 0.75, 0.9 ];
  const ACHIEVED_GOAL_COLOR = [ 0.0, 1.0, 0.0, 1.0 ];

  const MORPH_EPSILON = 0.0001;

  const MorphableShapeProps = {
    position: {},
    scale: 1.,
    rotation: 0
  };

  const Shape = {
    ...MorphableShapeProps,
    velocity: {},
    beingDragged: false,
    seed: 0.0
  };

  const ShapeMorphable = {
    ...Shape,
    morphTo: { ...MorphableShapeProps }
  };

  const BucketShape = {
    ...ShapeMorphable,
    active: false
  };

  const GoalShape = {
    ...ShapeMorphable,
    type: GOAL_RAIN_DIAMONDS,
    achieved: false
  };

  function newShapeArrays()
  {
    return {
      positions: [],
      velocities: [],
      scales: [],
      rotations: [],
      beingDragged: [],
      seed: []
    };
  };

  function newMorphableShapeArrays()
  {
    const sa = newShapeArrays();
    const morphs = newShapeArrays();
    return {
      ...sa,
      morphTos: { ...morphs }
    };
  }

  //// state ////
  STATE = {
    setup: {
      baseVertsRaindrop: [],
      baseVertsDiamond: [],
      baseVertsStar: [],
      baseVertsHeart: [],
      baseVertsBucket: [],
      baseVertsGoalFrame: []
    },
    shapes: {
      raindrops: newMorphableShapeArrays(),
      diamonds: newMorphableShapeArrays(),
      stars: newMorphableShapeArrays(),
      hearts: newMorphableShapeArrays(),

      bucketRain: { ...BucketShape, type: RAINDROP },
      bucketDiamond: { ...BucketShape, type: DIAMOND },
      bucketStar: { ...BucketShape, type: STAR },
      bucketHeart: { ...BucketShape, type: HEART },

      goals: [],
    },
    game: {
      shapeSpawnPointCount: 2,
      lastShapeTypeIdx: 0,
      lastShapeSpawnPointIdx: 0,
      shapeSpawnTime: INITIAL_SHAPE_SPAWN_TIME,
      lastShapeSpawnTime: -INITIAL_SHAPE_SPAWN_TIME,
      shapeBaseVelocity: SHAPE_VELOCITY.min,
      bucketShrinkTime: INITIAL_BUCKET_SHRINK_TIME,
      lastBucketShrink: 0
    },
    input: {
      mouseWasPressed: false,
      previousTouches: []
    },
    timeElapsed: 0.0,
    paused: false,
    shaders: {
      baseShape: {},
      postProcess1: {},
      postProcess2: {},
      fbo1: {},
      fbo2: {},
      fbo2Prev: {}
    }
  }

  function getRealPositionInPlace(outPos, inPos, realSizeScalar)
  {
    outPos.x = inPos.x * realSizeScalar - sk.width * 0.5;
    outPos.y = inPos.y * realSizeScalar - sk.width * 0.5;
  }

  //// setup methods ////
  // vert generation
  function appendBezierVertices(vertices = [], a1, c1, c2, a2, resolution = 10) {
    const inverseResolution = 1. / resolution;
    for (let t = inverseResolution; t <= 1; t += inverseResolution) {
      vertices.push(
        addVector2DInPlace(
          mulVector2D(sk, a1, Math.pow(1 - t, 3)),
          addVector2DInPlace(
            mulVector2D(sk, c1, 3 * Math.pow(1 - t, 2) * t),
            addVector2DInPlace(
              mulVector2D(sk, c2, 3 * (1 - t) * t * t),
              mulVector2D(sk, a2, Math.pow(t, 3))
            )
          )
        )
      );
    }
  }

  function circleVertices(vertices = [], c, r, resolution = 10) {
    const inverseResolution = 1. / resolution;
    for (let t = 0; t < sk.TWO_PI; t += inverseResolution) {
      vertices.push(
        sk.createVector(
          c.x + r * sk.cos(t),
          c.y + r * sk.sin(t)
        )
      );
    }
  }

  // base verts should always for a shape with somewhere close to 1 u^2 area
  function makeBaseRaindropVerts()
  {
    const raindrop_anchor1 = sk.createVector(0, -0.75);
    const raindrop_anchor2 = sk.createVector(-0.25, 0);
    const raindrop_anchor3 = sk.createVector(0.25, 0);

    const raindrop_control1_1 = sk.createVector(0, -0.25);
    const raindrop_control1_2 = sk.createVector(-0.25, -0.25);
    const raindrop_control2_1 = sk.createVector(-0.25, 0.35);
    const raindrop_control2_2 = sk.createVector(0.25, 0.35);
    const raindrop_control3_1 = sk.createVector(0.25, -0.25);
    const raindrop_control3_2 = sk.createVector(0, -0.25);

    // STATE.setup.baseVertsRaindrop.push(raindrop_anchor1);
    appendBezierVertices(
      STATE.setup.baseVertsRaindrop, 
      raindrop_anchor1,
      raindrop_control1_1,
      raindrop_control1_2,
      raindrop_anchor2,
      7
    );
    appendBezierVertices(
      STATE.setup.baseVertsRaindrop, 
      raindrop_anchor2,
      raindrop_control2_1,
      raindrop_control2_2,
      raindrop_anchor3,
      12
    );
    appendBezierVertices(
      STATE.setup.baseVertsRaindrop, 
      raindrop_anchor3,
      raindrop_control3_1,
      raindrop_control3_2,
      raindrop_anchor1,
      7
    );
  }

  function makeBaseDiamondVerts()
  {
    const diamond_anchor1 = sk.createVector(0, 0.5);
    const diamond_anchor2 = sk.createVector(-0.333, 0.0);
    const diamond_anchor3 = sk.createVector(0.0, -0.5);
    const diamond_anchor4 = sk.createVector(0.333, 0.0);
    STATE.setup.baseVertsDiamond = STATE.setup.baseVertsDiamond.concat([
      diamond_anchor1,
      lerpVector2D(sk, diamond_anchor1, diamond_anchor2, 0.333),
      lerpVector2D(sk, diamond_anchor1, diamond_anchor2, 0.667),
      diamond_anchor2,
      lerpVector2D(sk, diamond_anchor2, diamond_anchor3, 0.333),
      lerpVector2D(sk, diamond_anchor2, diamond_anchor3, 0.667),
      diamond_anchor3,
      lerpVector2D(sk, diamond_anchor3, diamond_anchor4, 0.333),
      lerpVector2D(sk, diamond_anchor3, diamond_anchor4, 0.667),
      diamond_anchor4,
      lerpVector2D(sk, diamond_anchor4, diamond_anchor1, 0.333),
      lerpVector2D(sk, diamond_anchor4, diamond_anchor1, 0.667),
    ]);
  }

  function makeBaseStarVerts()
  {
    const fifth_rot = sk.TWO_PI / 5.0;
    const star_anchor1 = sk.createVector(0, -0.5);
    const star_anchor2 = mulVector2DInPlace(rotateVector2DAroundOrigin(sk, star_anchor1, fifth_rot / 2), 0.5);
    const star_anchor3 = rotateVector2DAroundOrigin(sk, star_anchor1, fifth_rot);
    const star_anchor4 = rotateVector2DAroundOrigin(sk, star_anchor2, fifth_rot);
    const star_anchor5 = rotateVector2DAroundOrigin(sk, star_anchor3, fifth_rot);
    const star_anchor6 = rotateVector2DAroundOrigin(sk, star_anchor4, fifth_rot);
    const star_anchor7 = rotateVector2DAroundOrigin(sk, star_anchor5, fifth_rot);
    const star_anchor8 = rotateVector2DAroundOrigin(sk, star_anchor6, fifth_rot);
    const star_anchor9 = rotateVector2DAroundOrigin(sk, star_anchor7, fifth_rot);
    const star_anchor10 = rotateVector2DAroundOrigin(sk, star_anchor8, fifth_rot);

    STATE.setup.baseVertsStar = STATE.setup.baseVertsStar.concat([
      star_anchor1,
      star_anchor2,
      star_anchor3,
      star_anchor4,
      star_anchor5,
      star_anchor6,
      star_anchor7,
      star_anchor8,
      star_anchor9,
      star_anchor10
    ]);
  }

  function makeBaseHeartVerts()
  {
    const heart_anchor1 = sk.createVector(0.0, -0.1);
    const heart_control1_1 = sk.createVector(0, -0.4);
    const heart_control1_2 = sk.createVector(-0.5, -0.33);

    const heart_anchor2 = sk.createVector(-0.4, 0);
    const heart_control2_1 = sk.createVector(-0.1, 0.55);
    const heart_control2_2 = sk.createVector(-0.35, 0);

    const heart_anchor3 = sk.createVector(0, 0.55);
    const heart_control3_1 = sk.createVector(0.35, 0);
    const heart_control3_2 = sk.createVector(0.1, 0.55);

    const heart_anchor4 = sk.createVector(0.4, 0);
    const heart_control4_1 = sk.createVector(0.5, -0.33);
    const heart_control4_2 = sk.createVector(0, -0.4);

    // STATE.setup.baseVertsHeart.push(heart_anchor1);
    appendBezierVertices(
      STATE.setup.baseVertsHeart, 
      heart_anchor1,
      heart_control1_1,
      heart_control1_2,
      heart_anchor2,
      6
    );
    appendBezierVertices(
      STATE.setup.baseVertsHeart, 
      heart_anchor2,
      heart_control2_1,
      heart_control2_2,
      heart_anchor3,
      4
    );
    appendBezierVertices(
      STATE.setup.baseVertsHeart, 
      heart_anchor3,
      heart_control3_1,
      heart_control3_2,
      heart_anchor4,
      4
    );
    appendBezierVertices(
      STATE.setup.baseVertsHeart, 
      heart_anchor4,
      heart_control4_1,
      heart_control4_2,
      heart_anchor1,
      6
    );
  }

  function makeBaseBucketVerts()
  {
    STATE.setup.baseVertsBucket = STATE.setup.baseVertsBucket.concat([
      sk.createVector(-0.5, 0.5), // top left
      sk.createVector(0.5, 0.5),  // top right
      sk.createVector(0.5, -0.5), // bottom right
      sk.createVector(-0.5, -0.5), // bottom left
    ]);
  }

  function makeBaseGoalFrameVerts()
  {
    circleVertices(
      STATE.setup.baseVertsGoalFrame,
      { x: 0, y: 0},
      0.5,
      16.
    );
  }

  function makeAllBaseVerts()
  {
    makeBaseRaindropVerts();
    makeBaseDiamondVerts();
    makeBaseStarVerts();
    makeBaseHeartVerts();

    makeBaseBucketVerts();
    makeBaseGoalFrameVerts();
  }

  function getRealSizeScalar()
  {
    return sk.width / EXPECTED_WIDTH;
  }

  function setupBuckets()
  {
    // const realSizeScalar = getRealSizeScalar();

    // rain bucket
    STATE.shapes.bucketRain.position = sk.createVector(
      BUCKET_X, 
      1 * (EXPECTED_HEIGHT - BOTTOM_STRIP_HEIGHT) / (BUCKET_COUNT + 1)
    );
    STATE.shapes.bucketRain.velocity = sk.createVector(0, 0);
    STATE.shapes.bucketRain.scale = 0.0;
    STATE.shapes.bucketRain.rotation = 0.0;

    // ensure morph targets exist
    STATE.shapes.bucketRain.morphTo = {
      position: STATE.shapes.bucketRain.position,
      scale: STATE.shapes.bucketRain.scale,
      rotation: STATE.shapes.bucketRain.rotation
    };

    STATE.shapes.bucketRain.beingDragged = false;
    STATE.shapes.bucketRain.seed = Math.random();
    STATE.shapes.bucketRain.active = false;

    // diamond bucket
    STATE.shapes.bucketDiamond.position = sk.createVector(
      BUCKET_X, 
      2 * (EXPECTED_HEIGHT - BOTTOM_STRIP_HEIGHT) / (BUCKET_COUNT + 1)
    );
    STATE.shapes.bucketDiamond.velocity = sk.createVector(0, 0);
    STATE.shapes.bucketDiamond.scale = 0.0;
    STATE.shapes.bucketDiamond.rotation = 0.0;

    STATE.shapes.bucketDiamond.morphTo = {
      position: STATE.shapes.bucketDiamond.position,
      scale: STATE.shapes.bucketDiamond.scale,
      rotation: STATE.shapes.bucketDiamond.rotation
    };

    STATE.shapes.bucketDiamond.beingDragged = false;
    STATE.shapes.bucketDiamond.seed = Math.random();
    STATE.shapes.bucketDiamond.active = false;

    // star bucket
    STATE.shapes.bucketStar.position = sk.createVector(
      BUCKET_X, 
      3 * (EXPECTED_HEIGHT - BOTTOM_STRIP_HEIGHT) / (BUCKET_COUNT + 1)
    );
    STATE.shapes.bucketStar.velocity = sk.createVector(0, 0);
    STATE.shapes.bucketStar.scale = 0.0;
    STATE.shapes.bucketStar.rotation = 0.0;

    STATE.shapes.bucketStar.morphTo = {
      position: STATE.shapes.bucketStar.position,
      scale: STATE.shapes.bucketStar.scale,
      rotation: STATE.shapes.bucketStar.rotation
    };

    STATE.shapes.bucketStar.beingDragged = false;
    STATE.shapes.bucketStar.seed = Math.random();
    STATE.shapes.bucketStar.active = false;

    // heart bucket
    STATE.shapes.bucketHeart.position = sk.createVector(
      BUCKET_X, 
      4 * (EXPECTED_HEIGHT - BOTTOM_STRIP_HEIGHT) / (BUCKET_COUNT + 1)
    );
    STATE.shapes.bucketHeart.velocity = sk.createVector(0, 0);
    STATE.shapes.bucketHeart.scale = 0.0;
    STATE.shapes.bucketHeart.rotation = 0.0;

    STATE.shapes.bucketHeart.morphTo = {
      position: STATE.shapes.bucketHeart.position,
      scale: STATE.shapes.bucketHeart.scale,
      rotation: STATE.shapes.bucketHeart.rotation
    };

    STATE.shapes.bucketHeart.beingDragged = false;
    STATE.shapes.bucketHeart.seed = Math.random();
    STATE.shapes.bucketHeart.active = false;

    // activate rain bucket
    STATE.shapes.bucketRain.active = true;
    growShrinkBucket(
      STATE.shapes.bucketRain,
      BASE_BUCKET_SCALE
    )
  }

  function setupGoals()
  {
    // position these along the center of the bottom strip
    const bufferedWidth = EXPECTED_WIDTH * 0.96;
    const posY = EXPECTED_HEIGHT - BOTTOM_STRIP_HEIGHT / 2;
    const posXoffset = bufferedWidth / GOAL_TYPES.length * 0.5
      + (EXPECTED_WIDTH - bufferedWidth) * 0.5;

    const zeroVel = sk.createVector(0, 0);

    STATE.shapes.goals = [];
    
    for (let i = 0; i < GOAL_TYPES.length; i++)
    {
      STATE.shapes.goals.push(
        {
          position: sk.createVector(
            i * bufferedWidth / GOAL_TYPES.length + posXoffset, 
            posY
          ),
          velocity: zeroVel,
          scale: GOAL_SCALE,
          rotation: 0.,
          beingDragged: false,
          seed: Math.random(),
          type: GOAL_TYPES[i],
          achieved: false
        }
      );
      STATE.shapes.goals[i].morphTo = {
        position: STATE.shapes.goals[i].position,
        scale: STATE.shapes.goals[i].scale,
        rotation: STATE.shapes.goals[i].rotation
      };
    }
  }

  function setupWindow()
  {
    makeAllBaseVerts();
    setupBuckets();
    setupGoals();

    windowResized();

    // disable default scrolling behavior on touch
    // document.body.style.touchAction = 'none';
    sk.canvas.style.touchAction = 'none';
  }

  //// collision detection methods ////
  function pointInAABB(
    pointX,
    pointY,
    aabbDims = AABB_DIMS_RAINDROP, 
    position = sk.createVector(0, 0), 
    scale = 1.
  )
  {
    if (
      pointX >= position.x - aabbDims.x * scale &&
      pointX <= position.x + aabbDims.x * scale &&
      pointY >= position.y - aabbDims.y * scale &&
      pointY <= position.y + aabbDims.y * scale
    ) {
      return true;
    }
    return false;
  }

  //// game methods ////
  function addFallingShape(
    shapeType = RAINDROP, 
    position = sk.createVector(0, 0),
    velocity = sk.createVector(0, 0),
    scale = 1.0,
    rotation = 0.0)
  {
    let shapeArrays;

    switch (shapeType)  {
    default:
    case BUCKET:
      return; // no buckets added this way

    case RAINDROP:
      // console.log("adding a raindrop");
      shapeArrays = STATE.shapes.raindrops;
      break;

    case DIAMOND:
      // console.log("adding a diamond");
      shapeArrays = STATE.shapes.diamonds;
      break;
    
    case STAR:
      // console.log("adding a star");
      shapeArrays = STATE.shapes.stars;
      break;

    case HEART:
      // console.log("adding a heart");
      shapeArrays = STATE.shapes.hearts;
      break;
    }

    shapeArrays.positions.push(position);
    // need to create a copy for this
    shapeArrays.morphTos.positions.push(
      sk.createVector(
        position.x,
        position.y
      )
    );
    shapeArrays.scales.push(scale);   
    shapeArrays.morphTos.scales.push(scale);  

    shapeArrays.rotations.push(rotation);
    shapeArrays.morphTos.rotations.push(rotation);

    shapeArrays.velocities.push(velocity);

    shapeArrays.beingDragged.push(false);
    shapeArrays.seed.push(Math.random() * sk.TWO_PI);
  }

  // this way of removing is very expensive, but we don't
  // expect to remove that frequently, so it should be okay
  function removeFallingShape(shapeType = RAINDROP, idx = 0)
  {
    let shapeArrays;

    switch (shapeType) {
    default:
    case BUCKET:
      return; // buckets never removed

    case RAINDROP:
      if (idx < 0 || idx >= STATE.shapes.raindrops.positions.length) {
        console.warn("Invalid raindrop index: ", idx);
        return;
      }
      shapeArrays = STATE.shapes.raindrops;
      break;

    case DIAMOND:
      if (idx < 0 || idx >= STATE.shapes.diamonds.positions.length) {
        console.warn("Invalid diamond index: ", idx);
        return;
      }
      shapeArrays = STATE.shapes.diamonds;
      break;

    case STAR:
      if (idx < 0 || idx >= STATE.shapes.stars.positions.length) {
        console.warn("Invalid star index: ", idx);
        return;
      }
      shapeArrays = STATE.shapes.stars;
      break;

    case HEART:
      if (idx < 0 || idx >= STATE.shapes.hearts.positions.length) {
        console.warn("Invalid heart index: ", idx);
        return;
      }
      shapeArrays = STATE.shapes.hearts;
      break;
    }

    shapeArrays.positions.splice(idx, 1);
    shapeArrays.morphTos.positions.splice(idx, 1);
    shapeArrays.scales.splice(idx, 1);
    shapeArrays.morphTos.scales.splice(idx, 1);
    shapeArrays.rotations.splice(idx, 1);
    shapeArrays.morphTos.rotations.splice(idx, 1);

    shapeArrays.velocities.splice(idx, 1);
    shapeArrays.beingDragged.splice(idx, 1);
    shapeArrays.seed.splice(idx, 1);
  }

  // spawn locations are a row across the top
  // for spawning, we have two params:
    // number of spawn locations (always evenly spaced)
    // spawn rate (how many shapes to spawn per second)
  // so each frame, we check if its time to spawn a shape based on the spawn rate
    // (is time since last spawn greater than spawn rate)
  // if it is time, we decide the spawn location based on
    // previous spawn idx + 1 % number of spawn locations
  // then calculate that actual location
  // then decide which type of shape to spawn (so far just raindrops)

  function spawnFallingShapes()
  {
    // how should this work?
    // maybe we just cycle through a list of spawn locations
    // time to spawn a shape?
    if (
      STATE.game.lastShapeSpawnTime + STATE.game.shapeSpawnTime 
      < STATE.timeElapsed
    ) {
      // console.log("Spawning shape at time: ", STATE.timeElapsed, " ", STATE.game.lastShapeSpawnTime, " ", STATE.game.shapeSpawnTime);
      STATE.game.lastShapeSpawnTime = STATE.timeElapsed;

      // get spawn location
      STATE.game.lastShapeSpawnPointIdx = 
        (STATE.game.lastShapeSpawnPointIdx + 1) % STATE.game.shapeSpawnPointCount;

      const spawnLocation = sk.createVector(
        (STATE.game.lastShapeSpawnPointIdx + 1) * EXPECTED_WIDTH / (STATE.game.shapeSpawnPointCount + 2),
        0 // always spawn at the top
      );

      // TODO decide which shape to spawn
      const possibleShapes = [ RAINDROP ];
      if (STATE.shapes.bucketDiamond.active) possibleShapes.push(DIAMOND);
      if (STATE.shapes.bucketStar.active) possibleShapes.push(STAR);
      if (STATE.shapes.bucketHeart.active) possibleShapes.push(HEART);
      
      STATE.game.lastShapeTypeIdx = (STATE.game.lastShapeTypeIdx + 1) 
        % possibleShapes.length;

      // console.log("spawning shape ", possibleShapes[STATE.game.lastShapeTypeIdx]);

      addFallingShape(
        possibleShapes[STATE.game.lastShapeTypeIdx], 
        spawnLocation, 
        sk.createVector(
          STATE.game.shapeBaseVelocity * 0.15, 
          STATE.game.shapeBaseVelocity
        ),
        FALLING_SHAPE_SCALE, // scale
        0.0 // no rotation
      );
    }
  }

  function shapeDragOnOff(onOff = true, shapes, i)
  {
    shapes.beingDragged[i] = onOff;
    shapes.morphTos.scales[i] = onOff ?
      FALLING_SHAPE_SCALE * FALLING_SHAPE_DRAG_SCALE_COEF :
      FALLING_SHAPE_SCALE;
  }

  function updateFallingShapeDrag(
    i = 0, 
    dims = AABB_DIMS_RAINDROP,
    shapes = STATE.shapes.raindrops,
    realPos = sk.createVector(0.0, 0.0),
    realScale = 0
  )
  {
    // default to the effective location as a fallback (this is used!)
    let dragLoc = [ realPos.x + sk.width * 0.5, realPos.y + sk.height * 0.5 ];

    // if no mouse press or touches, always stop dragging
    if (!sk.mouseIsPressed && sk.touches.length === 0) {
      // shapes.beingDragged[i] = false;
      shapeDragOnOff(false, shapes, i);
    }
    else 
    {
      // is shape moused over?
      const mousedOver = pointInAABB(
        sk.mouseX - sk.width * 0.5, 
        sk.mouseY - sk.height * 0.5, 
        dims, 
        realPos, 
        realScale
      );
      // was mouse just clicked?
      const mouseJustClicked = sk.mouseIsPressed && !STATE.input.mouseWasPressed;
      if (mousedOver || sk.mouseIsPressed) // stay dragging if lagging behind mouse
      {
        dragLoc = [ 
          sk.mouseX, 
          sk.mouseY
        ];
      }

      let touched = false;
      let justTouched = false;
      if (sk.touches.length > 0)
      {
        for (let j = 0; j < sk.touches.length; j++) {
          // is shape touched?
          if (pointInAABB(
            sk.touches[j].x - sk.width * 0.5, 
            sk.touches[j].y - sk.height * 0.5, 
            dims, 
            realPos, 
            realScale
          )) {
            touched = true;

            // location to drag to
            dragLoc = [ 
              sk.touches[j].x, 
              sk.touches[j].y
            ];
            
            // was that touch just started?
            if (
              STATE.input.previousTouches.find(t => t.id === sk.touches[j].id) === undefined
            ) {
              justTouched = true;
              break;
            }
          }
        }
      }
      if (
        (mousedOver && mouseJustClicked) || // just clicked on
        (justTouched) // just touched
      ) {
        // start drag
        // console.log("Falling shape clicked or touched at: ", realPos.x, realPos.y);
        /*
        shapes.beingDragged[i] = true;
        shapes.morphTos.scales[i] *= FALLING_SHAPE_DRAG_SCALE_COEF;
        */
        shapeDragOnOff(true, shapes, i);
      }
      else if ((!mousedOver && !sk.mouseIsPressed) && !touched) { // end drag (could be needed if multiple touches are happening)
        // shapes.beingDragged[i] = false;
        shapeDragOnOff(false, shapes, i);
      }
    }

    // return the location we are getting dragged to
    return dragLoc;
  }

  function updateFallingShape(
    type = RAINDROP,
    shapes = newMorphableShapeArrays(), 
    i = 0, 
    bucket = { ...Bucket },
    dims = AABB_DIMS_RAINDROP,
    reusablePos = sk.createVector(0.0, 0.0),
    deltaTime = 0
  )
  {
    const pos = shapes.morphTos.positions[i];
    const wasDragging = shapes.beingDragged[i];
    const realSizeScalar = getRealSizeScalar();

    getRealPositionInPlace(reusablePos, pos, realSizeScalar);

    const dragLoc = updateFallingShapeDrag(
      i, 
      dims, 
      shapes,
      reusablePos,
      shapes.scales[i] * realSizeScalar
    );

    if (shapes.beingDragged[i] === false)
    {
      // move morph target according to velocity
      addVector2DInPlace(
        pos, 
        mulVector2D(
          sk, 
          shapes.velocities[i], 
          deltaTime
        )
      );

      // match rotation to velocity
      shapes.morphTos.rotations[i] = vectorToRotation(
        sk,
        shapes.velocities[i]
      ) - 0.25 * sk.TWO_PI;

      // if we are below the bottom cutoff, kill
      // let bottomCutoff = EXPECTED_HEIGHT - BOTTOM_STRIP_HEIGHT;
      /*
      if (renderer.GL !== undefined)
      {
        bottomCutoff -= sk.height * 0.5;
      }
      */

      if (pos.y > EXPECTED_HEIGHT - BOTTOM_STRIP_HEIGHT)
      {
        removeFallingShape(type,i);
        return;
      }
    }
    else // match drag
    {
      // console.log("drag location ", dragLoc);
      // mouse must be converted from real pos back to "expected" dimensions
      // this needs to match _drag_ if we're in touch, not mouse
      pos.x = dragLoc[0] / realSizeScalar;
      pos.y = dragLoc[1] / realSizeScalar;
    }

    // just dropped?
    if (
      wasDragging && 
      !shapes.beingDragged[i] &&
      bucket.active
    ) {
      // handle drop
      // dropped on correct bucket?

      // trying to measure here _without_ converting to real positions or scales
      if (pointInAABB(
        pos.x, pos.y, 
        AABB_DIMS_BUCKET, 
        bucket.position, 
        bucket.scale
      )) {
        // console.log("Falling shape dropped in bucket at: ", pos.x, pos.y);
        // grow bucket
        growShrinkBucket(
          bucket, 
          BUCKET_GROWTH_RATE
        );

        // remove raindrop
        removeFallingShape(type, i);
      }
    }
  }

  function updateFallingShapes(deltaTime)
  {
    let i = 0;

    const reusablePos = sk.createVector(0.0, 0.0);

    for (i = 0; i < STATE.shapes.raindrops.positions.length; i++)
    {
      updateFallingShape(
        RAINDROP,
        STATE.shapes.raindrops,
        i,
        STATE.shapes.bucketRain,
        AABB_DIMS_RAINDROP,
        reusablePos,
        deltaTime
      );
    }

    for (i = 0; i < STATE.shapes.diamonds.positions.length; i++)
    {
      updateFallingShape(
        DIAMOND,
        STATE.shapes.diamonds,
        i,
        STATE.shapes.bucketDiamond,
        AABB_DIMS_DIAMOND,
        reusablePos,
        deltaTime
      );
    }

    for (i = 0; i < STATE.shapes.stars.positions.length; i++)
    {
      updateFallingShape(
        STAR,
        STATE.shapes.stars,
        i,
        STATE.shapes.bucketStar,
        AABB_DIMS_STAR,
        reusablePos,
        deltaTime
      );
    }

    for (i = 0; i < STATE.shapes.hearts.positions.length; i++)
    {
      updateFallingShape(
        HEART,
        STATE.shapes.hearts,
        i,
        STATE.shapes.bucketHeart,
        AABB_DIMS_HEART,
        reusablePos,
        deltaTime
      );
    }
  }

  function growShrinkBucket(bucket = { ...BucketShape }, growth)
  {
    // const realSizeScalar = getRealSizeScalar();

    bucket.morphTo.scale += growth; // * realSizeScalar;
    // probably clamp scale
    bucket.morphTo.scale = Math.max(
      MIN_BUCKET_SCALE, // * realSizeScalar,
      Math.min(bucket.morphTo.scale, MAX_BUCKET_SCALE)// * realSizeScalar)
    );

    // deactivate
    if (
      bucket.type !== RAINDROP &&
      bucket.morphTo.scale <= BUCKET_LOCK_SCALE // * realSizeScalar
    )
    {
      // console.log("locking");
      bucket.active = false;
      bucket.morphTo.scale = 0.0;
    }
    // activate
    else if (
      bucket.morphTo.scale >= BUCKET_UNLOCK_SCALE &&
      growth > 0.0 // only activate on positive growth
    )
    {
      // console.log("trying to unlock");

      // rain unlocks diamond
      // diamond unlocks star
      // star unlocks heart

      switch (bucket.type)
      {
        case RAINDROP:
          if (!STATE.shapes.bucketDiamond.active)
          {
            STATE.shapes.bucketDiamond.active = true;
            STATE.shapes.bucketDiamond.morphTo.scale = 0.0;
            growShrinkBucket(STATE.shapes.bucketDiamond, BASE_BUCKET_SCALE);
          }
          break;

        case DIAMOND:
          if (!STATE.shapes.bucketStar.active)
          {
            STATE.shapes.bucketStar.active = true;
            STATE.shapes.bucketStar.morphTo.scale = 0.0;
            growShrinkBucket(STATE.shapes.bucketStar, BASE_BUCKET_SCALE);
          }
          break;

        case STAR:
          if (!STATE.shapes.bucketHeart.active)
          {
            STATE.shapes.bucketHeart.active = true;
            STATE.shapes.bucketHeart.morphTo.scale = 0.0;
            growShrinkBucket(STATE.shapes.bucketHeart, BASE_BUCKET_SCALE);
            
          }
          break;

        default:
          break;
      }
    }
  }

  function updateBuckets(deltaTime)
  {
    const realSizeScalar = getRealSizeScalar();

    // shrink buckets on some timer
    if (STATE.timeElapsed > STATE.game.lastBucketShrink + STATE.game.bucketShrinkTime)
    {
      // console.log("shrinking buckets")

      STATE.game.lastBucketShrink = STATE.timeElapsed;

      growShrinkBucket(
        STATE.shapes.bucketRain,
        BUCKET_SHRINK_RATE
      );
      growShrinkBucket(
        STATE.shapes.bucketDiamond,
        BUCKET_SHRINK_RATE
      );
      growShrinkBucket(
        STATE.shapes.bucketStar,
        BUCKET_SHRINK_RATE
      );
      growShrinkBucket(
        STATE.shapes.bucketHeart,
        BUCKET_SHRINK_RATE
      );
    }

    // based on current bucket sizes,
    // adjust the rate of rainfull for different shapes

    // update falling shape spawn positions, times, and
    // fall speed based on number of 
    // active buckets
    const totalBucketsActive = 
      STATE.shapes.bucketRain.active +
      STATE.shapes.bucketDiamond.active +
      STATE.shapes.bucketStar.active +
      STATE.shapes.bucketHeart.active;

    STATE.game.shapeSpawnPointCount = 1 + totalBucketsActive;

    const avgScale = (
      STATE.shapes.bucketRain.scale + 
      STATE.shapes.bucketDiamond.scale + 
      STATE.shapes.bucketStar.scale +
      STATE.shapes.bucketHeart.scale
    ) / (MAX_BUCKET_SCALE * 4. * realSizeScalar);

    const alpha = totalBucketsActive / 4. * 0.5 +
      avgScale * 0.5;

    STATE.game.shapeSpawnTime = sk.lerp(
      SHAPE_SPAWN_TIME.min,
      SHAPE_SPAWN_TIME.max,
      alpha
    );

    STATE.game.shapeBaseVelocity = sk.lerp(
      SHAPE_VELOCITY.min,
      SHAPE_VELOCITY.max,
      alpha
    );
  }

  function updateGoals(deltaTime)
  {
    let anyGoalAchieved = false;

    // goals
    // 1. have two buckets unlocked
    if (STATE.shapes.bucketDiamond.active) // raindrops always active
    {
      if (STATE.shapes.goals[0].achieved === false) anyGoalAchieved = true;
      STATE.shapes.goals[0].achieved = true;
    }

    // 2. have all 4 falling shapes unlocked
    if (
      STATE.shapes.bucketDiamond.active &&
      STATE.shapes.bucketStar.active &&
      STATE.shapes.bucketHeart.active
    ) // raindrops always active
    {
      if (STATE.shapes.goals[1].achieved === false) anyGoalAchieved = true;
      STATE.shapes.goals[1].achieved = true;
    }

    // 3. have only raindrops and hearts unlocked
    if (
      !STATE.shapes.bucketDiamond.active &&
      !STATE.shapes.bucketStar.active &&
      STATE.shapes.bucketHeart.active
    ) // raindrops always active
    {
      if (STATE.shapes.goals[2].achieved === false) anyGoalAchieved = true;
      STATE.shapes.goals[2].achieved = true;
    }

    // 4. have only stars on the screen
    if (
      STATE.shapes.raindrops.positions.length === 0 &&
      STATE.shapes.diamonds.positions.length === 0 &&
      STATE.shapes.stars.positions.length > 0 &&
      STATE.shapes.hearts.positions.length === 0
    )
    {
      if (STATE.shapes.goals[3].achieved === false) anyGoalAchieved = true;
      STATE.shapes.goals[3].achieved = true;
    }

    // 5. have all 4 unlocked AND above unlock size
    if (
      STATE.shapes.bucketDiamond.active &&
      STATE.shapes.bucketStar.active &&
      STATE.shapes.bucketHeart.active &&
      STATE.shapes.bucketRain.scale > BUCKET_UNLOCK_SCALE &&
      STATE.shapes.bucketDiamond.scale > BUCKET_UNLOCK_SCALE &&
      STATE.shapes.bucketStar.scale > BUCKET_UNLOCK_SCALE &&
      STATE.shapes.bucketHeart.scale > BUCKET_UNLOCK_SCALE
    )
    {
      if (STATE.shapes.goals[4].achieved === false) anyGoalAchieved = true;
      STATE.shapes.goals[4].achieved = true;
    }

    let allGoalsAchieved = true;
    for (let i = 0; i < 5; i++)
    {
      if (STATE.shapes.goals[i].achieved === false) allGoalsAchieved = false;
    }

    if (allGoalsAchieved && anyGoalAchieved)
    {
      startFireworks();
    }
  }

  function updateShapeMorph(
    deltaTime = 0.0, 
    shape = { ...ShapeMorphable },
    alpha = 0.0
  )
  {
    // console.log('trying to update morph ', shape.scale, " with ", alpha, " toward ", shape.morphTo.scale);
    shape.position.x = sk.lerp(shape.position.x, shape.morphTo.position.x, alpha);
    shape.position.y = sk.lerp(shape.position.y, shape.morphTo.position.y, alpha);
    shape.scale = sk.lerp(shape.scale, shape.morphTo.scale, alpha);
    shape.rotation = sk.lerp(shape.rotation, shape.morphTo.rotation, alpha);
  }

  // stuff going wrong with copying here maybe
  function updateShapeMorphs(deltaTime = 0.0)
  {
    let fallingShapeArrays = [ 
      STATE.shapes.raindrops, 
      STATE.shapes.diamonds, 
      STATE.shapes.stars, 
      STATE.shapes.hearts 
    ];

    // frame rate independent alpha using exponential
    const alpha = 1.0 - Math.exp(-0.04 * deltaTime);

    for (let i = 0; i < fallingShapeArrays.length; i++)
    {
      let fallingShapes = fallingShapeArrays[i];

      for (let j = 0; j < fallingShapes.positions.length; j++)
      {
        fallingShapes.positions[j].x = sk.lerp(
          fallingShapes.positions[j].x, 
          fallingShapes.morphTos.positions[j].x,
        alpha);
        fallingShapes.positions[j].y = sk.lerp(
          fallingShapes.positions[j].y, 
          fallingShapes.morphTos.positions[j].y, 
        alpha);
        fallingShapes.scales[j] = sk.lerp(
          fallingShapes.scales[j], 
          fallingShapes.morphTos.scales[j], 
        alpha);
        fallingShapes.rotations[j] = sk.lerp(
          fallingShapes.rotations[j], 
          fallingShapes.morphTos.rotations[j], 
        alpha);
      }
    }

    for (let i = 0; i < STATE.shapes.goals.length; i++)
    {
      updateShapeMorph(deltaTime, STATE.shapes.goals[i], alpha);
    }

    const buckets = [ 
      STATE.shapes.bucketRain, 
      STATE.shapes.bucketDiamond, 
      STATE.shapes.bucketStar, 
      STATE.shapes.bucketHeart 
    ];

    for (let i = 0; i < buckets.length; i++)
    {
      updateShapeMorph(deltaTime, buckets[i], alpha);
    }
  }

  //// drawing methods ////
  function drawShape(
    base_verts = STATE.setup.baseVertsRaindrop, 
    center = sk.createVector(0,0), 
    scale = 1., 
    rotation = 0,
    seed = 0.0,
    color = [ 0.0, 0.0, 0.0, 1.0 ],
    dragVelocity = [ 0.0, 0.0 ]
  )
  {
    if (base_verts.length === 0) return;

    const z = sk.createVector(0.0, 0.0);

    // set shader uniforms
    STATE.shaders.baseShape.setUniform('seed', seed);
    STATE.shaders.baseShape.setUniform(
      'objectPosition', 
      [ center.x, center.y ]
    );
    STATE.shaders.baseShape.setUniform('rotation', rotation);
    STATE.shaders.baseShape.setUniform(
      'baseColor', 
      color
    );
    STATE.shaders.baseShape.setUniform('dragVelocity', dragVelocity);

    // for some reason this is needed
    sk.fill(color);

    sk.beginShape();

    for (let i = 0; i < base_verts.length; i++) {
      const v = addVector2DInPlace(
        rotateVector2DInPlace(
          sk,
          mulVector2D(sk, base_verts[i], scale), 
          rotation,
          z
        ),
        center
      );
      sk.vertex(v.x, v.y);
    }

    sk.endShape(sk.CLOSE);
  }

  function drawBuckets()
  {
    // BUCKETS
    // general bucket style
    // sk.noStroke();

    const pos = sk.createVector(0.0, 0.0);
    const realSizeScalar = getRealSizeScalar();

    // rain bucket
    // if (STATE.shapes.bucketRain.active === true) 
    {
      getRealPositionInPlace(pos, STATE.shapes.bucketRain.position, realSizeScalar);

      // "border" shape
      drawShape(
        STATE.setup.baseVertsBucket,
        pos,
        STATE.shapes.bucketRain.scale * realSizeScalar,
        STATE.shapes.bucketRain.rotation,
        STATE.shapes.bucketRain.seed,
        BUCKET_BG_COLOR
      );

      // main shape
      drawShape(
        STATE.setup.baseVertsBucket,
        pos,
        STATE.shapes.bucketRain.scale * realSizeScalar * 0.75,
        STATE.shapes.bucketRain.rotation,
        STATE.shapes.bucketRain.seed,
        RAINDROP_COLOR
      );
    }
    // diamond bucket
    // if (STATE.shapes.bucketDiamond.active === true) 
    {
      getRealPositionInPlace(pos, STATE.shapes.bucketDiamond.position, realSizeScalar);

      // "border" shape
      drawShape(
        STATE.setup.baseVertsBucket,
        pos,
        STATE.shapes.bucketDiamond.scale * realSizeScalar,
        STATE.shapes.bucketDiamond.rotation,
        STATE.shapes.bucketDiamond.seed,
        BUCKET_BG_COLOR
      );

      // main shape
      drawShape(
        STATE.setup.baseVertsBucket,
        pos,
        STATE.shapes.bucketDiamond.scale * realSizeScalar * 0.75,
        STATE.shapes.bucketDiamond.rotation,
        STATE.shapes.bucketDiamond.seed,
        DIAMOND_COLOR
      );
    }
    // star bucket
    // if (STATE.shapes.bucketStar.active === true) 
    {
      getRealPositionInPlace(pos, STATE.shapes.bucketStar.position, realSizeScalar);

      // "border" shape
      drawShape(
        STATE.setup.baseVertsBucket,
        pos,
        STATE.shapes.bucketStar.scale * realSizeScalar,
        STATE.shapes.bucketStar.rotation,
        STATE.shapes.bucketStar.seed,
        BUCKET_BG_COLOR
      );

      // main shape
      drawShape(
        STATE.setup.baseVertsBucket,
        pos,
        STATE.shapes.bucketStar.scale * realSizeScalar * 0.75,
        STATE.shapes.bucketStar.rotation,
        STATE.shapes.bucketStar.seed,
        STAR_COLOR
      );
    }
    // heart bucket
    // if (STATE.shapes.bucketHeart.active === true) 
    {
      getRealPositionInPlace(pos, STATE.shapes.bucketHeart.position, realSizeScalar);

      // "border" shape
      drawShape(
        STATE.setup.baseVertsBucket,
        pos,
        STATE.shapes.bucketHeart.scale * realSizeScalar,
        STATE.shapes.bucketHeart.rotation,
        STATE.shapes.bucketHeart.seed,
        HEART_BUCKET_BG_COLOR
      );

      // main shape
      drawShape(
        STATE.setup.baseVertsBucket,
        pos,
        STATE.shapes.bucketHeart.scale * realSizeScalar * 0.75,
        STATE.shapes.bucketHeart.rotation,
        STATE.shapes.bucketHeart.seed,
        HEART_COLOR
      );
    }
  }

  function drawFallingShapes()
  {
    const pos = sk.createVector(0.0, 0.0);
    const realSizeScalar = getRealSizeScalar();
    let dragVelocity;

    // FALLING SHAPES
    // raindrops
    for (let i = 0; i < STATE.shapes.raindrops.positions.length; i++) {
      // sk.noStroke();

      getRealPositionInPlace(pos, STATE.shapes.raindrops.positions[i], realSizeScalar);

      dragVelocity = [ 0.0, 0.0 ];
      if (STATE.shapes.raindrops.beingDragged[i])
      {
        // dragVelocity = [ 1.0, 1.0 ];
        dragVelocity = [
          // ensure not 0 for shader to recognize dragging state!
          STATE.shapes.raindrops.morphTos.positions[i].x - STATE.shapes.raindrops.positions[i].x + 0.01,
          STATE.shapes.raindrops.morphTos.positions[i].y - STATE.shapes.raindrops.positions[i].y
        ];
      }

      // draw
      drawShape(
        STATE.setup.baseVertsRaindrop, 
        pos, 
        STATE.shapes.raindrops.scales[i] * realSizeScalar, 
        STATE.shapes.raindrops.rotations[i],
        STATE.shapes.raindrops.seed[i],
        RAINDROP_COLOR,
        dragVelocity
      );
    }
    // diamonds
    for (let i = 0; i < STATE.shapes.diamonds.positions.length; i++) {
      // console.log("rendering a diamond");
      // sk.noStroke();

      getRealPositionInPlace(pos, STATE.shapes.diamonds.positions[i], realSizeScalar);

      dragVelocity = [ 0.0, 0.0 ];
      if (STATE.shapes.diamonds.beingDragged[i])
      {
        // dragVelocity = [ 1.0, 1.0 ];
        dragVelocity = [
          STATE.shapes.diamonds.morphTos.positions[i].x - STATE.shapes.diamonds.positions[i].x + 0.01,
          STATE.shapes.diamonds.morphTos.positions[i].y - STATE.shapes.diamonds.positions[i].y
        ];
      }

      // draw
      drawShape(
        STATE.setup.baseVertsDiamond, 
        pos, 
        STATE.shapes.diamonds.scales[i] * realSizeScalar, 
        STATE.shapes.diamonds.rotations[i],
        STATE.shapes.diamonds.seed[i],
        DIAMOND_COLOR,
        dragVelocity
      );
    }
    // stars
    for (let i = 0; i < STATE.shapes.stars.positions.length; i++) {
      // console.log("rendering a star");
      // sk.noStroke();

      getRealPositionInPlace(pos, STATE.shapes.stars.positions[i], realSizeScalar);

      dragVelocity = [ 0.0, 0.0 ];
      if (STATE.shapes.stars.beingDragged[i])
      {
        // dragVelocity = [ 1.0, 1.0 ];
        dragVelocity = [
          STATE.shapes.stars.morphTos.positions[i].x - STATE.shapes.stars.positions[i].x + 0.01,
          STATE.shapes.stars.morphTos.positions[i].y - STATE.shapes.stars.positions[i].y
        ];
      }

      // draw
      drawShape(
        STATE.setup.baseVertsStar, 
        pos, 
        STATE.shapes.stars.scales[i] * realSizeScalar, 
        STATE.shapes.stars.rotations[i],
        STATE.shapes.stars.seed[i],
        STAR_COLOR,
        dragVelocity
      );
    }
    // hearts
    for (let i = 0; i < STATE.shapes.hearts.positions.length; i++) {
      // console.log("rendering a heart");
      // stroke("pink");
      // sk.noStroke();

      getRealPositionInPlace(pos, STATE.shapes.hearts.positions[i], realSizeScalar);

      dragVelocity = [ 0.0, 0.0 ];
      if (STATE.shapes.hearts.beingDragged[i])
      {
        // dragVelocity = [ 1.0, 1.0 ];
        dragVelocity = [
          STATE.shapes.hearts.morphTos.positions[i].x - STATE.shapes.hearts.positions[i].x + 0.01,
          STATE.shapes.hearts.morphTos.positions[i].y - STATE.shapes.hearts.positions[i].y
        ];
      }

      // draw
      drawShape(
        STATE.setup.baseVertsHeart, 
        pos, 
        STATE.shapes.hearts.scales[i] * realSizeScalar, 
        STATE.shapes.hearts.rotations[i],
        STATE.shapes.hearts.seed[i],
        HEART_COLOR,
        dragVelocity
      );
    }
  }

  function drawGoals()
  {
    const pos = sk.createVector(0.0, 0.0);
    const realSizeScalar = getRealSizeScalar();

    for (let i = 0; i < GOAL_TYPES.length; i++)
    {
      const goal = STATE.shapes.goals[i];

      getRealPositionInPlace(pos, goal.position, realSizeScalar);

      // general bucket style
      // stroke("yellow");
      // sk.noStroke();
      // noFill();

      if (goal.achieved)
      {
        // green circle for achieved
        drawShape(
          STATE.setup.baseVertsGoalFrame,
          pos,
          goal.scale * realSizeScalar,
          goal.rotation,
          goal.seed,
          ACHIEVED_GOAL_COLOR
        );
      }
      else
      {
        // grey circle for not achieved
        drawShape(
          STATE.setup.baseVertsGoalFrame,
          pos,
          goal.scale * realSizeScalar,
          goal.rotation,
          goal.seed,
          UNACHIEVED_GOAL_COLOR
        );
      }

      const scale1 = GOAL_SCALE * realSizeScalar * 0.2;
      const spacing1 = 0.75;
      const scale2 = GOAL_SCALE * realSizeScalar * 0.3;
      const spacing2 = 0.6;
      const scale3 = GOAL_SCALE * realSizeScalar * 0.7;

      switch (i)
      {
      case GOAL_RAIN_DIAMONDS:
        // image: two small buckets

        drawShape(
          STATE.setup.baseVertsBucket,
          sk.createVector(
            pos.x - scale1 * spacing1, 
            pos.y - scale1 * spacing1
          ),
          scale1,
          0.0,
          0.0,
          RAINDROP_COLOR
        );

        drawShape(
          STATE.setup.baseVertsBucket,
          sk.createVector(
            pos.x + scale1 * spacing1, 
            pos.y - scale1 * spacing1
          ),
          scale1,
          0.0,
          0.2,
          DIAMOND_COLOR
        );
        break;

      case GOAL_ALL_FOUR:
        // image: all 4 small buckets
        drawShape(
          STATE.setup.baseVertsBucket,
          sk.createVector(
            pos.x - scale1 * spacing1, 
            pos.y - scale1 * spacing1
          ),
          scale1,
          0.0,
          0.0,
          RAINDROP_COLOR
        );

        drawShape(
          STATE.setup.baseVertsBucket,
          sk.createVector(
            pos.x + scale1 * spacing1, 
            pos.y - scale1 * spacing1
          ),
          scale1,
          0.0,
          0.2,
          DIAMOND_COLOR
        );

        drawShape(
          STATE.setup.baseVertsBucket,
          sk.createVector(
            pos.x - scale1 * spacing1, 
            pos.y + scale1 * spacing1
          ),
          scale1,
          0.0,
          0.2,
          STAR_COLOR
        );

        drawShape(
          STATE.setup.baseVertsBucket,
          sk.createVector(
            pos.x + scale1 * spacing1, 
            pos.y + scale1 * spacing1
          ),
          scale1,
          0.0,
          0.2,
          HEART_COLOR
        );
        break;

      case GOAL_RAIN_HEARTS:
        // image: just rainbucket and heartbucket

        drawShape(
          STATE.setup.baseVertsBucket,
          sk.createVector(
            pos.x - scale1 * spacing1, 
            pos.y - scale1 * spacing1
          ),
          scale1,
          0.0,
          0.0,
          RAINDROP_COLOR
        );

        drawShape(
          STATE.setup.baseVertsBucket,
          sk.createVector(
            pos.x + scale1 * spacing1, 
            pos.y + scale1 * spacing1
          ),
          scale1,
          0.0,
          0.2,
          HEART_COLOR
        );

        break;

      case GOAL_ONLY_STARS:
        // image: star
        drawShape(
          STATE.setup.baseVertsStar,
          sk.createVector(
            pos.x, 
            pos.y
          ),
          scale3,
          0.0,
          0.2,
          STAR_COLOR
        );

        break;

      case GOAL_ALL_FOUR_BIG:
        // image: all 4 BIG buckets
        drawShape(
          STATE.setup.baseVertsBucket,
          sk.createVector(
            pos.x - scale2 * spacing2, 
            pos.y - scale2 * spacing2
          ),
          scale2,
          0.0,
          0.0,
          RAINDROP_COLOR
        );

        drawShape(
          STATE.setup.baseVertsBucket,
          sk.createVector(
            pos.x + scale2 * spacing2, 
            pos.y - scale2 * spacing2
          ),
          scale2,
          0.0,
          0.2,
          DIAMOND_COLOR
        );

        drawShape(
          STATE.setup.baseVertsBucket,
          sk.createVector(
            pos.x - scale2 * spacing2, 
            pos.y + scale2 * spacing2
          ),
          scale2,
          0.0,
          0.2,
          STAR_COLOR
        );

        drawShape(
          STATE.setup.baseVertsBucket,
          sk.createVector(
            pos.x + scale2 * spacing2, 
            pos.y + scale2 * spacing2
          ),
          scale2,
          0.0,
          0.2,
          HEART_COLOR
        );

        break;

      default:
        break;
      }
    }
  }

  function drawShapes()
  {
    drawGoals();
    drawBuckets();
    drawFallingShapes();
  }

  //// custom life cycle methods ////
  function pause()
  {
    console.log("pausing")
    /*
    sk.shader(STATE.shaders.postProcess2);
    STATE.shaders.postProcess2.setUniform('bigBlur', 1);
    */
    // draw one frame with the updated uniform
    draw();

    STATE.paused = true;
  }

  function unpause()
  {
    console.log("unpausing")
    /*
    sk.shader(STATE.shaders.postProcess2);
    STATE.shaders.postProcess2.setUniform('bigBlur', 0);
    */

    STATE.paused = false;
  }

  function handleClick(e)
  {
    // console.log("click event ", e.explicitOriginalTarget.id, " is canvas? ", e.target === sk.canvas);
    // e.preventDefault();
    // if (e.explicitOriginalTarget.id === "collecting_rain_button") return;
    if (e.target.classList.contains("toy_button")) return;
    if (e.target === sk.canvas) unpause();
    else pause();
  }

  function handleMouseDown(e)
  {
    e.preventDefault();
  }

  function handleTouch(e)
  {
    // console.log("touch event ", e, " is canvas? ", e.target === canvas);
    e.preventDefault();
    if (e.target.classList.contains("toy_button")) return;
    if (e.target === sk.canvas) unpause();
    else pause();
  }

  //// shaders ////

  function setupShaders()
  {
    // buffers
    STATE.shaders.fbo1 = sk.createFramebuffer({ format: sk.FLOAT });
    STATE.shaders.fbo2 = sk.createFramebuffer({ format: sk.FLOAT });
    STATE.shaders.fbo2Prev = sk.createFramebuffer({ format: sk.FLOAT });

    // shaders
    STATE.shaders.baseShape = sk.createShader(SHAPE_V_SHADER, SHAPE_F_SHADER);
    sk.shader(STATE.shaders.baseShape);
    STATE.shaders.baseShape.setUniform('windowScale', getRealSizeScalar());

    STATE.shaders.postProcess1 = sk.createShader(GENERIC_V_SHADER, POST1_F_SHADER);
    
    STATE.shaders.postProcess2 = sk.createShader(GENERIC_V_SHADER, POST2_F_SHADER);

    setupFireworks(sk);
    // unpause();
  }

  const SHAPE_V_SHADER = `
    precision highp float;

    // Attributes are special variable types that are only 
    // used in the vertex shader and are typically provided by p5.js
    attribute vec3 aPosition;
    attribute vec2 aTexCoord;
    attribute vec4 aVertexColor;

    // The transform of the object being drawn
    uniform mat4 uModelViewMatrix;
    // Transforms 3D coordinates to 2D screen coordinates
    uniform mat4 uProjectionMatrix;
    uniform float time;
    uniform vec2 objectPosition;
    uniform float rotation;
    uniform float seed;
    uniform float windowScale;
    uniform vec2 dragVelocity;

    // varying means it will be passed to fragment shader
    varying vec2 vTexCoord;
    varying vec4 vVertexColor;

    vec2 rotateVec2(vec2 v, float rads) {
      float cosTheta = cos(rads);
      float sinTheta = sin(rads);
      return vec2(
        v.x * cosTheta - v.y * sinTheta, // x'
        v.x * sinTheta + v.y * cosTheta  // y'
      );
    }

    #define PI 3.1415926
    #define TWO_PI (PI * 2.0)

    void main() {
      // find invented tex coords
      vec2 normRelPos = normalize(aPosition.xy - objectPosition);
      vTexCoord = rotateVec2(normRelPos, -rotation);

      float offsetSize, offsetSpeed; 
      vec3 dragOffset = vec3(0.0);
      float dragMag = length(dragVelocity);
      if (dragMag > 0.0) 
      {
        offsetSize = 1.333;
        offsetSpeed = 0.75;

        float d = dot(
          normalize(aPosition.xy - objectPosition),
          normalize(dragVelocity)
        );
        dragOffset = vec3(dragVelocity, 0.0) * d * 3.0;
      }
      else 
      {
        offsetSize = 0.667;
        offsetSpeed = 0.25;
      }

      // to create a "drag" effect
        // input the drag velocity as a uniform somehow
        // dot normalized relative pos of vertex with norm drag vel
        // the bigger the dot is and the larger the mag of drag velocity is, the more
        // we offset the vertex in the direction of drag velocity (and perhaps a bit in its own relative direction from shape center)

      vec3 offset =  windowScale * offsetSize * vec3(
        sin(vTexCoord.x + fract(time * offsetSpeed) * TWO_PI + seed),
        cos(vTexCoord.y + fract(time * offsetSpeed) * TWO_PI + seed),
        0.0
      ) + dragOffset;

      // Apply the camera transform
      vec4 viewModelPosition = uModelViewMatrix * vec4(aPosition + offset, 1.0);
      // Tell WebGL where the vertex goes
      gl_Position = uProjectionMatrix * viewModelPosition;  

      // Pass along data to the fragment shader
      vVertexColor = vec4(vTexCoord, 1.0, 1.0);
    }
  `;

  const SHAPE_F_SHADER = `
    precision highp float;

    // varying means passed from the vertex shader
    varying vec2 vTexCoord;
    varying vec4 vVertexColor;

    uniform vec4 baseColor;
    uniform vec2 objectPosition;

    void main() {
      vec4 myColor = baseColor;
      gl_FragColor = myColor;
    }
  `;

  // worley noise mosaic filter + time trail
  const POST1_F_SHADER = `
    precision highp float;

    uniform vec2 gridDims;
    uniform float time;
    uniform sampler2D fbo1;
    uniform sampler2D fboPrev;

    // x,y coordinates, given from the vertex shader
    varying vec2 vTexCoord;

    // by Inigo Quilez
    vec2 hashVecIq(vec2 p)
    {
      p = vec2(
        dot(p, vec2(127.1,311.7)),
        dot(p, vec2(269.5,183.3))
      );
      return fract(sin(p) * 18.5453);
    }

    vec3 hashVecIq3(vec2 p)
    {
      vec3 res = vec3(
        dot(p, vec2(127.1,311.7)),
        dot(p, vec2(269.5,183.3)),
        dot(p, vec2(341.4, 145.3))
      );
      return fract(sin(res) * 115.9314);
    }

    vec3 neighborSeeds[9];

    vec2 uvToGrid(vec2 uv, vec2 gridDims)
    {
      return vec2(
        floor(clamp(uv.x, 0.0, 1.0) * gridDims.x),
        floor(clamp(uv.y, 0.0, 1.0) * gridDims.y)
      ) / gridDims;
    }

    #define PI 3.1415926

    vec3 getNeighborSeed(vec2 uv, vec2 cell, vec2 cellSize, vec2 c)
    {
      cell = uvToGrid(uv + cellSize * c, gridDims);
      vec2 h = hashVecIq(cell);
      h +=  0.25 * sin(0.0001 * time * PI * 2.0 * h);
      vec3 s = vec3(cell + h / gridDims, 0.0);

      // store distance in z
      s.z = distance(s.xy, vTexCoord);
      return s;
    }

    void getNeighborSeeds()
    {
      vec2 cellSize = 1.0 / gridDims;
      vec2 cell;

      // some cells will repeat when on edges, but that's okay
      neighborSeeds[0] = getNeighborSeed(vTexCoord, cell, cellSize, vec2(-1.0, -1.0));
      neighborSeeds[1] = getNeighborSeed(vTexCoord, cell, cellSize, vec2(-1.0, 0.0));
      neighborSeeds[2] = getNeighborSeed(vTexCoord, cell, cellSize, vec2(-1.0, 1.0));
      neighborSeeds[3] = getNeighborSeed(vTexCoord, cell, cellSize, vec2(0.0, -1.0));
      neighborSeeds[4] = getNeighborSeed(vTexCoord, cell, cellSize, vec2(0.0, 0.0));
      neighborSeeds[5] = getNeighborSeed(vTexCoord, cell, cellSize, vec2(0.0, 1.0));
      neighborSeeds[6] = getNeighborSeed(vTexCoord, cell, cellSize, vec2(1.0, -1.0));
      neighborSeeds[7] = getNeighborSeed(vTexCoord, cell, cellSize, vec2(1.0, 0.0));
      neighborSeeds[8] = getNeighborSeed(vTexCoord, cell, cellSize, vec2(1.0, 1.0));

      float totalD = 0.0;
      for (int i = 0; i < 9; i++)
      {
        // normalize distances
        totalD += neighborSeeds[i].z;
      }

      for (int i = 0; i < 9; i++)
      {
        neighborSeeds[i].z = 1.0 - neighborSeeds[i].z / totalD;
      }
    }

    vec4 getClosestSeed()
    {
      vec4 s;
      for (int i = 0; i < 9; i++)
      {
        if (neighborSeeds[i].z > s.z)
        {
          s.xyz = neighborSeeds[i];
          s.a = float(i);
        }
      }
      return s;
    }

    void main() {
      // get neighbor grid coordinates
      getNeighborSeeds();

      vec4 s = getClosestSeed();
      vec4 c = texture2D(fbo1, s.xy);

      const float colorVariation = 0.15;
      c += vec4((hashVecIq3(s.xy) - 0.5) * colorVariation, 0.0);

      // mix with fbo1 so we don't totally lose the shape
      c = vec4(c.xyz, min(c.a, s.z * 2.0)) * texture2D(fbo1, vTexCoord);

      const float trailLength = 0.5;

      // faded edges
      vec2 e1 = min(
        vTexCoord,
        1.0 - vTexCoord
      );
      float e2 = smoothstep(0.0, 0.025, min(e1.x, e1.y));

      // mix with faded previous frame
      gl_FragColor = mix(
        texture2D(fboPrev, vTexCoord) * vec4(vec3(1.0), trailLength),
        c,
        c.a * e2
      );

      // test pass through base texture
      // gl_FragColor = texture2D(fbo1, vTexCoord);
    }
  `;

  // blur
  const POST2_F_SHADER = `
    precision highp float;

    uniform vec2 canvasSize;
    uniform float time;
    uniform sampler2D fbo2;
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
            fbo2, 
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
            fbo2, 
            clamp(uv + vec2(float(i), float(j)) * pixelUV, 0.0, 1.0)
          ) * weight;

          totalWeight += weight;
        }
      }


      return bc / totalWeight;
    }

    void main() {
      vec2 pixelUV = vec2(1.0) / canvasSize;
      gl_FragColor = blurColor(vTexCoord, pixelUV);

      // test pass through
      // gl_FragColor = texture2D(fbo2, vTexCoord);
    }
  `;

  //// core p5 methods ////
  // also called on initial window setup
  function windowResized() 
  {
    const newWidth = Math.min(sk.windowWidth * 0.9, sk.windowHeight * 0.9);
    sk.resizeCanvas(newWidth, newWidth, true);

    sk.shader(STATE.shaders.baseShape);
    STATE.shaders.baseShape.setUniform('windowScale', getRealSizeScalar());

    sk.shader(STATE.shaders.postProcess1);
    STATE.shaders.postProcess1.setUniform('gridDims', [144., 144.]);

    sk.shader(STATE.shaders.postProcess2);
    STATE.shaders.postProcess2.setUniform('canvasSize', [sk.width, sk.height]);

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
    // let main = canvas.parentElement;
    // renderer.parent('toy_canvas');
    // main.remove();

    setupShaders();

    setupWindow();

    // bind pause/unpause methods to events
    window.onblur = pause;
    // window.onfocus = unpause;
    window.onclick = handleClick;
    window.onmousedown = handleMouseDown;
    window.ontouchstart = handleTouch;
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
      const delta = sk.deltaTime / 1000.0; // convert ms to sec
      STATE.timeElapsed += delta; 
      STATE.shaders.baseShape.setUniform('time', STATE.timeElapsed);
      STATE.shaders.postProcess1.setUniform('time', STATE.timeElapsed);

      // update game state
      updateGoals(sk.deltaTime);
      updateBuckets(sk.deltaTime);
      spawnFallingShapes();
      updateFallingShapes(sk.deltaTime);
      updateShapeMorphs(sk.deltaTime);

      updateFireworks(sk, delta, STATE.timeElapsed);
    }

    
    { // DRAWING 
      // draw to buffer 1
      STATE.shaders.fbo1.begin();
        sk.clear(); // the buffer
        sk.shader(STATE.shaders.baseShape);
        drawShapes();
        drawFireworks(sk);
      STATE.shaders.fbo1.end();

      // bind the buffer to post process 1
      STATE.shaders.postProcess1.setUniform('fbo1', STATE.shaders.fbo1);

      // draw to buffer 2
      STATE.shaders.fbo2.begin();
        sk.clear(); // the buffer
        // draw post process 1 shader across whole screen
        sk.shader(STATE.shaders.postProcess1);
        sk.noStroke();
        sk.rect(-sk.width * 0.5, -sk.height * 0.5, sk.width, sk.height);
      STATE.shaders.fbo2.end();

      // bind the buffer to post process 2
      STATE.shaders.postProcess2.setUniform('fbo2', STATE.shaders.fbo2);
      // and back to the first post process shader!
      STATE.shaders.postProcess1.setUniform('fboPrev', STATE.shaders.fbo2);
      // swap fbo2 and fbo2Prev!
      let temp = STATE.shaders.fbo2;
      STATE.shaders.fbo2 = STATE.shaders.fbo2Prev;
      STATE.shaders.fbo2Prev = temp;

      // draw post process 2 shader across whole screen
      sk.clear(); // the screen
      // sk.background("white"); // white background for itch because itch does ugly stuff :(
      sk.shader(STATE.shaders.postProcess2);
      sk.noStroke();
      sk.rect(-sk.width * 0.5, -sk.height * 0.5, sk.width, sk.height);
    }

    
    { // END OF FRAME CLEAN UP
      // state updated at the end of each frame
      STATE.input.mouseWasPressed = sk.mouseIsPressed;
      STATE.input.previousTouches = [...sk.touches];
    }
  }

  sk.pause = pause;
  sk.unpause = unpause;
  sk.windowResized = windowResized;
  sk.setup = setup;
  sk.draw = draw;
}
