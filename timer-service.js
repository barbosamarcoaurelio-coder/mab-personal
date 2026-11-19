export function elapsed(startedAt,finishedAt){const end=finishedAt?new Date(finishedAt).getTime():Date.now();return Math.max(0,Math.floor((end-new Date(startedAt).getTime())/1000))}
export function remaining(targetEndAt){return Math.max(0,Math.ceil((new Date(targetEndAt).getTime()-Date.now())/1000))}
export function fmt(sec){const m=Math.floor(sec/60),s=sec%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
export function fmtHms(sec){const total=Math.max(0,Math.floor(Number(sec)||0)),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
export function sumActiveSeconds(sessions, activities){return sessions.reduce((total,session)=>total+(sessionTimes(session).total??0),0)+activities.reduce((total,activity)=>total+Math.round(Number(activity.durationMinutes||0)*60),0)}

export function sessionTimes(session, restTimers = [], executedSets = []) {
  const seconds = value => {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };
  const warmup = session.warmupSkipped ? 0 : seconds(session.warmupSeconds);
  const duration = seconds(session.durationSeconds);
  const start = Date.parse(session.startedAt);
  const end = Date.parse(session.finishedAt);
  const total = Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? elapsed(session.startedAt, session.finishedAt)
    : duration == null ? null : duration + (warmup ?? 0);
  const sumForSession = (records, field) => records.reduce((sum, record) => {
    const value = record.sessionId === session.id ? seconds(record[field]) : null;
    return value == null ? sum : (sum ?? 0) + value;
  }, null);
  const rest = sumForSession(restTimers, 'actualDurationSeconds') ?? sumForSession(executedSets, 'restSecondsBefore');
  const execution = total == null || warmup == null || rest == null ? null : Math.max(0, total - warmup - rest);
  return { total, warmup, execution, rest };
}
