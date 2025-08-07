const FIREWORKS_TIME = 12.0;
const FIREWORKS_FADE_TIME = 0.5;

const FIREWORKS_STATE = {
  shader: {},
  stopwatch: 0.0,
  ticking: false
};

/*
  - identify time period (int(time * 0.25), for example)
  - hash that into a uv center for the firework
  - use time-functions to draw streaks moving out from the center that lerp between two colors
    - maybe use a "line sdf"?
  - draw more than one of these fireworks at a time, but on different cycles (by offsetting time)
*/
const FIREWORKS_F_SHADER = `
  precision highp float;

  // x,y coordinates, given from the vertex shader
  varying vec2 vTexCoord;

  const float period = 0.333;

  ` + SHADER_LIB + `

  uniform float time;
  uniform float alpha;

  vec2 hashIntToUV(int i)
  {
    vec2 v = vec2(
      dot(vec2(float(i), 3.2), vec2(98.1,145.7)),
      dot(vec2(-1.2, float(i)), vec2(211.5,101.3))
    );
    return fract(sin(v) * 18.5453);
  }

  float sdf_line(vec2 s, vec2 e, vec2 p, float w)
  {
    // line direction
    vec2 dir = e - s;
    float t = clamp(
      // projection of s->p onto s->e (length along line starting from e to closest point)
      dot(p - s, dir) / dot(dir, dir)
      // clamp because we only want points from e to s, nowhere else on the line
    , 0.0, 1.0);
    return distance(
      p, s + dir * t // closest point _on_ segment
    ) - w;
  }

  float cross2d(vec2 a, vec2 b) {
    return a.x * b.y - a.y * b.x;
  }

  // up = 1.0 or -1.0
  float sdf_arc(vec2 s, vec2 e, float r, float up, vec2 p, float w)
  {
    // early return check (because these are not being raymarched or anything)
    if (vec2_distance_sq(p, s) > 0.5) return 1.0;

    // origin of circles o is intersection of two circles around s and e
      // mid-point
    vec2 mid = (s + e) * 0.5;
      // pythogorean to find circle origin
    vec2 e_to_s_dir = normalize(s - e);
      // up decides which circle to use
    vec2 mid_to_o_dir = vec2(e_to_s_dir.y, -e_to_s_dir.x) * up;
    float mid_side_dist = distance(s, mid);
    float mid_to_o_dist = sqrt(r * r - mid_side_dist * mid_side_dist);
    vec2 o = mid + mid_to_o_dir * mid_to_o_dist;
    
    // if o->p is counterclockwise/clockwise (same for both) of o->s and o->e, it's outside the arc
    vec2 start_dir = normalize(s - o);
    vec2 end_dir = normalize(e - o);
    vec2 p_dir = normalize(p - o);

    float c1 = cross2d(start_dir, p_dir);
    float c2 = cross2d(end_dir, p_dir);

    // inside the arc?
    if (c1 * up >= 0.0 && c2 * up < 0.0)
    {
      // return sdf for the circle edge
      return distance(p, o + p_dir * r) - w;
    }
    // else return min of distance(p, s) and distance(p, e) - w
    return min(
      distance(p, s),
      distance(p, e)
    ) - w;
  }

  vec4 firework_color(float time_offset, float r, float rot, vec3 color)
  {
    // periodic changing number
    float f_time_period = time * period + time_offset;
    float time_fract = fract(f_time_period);
    int time_period = int(f_time_period);

    // center of the firework
    vec2 o = hashIntToUV(time_period);
    o.x = o.x * 0.5 + 0.25;
    o.y = o.y * 0.3 + 0.3;

    // subperiods
    float sub_tf_1 = min(time_fract, 0.3) / 0.3; // 0->1 over 0->0.3
    float sub_tf_2 = (max(0.3, time_fract) - 0.3) / 0.7; // 0->1 over 0.3->1

    const float base_line_w = 0.004;

    vec2 line_o = vec2((o.x + 0.5) * 0.5, 1.0);
    float line = sdf_line(
      line_o, 
      line_o + (o - line_o) * sub_tf_1, 
      vTexCoord, 
      max(base_line_w * (line_o.y - vTexCoord.y) * 1.0, 0.0)
    );

    vec2 line_vec = o - line_o;
    rot = -atan(line_vec.x, line_vec.y) + PI;

    if (
      vec2_distance_sq(vTexCoord, o) > r * r * 1.5 &&
      line > 0.0
    ) return vec4(0.0, 0.0, 0.0, 0.0);

    // centered circle
    float center_r = 0.01;
    float circle = sdf_circle_sq(o, vTexCoord, center_r);

    // spokes
    const int spoke_count = 24;
    float arc_res[spoke_count];
    float curve_r = r;
    const float up = 1.0;
    const float w = 0.002;
    
    const int half_spoke_count = spoke_count / 2;
    vec2 base_offset = vec2(-(r - (1.0 - sub_tf_2) * 0.1), 0.0);
    const float angle = 2.0 * PI / (float(spoke_count) * 1.1);
    vec2 offset;
    for (int i = 0; i < half_spoke_count; i++)
    {
      offset = rotate_vec2_around_zero(
        base_offset, 
        rot + angle * (float(i) - float(half_spoke_count) * 0.5 + 0.5)
      );
      arc_res[i * 2] = sdf_arc(
        o,
        o + offset,
        curve_r, -1.0, vTexCoord, w
      );
      arc_res[i * 2 + 1] = sdf_arc(
        o,
        o - offset,
        curve_r, 1.0, vTexCoord, w
      );
    }

    float sdf = circle;
    for (int i = 0; i < spoke_count; i++)
    {
      sdf = min(sdf, arc_res[i]);
    }

    // expand out over time
    sdf += (1.0 - min(sub_tf_2 * 8.0, 1.0)) * (circle + center_r) * 0.3;
    // get rid of center over time
    sdf += -min(sdf_circle_sq(o, vTexCoord, r * sub_tf_2 * 2.0) * 0.05, 0.0);

    sdf = min(sdf, line + sub_tf_2 * base_line_w);

    float a = float(sdf < 0.0);

    return vec4(color * a, a);
  }

  vec4 fireworks()
  {
    vec4 res = firework_color(0.0, 0.2, 2.0 * PI * 0.0, vec3(1.0, 1.0, 0.0));
    if (res.a > 0.0) return res;

    res = firework_color(1.2, 0.22, 2.0 * PI * 0.0, vec3(1.0, 0.0, 0.0));
    if (res.a > 0.0) return res;

    res = firework_color(2.5, 0.25, 2.0 * PI * 0.0, vec3(0.0, 1.0, 0.0));
    if (res.a > 0.0) return res;

    res = firework_color(3.3, 0.25, 2.0 * PI * 0.0, vec3(0.0, 0.0, 1.0));
    if (res.a > 0.0) return res;

    res = firework_color(4.1, 0.2, 2.0 * PI * 0.0, vec3(1.0, 0.0, 1.0));
    if (res.a > 0.0) return res;

    res = firework_color(5.25, 0.22, 2.0 * PI * 0.0, vec3(0.0, 1.0, 1.0));
    if (res.a > 0.0) return res;

    float a = 1.0 - smoothstep(
      0.25 - 0.05, 
      0.25, 
      vec2_distance_sq(vTexCoord, vec2(0.5, 0.5))
    );
    res = vec4(0.0, 0.0, 0.0, a);
    return res;
  }

  void main() {
    gl_FragColor = fireworks() * alpha;
  }
`;

