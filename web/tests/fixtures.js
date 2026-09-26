let n = 0;
export function uuid() {
  n += 1;
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export function session(sessionDate, weekOf, overrides = {}) {
  return {
    id: uuid(),
    type: 'session',
    v: 1,
    occurredAt: `${sessionDate}T14:30:00.000Z`,
    payload: {
      skill: 'laravel', resource: 'Laravel Daily', duration: 20, status: 'Completed',
      message: 'Today I learned X.', sessionDate, weekOf, startedAt: '21:30', ...overrides
    }
  };
}
