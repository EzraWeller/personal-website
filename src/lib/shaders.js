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
  v -= 0.5;
  float cosA = cos(angle);
  float sinA = sin(angle);
  return vec2(
    v.x * cosA - v.y * sinA,
    v.x * sinA + v.y * cosA
  ) + 0.5;
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