function setupFireworks(sk)
{
  FIREWORKS_STATE.stopwatch = 0.0;
  FIREWORKS_STATE.ticking = false;
  FIREWORKS_STATE.shader = sk.createShader(GENERIC_V_SHADER, FIREWORKS_F_SHADER);
  sk.shader(FIREWORKS_STATE.shader);
  FIREWORKS_STATE.shader.setUniform("alpha", 0.0);
}

function startFireworks()
{
  FIREWORKS_STATE.stopwatch = 0.0;
  FIREWORKS_STATE.shader.setUniform("alpha", 0.0);
  FIREWORKS_STATE.ticking = true;
  console.log("starting fireworks");
}

function updateFireworks(sk, deltaTime, elaspedTime)
{
  if (FIREWORKS_STATE.ticking === false) return;

  console.log("updating fireworks ", deltaTime);
  sk.shader(FIREWORKS_STATE.shader);

  FIREWORKS_STATE.shader.setUniform('time', elaspedTime);

  FIREWORKS_STATE.stopwatch += deltaTime;

  if (FIREWORKS_STATE.stopwatch > FIREWORKS_TIME)
  {
    FIREWORKS_STATE.stopwatch = 0.0;
    FIREWORKS_STATE.ticking = false;
    FIREWORKS_STATE.shader.setUniform("alpha", 0.0);
  }
  else if (FIREWORKS_STATE.stopwatch < FIREWORKS_FADE_TIME)
  {
    // fade in
    const a = FIREWORKS_STATE.stopwatch / FIREWORKS_FADE_TIME;
    FIREWORKS_STATE.shader.setUniform("alpha", a);
  }
  else if (FIREWORKS_STATE.stopwatch > FIREWORKS_TIME - FIREWORKS_FADE_TIME)
  {
    // fade out
    const a = (FIREWORKS_TIME - FIREWORKS_STATE.stopwatch) / FIREWORKS_FADE_TIME;
    FIREWORKS_STATE.shader.setUniform("alpha", a);
  }
}

function drawFireworks(sk)
{
  if (FIREWORKS_STATE.ticking === false) return;

  console.log("drawing fireworks");
  sk.shader(FIREWORKS_STATE.shader);
  sk.rect(-sk.width * 0.5, -sk.height * 0.5, sk.width, sk.height);
}