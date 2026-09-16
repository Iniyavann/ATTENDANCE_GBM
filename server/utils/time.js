/**
 * All date/time logic uses the SERVER's own clock, never a value sent by
 * the browser - this is what stops someone from spoofing their check-in
 * time or the day's date from the client.
 */

// YYYY-MM-DD in the server's local timezone (respects the TZ env var if set).
function todayISO(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

function firstOfMonthISO(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  return todayISO(d);
}

function uid() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Late/On-time based on server time, office start time (HH:MM) and grace minutes.
function computeLateStatus(timestamp, officeStartTime, graceMinutes) {
  const [h, m] = String(officeStartTime || '09:30').split(':').map(Number);
  const grace = Number(graceMinutes) || 0;
  const cutoff = h * 60 + m + grace;
  const d = new Date(timestamp);
  const actual = d.getHours() * 60 + d.getMinutes();
  return actual > cutoff ? 'Late' : 'On time';
}

module.exports = { todayISO, firstOfMonthISO, uid, computeLateStatus };
