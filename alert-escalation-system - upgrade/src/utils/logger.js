function log(level, event, data = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data
  };
  const serialized = JSON.stringify(payload);
  if (level === 'error') {
    console.error(serialized);
    return;
  }
  console.log(serialized);
}

module.exports = {
  info(event, data)  { log('info',  event, data); },
  warn(event, data)  { log('warn',  event, data); },
  error(event, data) { log('error', event, data); },
};
