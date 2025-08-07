//// supplmental lib methods /// 

function lerpVector2D(sk, v1, v2, a)
{
  return sk.createVector(
    sk.lerp(v1.x, v2.x, a),
    sk.lerp(v1.y, v2.y, a)
  );
}

function lerpVector2DInPlace(sk, v1, v2, a)
{
  v1.x = sk.lerp(v1.x, v2.x, a);
  v1.y = sk.lerp(v1.y, v2.y, a);
  return v1;
}

function addVector2D(sk, v1, v2)
{
  return sk.createVector(
    v1.x + v2.x,
    v1.y + v2.y 
  );
}

function addVector2DInPlace(v1, v2)
{
  v1.x += v2.x;
  v1.y += v2.y;
  return v1;
}

function subtractVector2D(sk, v1, v2)
{
  return sk.createVector(
    v1.x - v2.x,
    v1.y - v2.y       
  );
}

function subtractVector2DInPlace(v1, v2)
{
  v1.x -= v2.x;
  v1.y -= v2.y;
  return v1;
}

function mulVector2D(sk, v, a)
{
  return sk.createVector(
    v.x * a,
    v.y * a
  );  
}

function mulVector2DInPlace(v, a)
{
  v.x *= a;
  v.y *= a;
  return v;
}

function rotateVector2DAroundOrigin(sk, v, angle)
{
  const cosA = sk.cos(angle);
  const sinA = sk.sin(angle);
  return sk.createVector(
    v.x * cosA - v.y * sinA,
    v.x * sinA + v.y * cosA
  );
}

function rotateVector2DAroundOriginInPlace(sk, v, angle)
{
  const cosA = sk.cos(angle);
  const sinA = sk.sin(angle);
  const x = v.x;
  v.x = x * cosA - v.y * sinA;
  v.y = x * sinA + v.y * cosA;
  return v;
}

function rotateVector2D(sk, v, angle, pivot) 
{
  return addVector2D(
    sk,
    pivot,
    rotateVector2DAroundOrigin(
      subtractVector2D(sk, v, pivot),
      angle
    )
  );
}

function rotateVector2DInPlace(sk, v, angle, pivot) 
{
  subtractVector2DInPlace(v, pivot);
  rotateVector2DAroundOriginInPlace(sk, v, angle);
  addVector2DInPlace(v, pivot);
  return v;
}

function vectorToRotation(sk, v)
{
  // returns the angle in radians of the vector from the positive x-axis
  return sk.atan2(v.y, v.x);
}