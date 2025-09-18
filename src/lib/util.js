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