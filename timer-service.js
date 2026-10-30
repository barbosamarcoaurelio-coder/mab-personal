export function elapsed(startedAt,finishedAt){const end=finishedAt?new Date(finishedAt).getTime():Date.now();return Math.max(0,Math.floor((end-new Date(startedAt).getTime())/1000))}
export function remaining(targetEndAt){return Math.max(0,Math.ceil((new Date(targetEndAt).getTime()-Date.now())/1000))}
export function fmt(sec){const m=Math.floor(sec/60),s=sec%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
