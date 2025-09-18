const SHADER_LIB = `
const float PI = 3.1415926;

float mod_float(float f, float m)
{
  return f - m * floor(f / m);
}

vec2 rotate_vec2_around_zero(vec2 v, float angle)
{
  float cosA = cos(angle);
  float sinA = sin(angle);
  return vec2(
    v.x * cosA - v.y * sinA,
    v.x * sinA + v.y * cosA
  );
}

vec2 rotate_vec2_around_center(vec2 v, float angle)
{
  return rotate_vec2_around_zero(v - 0.5, angle) + 0.5;
  /*
  v -= 0.5;
  float cosA = cos(angle);
  float sinA = sin(angle);
  return vec2(
    v.x * cosA - v.y * sinA,
    v.x * sinA + v.y * cosA
  ) + 0.5;
  */
}

float vec2_distance_sq(vec2 v1, vec2 v2)
{
  float x = v1.x - v2.x;
  float y = v1.y - v2.y;
  return x * x + y * y;
}

float sdf_circle_sq(vec2 o, vec2 p, float r)
{
  return vec2_distance_sq(p, o) - r * r;
}

float sdf_square(vec2 o, vec2 p, float s)
{
  return max(abs(p.x - o.x), abs(p.y - o.y)) - s * 0.5;
}

float sdf_line(vec2 o, vec2 p, float w)
{
  return abs(p.x - o.x) - w;
}

float sdf_line_segment(vec2 l1, vec2 l2, vec2 p, float w)
{
  vec2 v = l2 - l1;
  vec2 closest_p = l1 + v * clamp(dot(p - l1, v) / dot(v, v), 0.0, 1.0);
  return distance(p, closest_p) - w;
}

/*
  what is the approach here?
  check distance to each of the vertices
  two closest define the closest edge
  do the sdf to that line segment, which involves rotating the point in order to pretend that line is in a standard transform
*/
float sdf_triangle(vec2 o, vec2 p, float s)
{
  // get triangle height for equilateral triangle
  float h = s * 0.8660254; // sqrt(3)/2

  // transform point to origin space
  vec2 tp = p - o;

  // fold space to only consider positive x, since distances will stay the same
  tp.x = abs(tp.x);

  // distance to side
  float d1 = sdf_line_segment(vec2(s * 0.5, h * -0.5), vec2(0.0, h * 0.5), tp, 0.0);

  // distance to base side
  float d2 = sdf_line_segment(vec2(s * 0.5, h * -0.5), vec2(0.0, h * -0.5), tp, 0.0);

  // if above the base and below the side, sign should be negative
  float sign = (float(
    tp.y > h * -0.5 // above base
    && 
    tp.y <= (
      tp.x             // x value
      * -h / (s * 0.5) // slope
      + h * 0.5        // intercept
    ) // below side
  ) * 2.0 - 1.0) * -1.0; // convert to proper sign

  return min(d1 * sign, d2 * sign);
}

float sdf_zigzag(vec2 o, vec2 p, float w)
{
  // WTF is with these ws needed to get sort of sharp corners?
  float middle = mix(
    mix(-1.0 + w * 2.0, 1.0 - w * 0.5, p.y),
    mix(1.0 - w * 0.5, -1.0 + w * 2.0, p.y),
    step(p.y, 0.5)
  );
  return abs(p.x - middle) - w;
}
`;

const GENERIC_V_SHADER = `
  precision highp float;

  attribute vec3 aPosition;
  attribute vec2 aTexCoord;
  // attribute vec4 aVertexColor;

  // The transform of the object being drawn
  uniform mat4 uModelViewMatrix;
  // Transforms 3D coordinates to 2D screen coordinates
  uniform mat4 uProjectionMatrix;

  varying vec2 vTexCoord;
  // varying vec4 vVertexColor;

  void main() {
    // Apply the camera transform
    vec4 viewModelPosition = uModelViewMatrix * vec4(aPosition, 1.0);
    // Tell WebGL where the vertex goes
    gl_Position = uProjectionMatrix * viewModelPosition;  

    // Pass along data to the fragment shader
    vTexCoord = aTexCoord;
  }
`;