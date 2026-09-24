import type { ReactNode } from 'react';
import {
  BulkBar,
  FilterChips,
  ListFrame,
  Pager,
  Skeleton,
  SortableHeader,
  Toolbar,
} from '../src/list.js';
import { Stepper } from '../src/stepper.js';
import { Drawer } from '../src/drawer.js';
import { Choice, Field } from '../src/form.js';

/** One entry per component; one state per design state, named as the design names it. */
export const stories: ReadonlyArray<{ component: string; states: Record<string, () => ReactNode> }> = [
  {
    component: 'Toolbar',
    states: {
      'search and two filters': () => (
        <Toolbar>
          <Field name="q" label="Search" type="search" placeholder="Name, trade or GSTIN" />
          <Choice
            name="trade"
            label="Trade"
            options={[
              ['joinery', 'Joinery'],
              ['mep', 'MEP'],
            ]}
          />
          <Choice
            name="status"
            label="Status"
            options={[
              ['active', 'Active'],
              ['inactive', 'Inactive'],
            ]}
          />
          <Toolbar.Spacer />
          <a className="button primary" href="/vendors/new">
            Add a vendor
          </a>
        </Toolbar>
      ),
    },
  },
  {
    component: 'FilterChips',
    states: {
      'three chips and a count': () => (
        <FilterChips
          applied={[
            { key: 'trade', label: 'Trade', value: 'Joinery', removeHref: '/vendors?period=q3' },
            { key: 'vendor', label: 'Vendor', value: 'Eastmere Engineering', removeHref: '/vendors?trade=joinery' },
            { key: 'period', label: 'Period', value: 'This quarter', removeHref: '/vendors?trade=joinery&vendor=eastmere' },
          ]}
          clearAllHref="/vendors"
          count={{ shown: 3, of: 3 }}
        />
      ),
      'empty renders nothing': () => <FilterChips applied={[]} clearAllHref="/vendors" />,
    },
  },
  {
    component: 'Pager',
    states: {
      range: () => (
        <Pager
          shown={{ from: 1, to: 12 }}
          of={83}
          unit="files"
          page={1}
          pages={7}
          hrefFor={(page) => `/documents?page=${page}`}
        />
      ),
      filtered: () => (
        <Pager shown={{ from: 1, to: 3 }} of={3} filteredFrom={53} unit="items" />
      ),
      none: () => <Pager shown={{ from: 0, to: 0 }} of={0} filteredFrom={53} unit="items" />,
      all: () => <Pager shown={{ from: 1, to: 6 }} of={6} unit="vendors" />,
    },
  },
  {
    component: 'BulkBar',
    states: {
      hidden: () => (
        <BulkBar count={0} clearLabel="Clear selection">
          <button type="button" className="button sm">
            Move to trade…
          </button>
        </BulkBar>
      ),
      'with 3 selected': () => (
        <BulkBar count={3} clearLabel="Clear selection">
          <button type="button" className="button sm">
            Move to trade…
          </button>
          <button type="button" className="button sm primary">
            Raise an order
          </button>
        </BulkBar>
      ),
    },
  },
  {
    component: 'SortableHeader',
    states: {
      none: () => (
        <table className="data">
          <thead>
            <tr>
              <SortableHeader
                label="Agreed rate"
                sortKey="rate"
                current={null}
                hrefFor={(key, dir) => `/rates?sort=${key}&dir=${dir}`}
                numeric
              />
            </tr>
          </thead>
        </table>
      ),
      ascending: () => (
        <table className="data">
          <thead>
            <tr>
              <SortableHeader
                label="Agreed rate"
                sortKey="rate"
                current={{ key: 'rate', dir: 'asc' }}
                hrefFor={(key, dir) => `/rates?sort=${key}&dir=${dir}`}
                numeric
              />
            </tr>
          </thead>
        </table>
      ),
      descending: () => (
        <table className="data">
          <thead>
            <tr>
              <SortableHeader
                label="Agreed rate"
                sortKey="rate"
                current={{ key: 'rate', dir: 'desc' }}
                hrefFor={(key, dir) => `/rates?sort=${key}&dir=${dir}`}
                numeric
              />
            </tr>
          </thead>
        </table>
      ),
    },
  },
  {
    component: 'Skeleton',
    states: {
      '4 columns × 3 rows': () => (
        <Skeleton
          rows={3}
          columns={[
            { label: 'Order' },
            { label: 'Vendor' },
            { label: 'Raised', numeric: true },
            { label: 'Amount', numeric: true },
          ]}
        />
      ),
    },
  },
  {
    component: 'ListFrame',
    states: {
      'toolbar, chips, bulk bar, table and pager in visual order': () => (
        <ListFrame>
          <Toolbar>
            <Field name="q" label="Search" type="search" />
          </Toolbar>
          <FilterChips
            applied={[{ key: 'trade', label: 'Trade', value: 'Joinery', removeHref: '/vendors' }]}
            clearAllHref="/vendors"
          />
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Vendor</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Ashvale Interiors</td>
                </tr>
              </tbody>
            </table>
          </div>
          <BulkBar count={1} clearLabel="Clear selection">
            <button type="button" className="button sm">
              Move to trade…
            </button>
          </BulkBar>
          <Pager shown={{ from: 1, to: 1 }} of={1} unit="vendors" />
        </ListFrame>
      ),
    },
  },
  {
    component: 'Stepper',
    states: {
      'done, now, later': () => (
        <Stepper
          steps={[
            { label: 'Raised', note: 'Priya N. · 3 May', state: 'done' },
            { label: 'Site engineer', state: 'now' },
            { label: 'Finance', state: 'later' },
          ]}
        />
      ),
    },
  },
  {
    component: 'Drawer',
    states: {
      'open with a form and a footer': () => (
        <Drawer
          title="Raise an order from 3 lines"
          sub="step 2 of 3"
          open
          onClose={() => {}}
          footer={
            <button type="button" className="button primary lg">
              Raise PO-0042
            </button>
          }
        >
          <Field name="notes" label="Notes for the vendor" />
        </Drawer>
      ),
    },
  },
];
