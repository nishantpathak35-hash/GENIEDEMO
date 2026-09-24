import type { ReactNode } from 'react';
import { Stat, StatRow } from '../src/stat.js';
import { Hero } from '../src/hero.js';
import { Sparkline, Meter, MeterList } from '../src/chart.js';
import { Absent } from '../src/ui.js';

/** One entry per component; one state per design state, named as the design names it. */
export const stories: ReadonlyArray<{ component: string; states: Record<string, () => ReactNode> }> = [
  {
    component: 'Stat',
    states: {
      'figure with up delta and sparkline': () => (
        <Stat
          label="Ordered so far, all projects"
          value="₹10,44,61,700.00"
          delta={{ direction: 'up', figure: '₹12,40,000.00', period: 'this week' }}
          spark={<Sparkline values={[62, 64, 68, 70, 74, 79, 84, 90]} />}
        />
      ),
      'weighted-pipeline (note only)': () => (
        <Stat
          label="Pipeline, weighted by stage"
          value="₹9,78,10,000.00"
          note="of ₹31,06,00,000.00 unweighted · lead 10% to negotiation 70%"
        />
      ),
      'watch with next': () => (
        <Stat
          label="Margin at risk"
          value="₹25,91,200.00"
          delta={{ direction: 'watch', figure: '2 projects', period: 'committed past budget' }}
          spark={<Sparkline values={[30, 30, 25, 25, 20, 20, 12, 5]} threshold={33} />}
          next="Renegotiate, or raise a variation"
        />
      ),
      'compact/mini': () => <Stat label="Imprest in hand, ARAV-01" value="₹28,450.00" mini />,
      'text value ("After setup")': () => <Stat label="Payments" text value="After setup" />,
      'absent (Absent why)': () => (
        <Stat
          label="Margin"
          value={<Absent why="Two lines have no cost rate yet" />}
          note="add cost rates on 2.2 and 3.1 to see this"
        />
      ),
    },
  },
  {
    component: 'StatRow',
    states: {
      'of 3': () => (
        <StatRow n={3}>
          <Stat label="Reports you owe" value="1" note="VAYU-01 · not filed since Friday" />
          <Stat label="Materials short on your sites" value="2" note="Carpet tile · Gypsum board" />
          <Stat label="Imprest in hand, ARAV-01" value="₹28,450.00" note="6 entries this week" />
        </StatRow>
      ),
      'of 4': () => (
        <StatRow n={4}>
          <Stat label="Waiting for your approval" value="2" note="₹32,95,000.00 · oldest 6 days" />
          <Stat label="Bills received, not checked" value="4" note="Calder 2 · Ashvale 1 · Eastmere 1" />
          <Stat label="Statutory dates this month" value="2" note="GSTR-3B 20 Sep · TDS deposit 7 Oct" />
          <Stat label="Sites visited this week" value="5" />
        </StatRow>
      ),
    },
  },
  {
    component: 'Hero',
    states: {
      'the approvals hero with owners (no bar)': () => (
        <Hero
          eyebrow="This morning · Monday 15 September"
          value="₹36,85,000.00"
          sentence={
            <>
              Held by <b>3 approvals</b>. 2 are with <b>Rahul</b> in finance and one is with{' '}
              <b>Meridian Systems</b>.
            </>
          }
          side={<div className="d watch">3 waiting · oldest 6 days</div>}
          actions={
            <>
              <a className="button primary lg" href="#">
                Open all 3
              </a>
              <a className="button lg" href="#">
                Remind Rahul
              </a>
            </>
          }
          owners={[
            { initial: 'R', name: 'Rahul', role: 'finance' },
            { initial: 'M', name: 'Meridian', role: 'client' },
          ]}
          ariaLabel="This morning · Monday 15 September"
        />
      ),
      'the watch hero with the bar (88%, threshold 85)': () => (
        <Hero
          eyebrow="ARAV-01 · ordered against contract"
          value="88%"
          sentence={
            <>
              <b>₹1,58,72,300.00</b> ordered against a <b>₹1,80,00,000.00</b> contract.
            </>
          }
          actions={
            <a className="button primary lg" href="#">
              Open ARAV-01
            </a>
          }
          bar={{
            pct: 88,
            thresholdPct: 85,
            left: '₹1,58,72,300.00 ordered',
            right: '₹1,80,00,000.00 contract',
            thresholdLabel: '85% watch line',
          }}
          watch
          ariaLabel="ARAV-01 · ordered against contract"
        />
      ),
      '"Ordered so far" fallback': () => (
        <Hero
          eyebrow="Ordered so far, all projects"
          value="₹10,44,61,700.00"
          sentence="Nothing is waiting on you this morning — the pipeline below is the whole of it."
          actions={
            <a className="button primary lg" href="#">
              View projects
            </a>
          }
          ariaLabel="Ordered so far, all projects"
        />
      ),
    },
  },
  {
    component: 'Sparkline',
    states: {
      trend: () => <Sparkline values={[62, 64, 68, 70, 74, 79, 84, 90]} />,
      'with threshold crossed': () => (
        <Sparkline values={[5, 12, 19, 10, 25, 14, 28, 33]} threshold={15} />
      ),
      'with threshold not crossed': () => (
        <Sparkline values={[30, 30, 25, 25, 20, 20, 12, 5]} threshold={33} />
      ),
    },
  },
  {
    component: 'Meter',
    states: {
      'under threshold': () => <Meter pct={42} thresholdPct={85} />,
      'past threshold': () => <Meter pct={92} thresholdPct={85} />,
      'over contract': () => <Meter pct={100} thresholdPct={85} overPct={8} />,
      'no contract value (—)': () => <Meter pct={0} />,
    },
  },
  {
    component: 'MeterList',
    states: {
      'with 6 rows and the legend': () => (
        <MeterList
          legend={[
            { key: 'contract', label: 'Contract' },
            { key: 'ordered', label: 'Ordered so far' },
            { key: 'over', label: 'Past the contract' },
            { key: 'crossed', label: 'where it crossed' },
            { key: 'threshold', label: '85% watch line' },
          ]}
          rows={[
            { id: 'NEEL-01', label: 'NEEL-01', sub: 'Corporate office fitout, Cyber Hub', pct: 73.5, thresholdPct: 85, value: '₹3,12,40,500.00' },
            { id: 'ARAV-01', label: 'ARAV-01', sub: 'Workplace refresh, two floors', pct: 88.2, thresholdPct: 85, value: '₹1,58,72,300.00' },
            {
              id: 'VAYU-01',
              label: 'VAYU-01',
              sub: 'Flagship store fitout, Bandra Kurla Complex',
              pct: 100,
              thresholdPct: 85,
              overPct: 8,
              value: '₹43,18,900.00',
              note: '₹3,18,900.00 over ₹40,00,000.00',
            },
            { id: 'ASTA-01', label: 'ASTA-01', sub: 'Boardroom and client floor', pct: 0, thresholdPct: 85, value: '₹0.00' },
            { id: 'SURY-01', label: 'SURY-01', sub: 'R&D block interiors, Kharadi', pct: 58.6, thresholdPct: 85, value: '₹5,04,25,000.00' },
            {
              id: 'TARA-01',
              label: 'TARA-01',
              sub: 'Head office relocation, Guindy',
              pct: 0,
              value: <Absent why="No contract value entered yet" />,
              note: 'no contract value yet',
            },
          ]}
          summary="NEEL-01: ₹3,12,40,500.00 ordered of ₹4,25,00,000.00. ARAV-01: ₹1,58,72,300.00 ordered of ₹1,80,00,000.00. VAYU-01: ₹43,18,900.00 ordered of ₹40,00,000.00. ASTA-01: ₹0.00 ordered of ₹2,95,00,000.00. SURY-01: ₹5,04,25,000.00 ordered of ₹8,60,00,000.00. TARA-01: ₹22,60,000.00 ordered, no contract value."
        />
      ),
    },
  },
];
