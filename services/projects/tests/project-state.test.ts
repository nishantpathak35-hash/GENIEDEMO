import { describe, expect, it } from 'vitest';
import { PROJECT_STATES, canMove, dateStampedBy, nextStates } from '../src/domain/project-state.js';

describe('project state moves', () => {
  it('a lead is won or lost, and nothing else', () => {
    expect(nextStates('lead')).toEqual(['won', 'lost']);
    expect(canMove('lead', 'in_progress')).toBe(false);
    expect(canMove('lead', 'handed_over')).toBe(false);
  });

  it('a won project starts on site, or is lost', () => {
    expect(nextStates('won')).toEqual(['in_progress', 'lost']);
    expect(canMove('won', 'lead')).toBe(false);
  });

  it('a site is handed over or closed; a handed-over project is closed', () => {
    expect(nextStates('in_progress')).toEqual(['handed_over', 'closed']);
    expect(nextStates('handed_over')).toEqual(['closed']);
    expect(canMove('handed_over', 'in_progress')).toBe(false);
  });

  it('closed and lost are final', () => {
    for (const to of PROJECT_STATES) {
      expect(canMove('closed', to)).toBe(false);
      expect(canMove('lost', to)).toBe(false);
    }
  });

  it('never moves a project to the state it is in', () => {
    for (const s of PROJECT_STATES) expect(canMove(s, s)).toBe(false);
  });

  it('stamps started_on and handed_over_on on exactly those two moves', () => {
    expect(dateStampedBy('in_progress')).toBe('started_on');
    expect(dateStampedBy('handed_over')).toBe('handed_over_on');
    for (const s of ['lead', 'won', 'closed', 'lost'] as const) expect(dateStampedBy(s)).toBeNull();
  });
});
