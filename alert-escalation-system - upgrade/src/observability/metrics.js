const counters = Object.create(null);
const timings = Object.create(null);

function increment(name, value = 1) {
  counters[name] = (counters[name] || 0) + value;
}

function observe(name, ms) {
  if (!timings[name]) {
    timings[name] = { count: 0, totalMs: 0, maxMs: 0 };
  }
  timings[name].count += 1;
  timings[name].totalMs += ms;
  timings[name].maxMs = Math.max(timings[name].maxMs, ms);
}

function snapshot() {
  const averages = {};
  for (const [name, entry] of Object.entries(timings)) {
    averages[name] = {
      count: entry.count,
      avgMs: entry.count ? Number((entry.totalMs / entry.count).toFixed(2)) : 0,
      maxMs: entry.maxMs
    };
  }
  return { counters, timings: averages, ts: new Date().toISOString() };
}

module.exports = {
  increment,
  observe,
  snapshot
};
