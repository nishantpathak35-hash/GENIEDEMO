// Embedded API backend handler for Construct-O-Genie.
// Serves contract-compliant mock data in-process or via Next.js route handler.

import {
  TENANT_SETTINGS,
  TENANT_ID,
  PEOPLE,
  PROJECTS,
  ROLLUP_ITEMS,
  VENDORS,
  MODULES,
  COMPANY_PROFILE,
} from './fixtures';

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function extractBearer(request: Request): string | null {
  const auth = request.headers.get('authorization') ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

export async function handleBackendRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const searchParams = url.searchParams;
  const method = request.method.toUpperCase();

  // Normalize path by removing trailing slash
  const path = pathname.replace(/\/+$/, '') || '/';

  // 1. Authentication / WhoAmI
  if (path === '/api/v1/purchase-orders/whoami') {
    const credential = extractBearer(request);
    if (!credential) {
      return json(
        {
          code: 'TENANT_NOT_RESOLVED',
          message: 'No credential was provided. Please sign in.',
          requestId: `req_${Date.now()}`,
        },
        401,
      );
    }

    // Match known person or auto-resolve for any valid login
    const defaultPerson = PEOPLE[0]!;
    const person =
      PEOPLE.find((p) => p.email.toLowerCase() === credential.toLowerCase()) ??
      defaultPerson;

    return json({
      tenantId: TENANT_ID,
      principalId: person.id,
      principalKind: 'staff',
      requestId: `req_${Date.now()}`,
    });
  }

  // 2. Tenancy Settings
  if (path === '/api/v1/tenancy/settings') {
    return json(TENANT_SETTINGS);
  }

  // 3. User Entitlements
  if (path === '/api/v1/identity/me/entitlements') {
    return json({
      roles: ['admin', 'finance', 'proc'],
      modules: MODULES.map((m) => m.key),
      actions: ['admin', 'read', 'write', 'approve', 'pay'],
    });
  }

  // 4. People / Staff
  if (path === '/api/v1/settings/people') {
    return json({
      items: PEOPLE,
      nextCursor: null,
      prevCursor: null,
      count: PEOPLE.length,
      summary: { active: PEOPLE.length },
    });
  }

  // 5. Notifications
  if (path === '/api/v1/notifications') {
    return json({
      items: [],
      nextCursor: null,
      prevCursor: null,
      count: 0,
      unread: 0,
    });
  }

  // 6. Blocked Approvals
  if (path === '/api/v1/today/blocked-approvals') {
    return json({
      status: 'present',
      count: 0,
      total: '0',
      oldestDays: null,
      owners: [],
      items: [],
    });
  }

  // 7. Today Hero
  if (path === '/api/v1/today/hero') {
    return json({
      hero: {
        kind: 'contract-ceiling',
        rank: 1,
        projectId: '66666666-6666-4666-8666-666666666666',
        code: 'SAN-01',
        name: 'Workplace refresh, two floors, Outer Ring Road',
        committed: '1584000000',
        contractValue: '1800000000',
        orderedPct: 88,
        thresholdPct: 85,
        over: false,
        overBy: null,
      },
      candidates: [
        {
          kind: 'contract-ceiling',
          rank: 1,
          projectId: '66666666-6666-4666-8666-666666666666',
          code: 'SAN-01',
          name: 'Workplace refresh, two floors, Outer Ring Road',
          committed: '1584000000',
          contractValue: '1800000000',
          orderedPct: 88,
          thresholdPct: 85,
          over: false,
          overBy: null,
        },
        {
          kind: 'ordered-so-far',
          rank: 2,
          total: '7494400000',
          orderCount: 14,
          projectCount: 5,
        },
      ],
    });
  }

  // 8. Margin at Risk
  if (path === '/api/v1/today/margin-at-risk') {
    return json({
      status: 'present',
      total: '38400000',
      costBudget: '5880000000',
      committedApproved: '3078400000',
      coveredPct: 52.35,
      projectsOver: 1,
      partialProjects: 1,
      unpricedLines: 2,
      items: [
        {
          projectId: '33333333-3333-4333-8333-333333333333',
          code: 'KRA-01',
          status: 'complete',
          costBudget: '480000000',
          committedApproved: '518400000',
          atRisk: '38400000',
          unpricedLines: 0,
        },
      ],
    });
  }

  // 9. Cash Against Payables
  if (path === '/api/v1/today/cash-against-payables') {
    return json({
      status: 'present',
      payables: {
        today: '2026-09-16',
        weekEnds: '2026-09-20',
        nextWeekEnds: '2026-09-27',
        overdue: { count: 0, total: '0' },
        dueThisWeek: { count: 2, total: '12500000' },
        dueNextWeek: { count: 1, total: '18000000' },
        dueLater: { count: 1, total: '14500000' },
        toAcknowledge: { count: 2, total: '45000000' },
        upcoming: [
          {
            id: '81111111-1111-4111-8111-111111111111',
            vendorName: 'Prakashvahini Electrical Contracts Private Limited',
            billNumber: 'PE/26/041',
            dueOn: '2026-09-18',
            overdue: false,
            amountClaimed: '4500000',
          },
        ],
      },
      cash: {
        status: 'absent',
        why: 'A cash position requires an integration with your bank or accounting system.',
        missing: ['finance.bank_statements', 'finance.cash_position'],
      },
    });
  }

  // 10. Today Setup
  if (path === '/api/v1/today/setup') {
    return json({
      steps: [
        { key: 'company', state: 'done' },
        { key: 'projects', state: 'done' },
        { key: 'vendors', state: 'done' },
        { key: 'team', state: 'done' },
        { key: 'tally', state: 'todo' },
        { key: 'tax', state: 'done' },
      ],
      tally: {
        lastPostedAt: null,
        postedCount: 0,
        pendingCount: 0,
        lastSeenAt: null,
        instances: 0,
      },
      done: 5,
      total: 6,
      pct: 83,
    });
  }

  // 11. Today Weekly Sparklines
  if (path === '/api/v1/today/weekly') {
    return json({
      weeks: [
        { isoWeek: '2026-W30', start: '2026-07-20', end: '2026-07-26' },
        { isoWeek: '2026-W31', start: '2026-07-27', end: '2026-08-02' },
        { isoWeek: '2026-W32', start: '2026-08-03', end: '2026-08-09' },
        { isoWeek: '2026-W33', start: '2026-08-10', end: '2026-08-16' },
        { isoWeek: '2026-W34', start: '2026-08-17', end: '2026-08-23' },
        { isoWeek: '2026-W35', start: '2026-08-24', end: '2026-08-30' },
        { isoWeek: '2026-W36', start: '2026-08-31', end: '2026-09-06' },
        { isoWeek: '2026-W37', start: '2026-09-07', end: '2026-09-13' },
      ],
      orderedSoFar: {
        wire: [
          '2100000000',
          '2800000000',
          '3600000000',
          '4400000000',
          '5200000000',
          '6100000000',
          '6900000000',
          '7494400000',
        ],
        index: [2802, 3736, 4804, 5871, 6938, 8139, 9206, 10000],
      },
      pipelineOpened: {
        wire: ['120000000', '0', '480000000', '0', '860000000', '0', '0', '180000000'],
        index: [1395, 0, 5581, 0, 10000, 0, 0, 2093],
      },
      peopleOnSite: [12, 15, 18, 22, 25, 24, 28, 30],
    });
  }

  // 12. Project Rollups
  if (path === '/api/v1/rollups/projects') {
    return json({
      items: ROLLUP_ITEMS,
      threshold: { atRiskPct: 85, provisional: true },
      unattached: { committed: '0', orderCount: 0 },
      orderedSoFar: '7494400000',
      count: ROLLUP_ITEMS.length,
    });
  }

  // 13. Projects List
  if (path === '/api/v1/projects' && method === 'GET') {
    return json({
      items: PROJECTS,
      nextCursor: null,
      prevCursor: null,
      count: PROJECTS.length,
    });
  }

  // 14. Single Project & Project sub-resources
  const projectMatch = path.match(/^\/api\/v1\/projects\/([0-9a-fA-F-]+)(.*)$/);
  if (projectMatch) {
    const projectId = projectMatch[1]!;
    const sub = projectMatch[2];
    const defaultProject = PROJECTS[0]!;
    const currentProject =
      PROJECTS.find((p) => p.id === projectId) ?? defaultProject;

    if (!sub || sub === '') {
      return json(currentProject);
    }

    if (sub === '/boq') {
      return json({
        projectId,
        items: [],
        totals: {
          lineCount: 0,
          value: currentProject.originalValue ?? '100000000',
          cost: '80000000',
          margin: '20000000',
        },
      });
    }

    if (sub === '/change-orders') {
      return json({
        items: [],
        contract: {
          original: currentProject.originalValue ?? '100000000',
          current: currentProject.originalValue ?? '100000000',
          approvedVariations: 0,
          pendingVariations: 0,
        },
      });
    }

    if (sub === '/drawings') {
      return json({ items: [] });
    }

    if (sub === '/team') {
      return json({ items: [] });
    }

    if (sub === '/agreement') {
      return json({ agreement: null });
    }

    if (sub === '/procurement-plan') {
      return json({
        targetCompletionDate: null,
        conflicts: [],
        longLead: [],
      });
    }

    if (sub === '/handover') {
      return json({
        items: [],
        record: null,
        blocking: 0,
      });
    }

    if (sub === '/timesheets') {
      return json({
        entries: [],
        byPerson: [],
        totalMinutes: 0,
        totalDuration: '0h 0m',
      });
    }

    if (sub === '/client-actions') {
      return json({
        items: [],
        recorded: [],
      });
    }

    if (sub === '/state' && method === 'POST') {
      return json(currentProject);
    }
  }

  if (path.startsWith('/api/v1/design-build/agreement/projects/')) {
    return json({ agreement: null });
  }

  if (path.startsWith('/api/v1/design-build/procurement-plan/projects/')) {
    return json({
      targetCompletionDate: null,
      conflicts: [],
      longLead: [],
    });
  }

  if (path.startsWith('/api/v1/design-build/handover/projects/')) {
    return json({
      items: [],
      record: null,
      blocking: 0,
    });
  }

  if (path.startsWith('/api/v1/design-build/timesheets/projects/')) {
    return json({
      entries: [],
      byPerson: [],
      totalMinutes: 0,
      totalDuration: '0h 0m',
    });
  }

  if (path.startsWith('/api/v1/design-build/client-actions/projects/')) {
    return json({
      items: [],
      recorded: [],
    });
  }

  // Audit Search
  if (path === '/api/v1/workflow/audit') {
    return json({
      items: [],
      nextCursor: null,
      prevCursor: null,
      count: 0,
      summary: {
        total: 0,
        impersonated: 0,
      },
    });
  }

  // Site Today
  if (path === '/api/v1/siteops/today') {
    return json({
      date: '2026-09-24',
      onSite: 18,
      sitesReporting: 3,
      openIssues: 0,
      blockingIssues: 0,
      sites: [],
      sitesTotal: 0,
      latestReportOn: '2026-09-24',
      sitesReportingOnLatest: 0,
      byDay: [],
      firstBlocking: null,
    });
  }

  // Weekly Site Aggregate
  const weeklyMatch = path.match(/^\/api\/v1\/siteops\/weekly\/([0-9a-fA-F-]+)$/);
  if (weeklyMatch && method === 'GET') {
    return json({
      projectId: weeklyMatch[1]!,
      weekStart: '2026-09-08',
      weekEnd: '2026-09-14',
      reportedDays: 6,
      missingDates: [],
      personDays: 48,
      personDaysByTrade: {},
      averageOverReportedDays: 8,
      issuable: true,
    });
  }

  // Identity Roles
  if (path === '/api/v1/identity/roles') {
    return json({
      items: [
        {
          key: 'admin',
          label: 'Administrator',
          status: 'confirmed',
          retired: false,
          modules: ['all'],
          actions: ['all'],
        },
        {
          key: 'finance',
          label: 'Finance',
          status: 'confirmed',
          retired: false,
          modules: ['money'],
          actions: ['view', 'manage'],
        },
        {
          key: 'proc',
          label: 'Procurement',
          status: 'confirmed',
          retired: false,
          modules: ['procurement'],
          actions: ['view', 'manage'],
        },
      ],
      provisional: false,
    });
  }

  // 15. Vendors List
  if ((path === '/api/v1/vendors' || path === '/api/v1/purchase-orders/vendors') && method === 'GET') {
    return json({
      items: VENDORS,
      nextCursor: null,
      prevCursor: null,
      count: VENDORS.length,
      summary: {
        registered: VENDORS.length,
        active: VENDORS.length,
        agreedRates: 4,
        openOrders: {
          count: 11,
          vendors: 5,
          total: '275500000',
        },
        billsWaiting: { count: 2 },
        contractsExpiringIn30Days: { count: 0, contracts: [] },
        withoutTaxIds: { count: 0, names: [] },
      },
    });
  }

  // 16. Single Vendor
  const vendorMatch = path.match(/^\/api\/v1\/(?:purchase-orders\/)?vendors\/([0-9a-fA-F-]+)$/);
  if (vendorMatch && method === 'GET') {
    const vendorId = vendorMatch[1]!;
    const defaultVendor = VENDORS[0]!;
    const item = VENDORS.find((v) => v.id === vendorId) ?? defaultVendor;
    return json(item);
  }

  // 17. Workflow Tasks
  if (path === '/api/v1/workflow/tasks') {
    if (method === 'GET') {
      return json({
        items: [],
        nextCursor: null,
        prevCursor: null,
        count: 0,
        summary: {
          open: 0,
          dueToday: 0,
          overdue: 0,
          peopleWithOpenTasks: 0,
          overdueAssignees: [],
          dueTodayAssignees: [],
          entityTypes: [],
        },
      });
    }
    // Creation or update
    const firstProject = PROJECTS[0]!;
    const firstPerson = PEOPLE[0]!;
    return json({
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Demo task',
      description: '',
      entityType: 'project',
      entityId: firstProject.id,
      entityName: firstProject.code,
      projectId: firstProject.id,
      assignedTo: firstPerson.id,
      assignedBy: firstPerson.id,
      dueDate: null,
      priority: 'normal',
      status: 'open',
      completedAt: null,
      completedBy: null,
      notes: '',
      version: 1,
    });
  }

  // 18. Workflow Chains
  if (path === '/api/v1/workflow/chains') {
    return json({ items: [] });
  }

  // 19. Modules Settings
  if (path === '/api/v1/settings/modules') {
    return json({ items: MODULES });
  }

  // 20. Company Profile
  if (path === '/api/v1/settings/company') {
    return json(COMPANY_PROFILE);
  }

  // 21. Purchase Orders
  if (path === '/api/v1/purchase-orders') {
    return json({
      items: [],
      nextCursor: null,
      prevCursor: null,
      count: 0,
    });
  }

  if (path === '/api/v1/purchase-orders/next-number') {
    return json({
      number: 'PO-2026-0001',
      sequence: 1,
      financialYear: '2026-27',
      format: {
        prefix: 'PO',
        separator: '-',
        padding: 4,
        includeFy: true,
        fyFormat: 'YYYY-YY',
        resetEachFy: true,
        startingNumber: 1,
        status: 'confirmed',
      },
    });
  }

  const poMatch = path.match(/^\/api\/v1\/purchase-orders\/([0-9a-fA-F-]+)$/);
  if (poMatch && method === 'GET') {
    const id = poMatch[1]!;
    return json({
      id,
      number: 'PO-2026-0001',
      state: 'issued',
      version: 1,
      vendorId: VENDORS[0]!.id,
      vendorName: VENDORS[0]!.name,
      projectId: PROJECTS[0]!.id,
      taxable: '10000000',
      gst: '1800000',
      gross: '11800000',
      createdAt: '2026-02-01T00:00:00.000Z',
      lines: [],
    });
  }

  if (path === '/api/v1/rollups/rate-analysis') {
    return json({
      orderLines: 0,
      withoutAgreedRate: 0,
      withoutTradeCode: 0,
      linkedLines: 0,
      comparedLines: 0,
      unpricedBoqLines: 0,
      agreedBpOfBoqCost: 0,
    });
  }

  if (path.includes('/takeoff/') && path.endsWith('/summary')) {
    return json({
      itemCount: 0,
      unpricedItems: [],
      uncostedItems: [],
      value: '0',
      cost: '0',
    });
  }

  if (path.startsWith('/api/v1/portal/client/projects/') && path.endsWith('/billing')) {
    return json({
      invoices: [],
      invoiced: '0',
      received: '0',
      balance: '0',
    });
  }

  if (path === '/api/v1/purchase-orders/price') {
    return json({
      gross: '10000000',
      tax: '1800000',
      total: '11800000',
      lines: [],
    });
  }

  // 22. Bills (Payables)
  if (path === '/api/v1/purchase-orders/bills' || path === '/api/v1/bills') {
    return json({
      items: [],
      nextCursor: null,
      prevCursor: null,
      count: 0,
      summary: {
        today: '2026-09-16',
        weekEnds: '2026-09-20',
        nextWeekEnds: '2026-09-27',
        overdue: { count: 0, total: '0' },
        dueThisWeek: { count: 0, total: '0' },
        dueNextWeek: { count: 0, total: '0' },
        dueLater: { count: 0, total: '0' },
        toAcknowledge: { count: 0, total: '0' },
        upcoming: [],
      },
    });
  }

  // 23. Payments
  if (path === '/api/v1/money/payments' || path === '/api/v1/payments') {
    return json({
      items: [],
      nextCursor: null,
      prevCursor: null,
      count: 0,
      summary: {
        month: '2026-09',
        paidThisMonth: {
          count: 0,
          gross: '0',
          tds: '0',
          retention: '0',
          net: '0',
        },
        retentionHeld: '0',
        provisionalCount: 0,
      },
    });
  }

  // 24. Client Invoices (Receivables)
  if (path === '/api/v1/money/client-invoices' || path === '/api/v1/client-invoices') {
    return json({
      items: [],
      nextCursor: null,
      prevCursor: null,
      count: 0,
      summary: {
        invoiced: '0',
        received: '0',
        balance: '0',
        overdue: '0',
        openCount: 0,
        nextExpected: null,
      },
    });
  }

  // 25. TDS Challan
  if (path === '/api/v1/money/tds/challan' || path === '/api/v1/tds/challan') {
    const period = searchParams.get('period') ?? '2026-09';
    return json({
      status: 'absent',
      period,
      previous: '2026-08',
      next: '2026-10',
      why: 'TDS challan requires a configured TAN.',
      missing: ['tax.tan'],
    });
  }

  // 26. TDS 26Q
  if (path === '/api/v1/money/tds/26q' || path === '/api/v1/tds/26q') {
    const quarter = searchParams.get('quarter') ?? '2026-27-Q2';
    return json({
      status: 'absent',
      quarter,
      previous: '2026-27-Q1',
      next: '2026-27-Q3',
      why: '26Q statements require a configured TAN.',
      missing: ['tax.tan'],
    });
  }

  // 27. Retention
  if (path === '/api/v1/money/retention') {
    return json({
      items: [],
      nextCursor: null,
      prevCursor: null,
      count: 0,
      summary: {
        held: '0',
        released: '0',
        holdings: 0,
      },
    });
  }

  if (path === '/api/v1/purchase-orders/retention') {
    return json({
      items: [],
      nextCursor: null,
      prevCursor: null,
      count: 0,
    });
  }

  // 28. Leads (Pipeline)
  if (path === '/api/v1/projects/leads' || path === '/api/v1/leads') {
    return json({
      items: [],
      nextCursor: null,
      prevCursor: null,
      count: 0,
      totals: {
        openCount: 0,
        total: '0',
        weighted: '0',
        weightedByStage: '0',
        winRatePct: null,
        byStage: [],
        wonThisQuarter: {
          since: '2026-07-01',
          count: 0,
          value: '0',
        },
        nextSiteVisit: null,
      },
    });
  }

  // 29. Rate Contracts
  if (path === '/api/v1/purchase-orders/rate-contracts') {
    return json({
      items: [],
      nextCursor: null,
      prevCursor: null,
      count: 0,
      summary: { active: 0 },
    });
  }

  // 30. Stock / Inventory
  if (path === '/api/v1/purchase-orders/stock') {
    return json({
      items: [],
      nextCursor: null,
      prevCursor: null,
      count: 0,
      summary: {
        balances: 0,
        belowReorder: 0,
        awaitingCheckIn: 0,
        warehouses: [],
      },
    });
  }

  if (path === '/api/v1/purchase-orders/stock/costing-policy') {
    return json({
      method: 'weighted_average',
      status: 'confirmed',
      confirmedBy: 'Shalini Kamath',
      confirmedAt: '2026-01-01T00:00:00.000Z',
    });
  }

  // 31. Documents Vault
  if (path === '/api/v1/workflow/documents') {
    return json({
      items: [],
      nextCursor: null,
      prevCursor: null,
      count: 0,
      summary: {
        total: 0,
        byFolder: [],
      },
    });
  }

  // 32. Operational & Tax Setup
  if (path === '/api/v1/settings/operational') {
    return json({
      poTerms: 'Payment within 30 days of bill acknowledgement.',
      crmStaleDays: 14,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  }

  if (path === '/api/v1/settings/tax-setup') {
    return json({
      worksContractBundling: true,
      transporterPanDeclared: false,
      buyerTurnoverOver10Crore: true,
      answeredAt: '2026-01-01T00:00:00.000Z',
      answeredBy: 'Shalini Kamath',
      reviewCompletedAt: '2026-01-01T00:00:00.000Z',
      reviewCompletedBy: 'Shalini Kamath',
    });
  }


  
  if (path === '/api/v1/design-build/milestones/this-week') {
    return json({
      weekStart: '2026-09-21',
      weekEnd: '2026-09-27',
      dueCount: 0,
      delayedCount: 0,
      items: [],
    });
  }


  if (path === '/api/v1/settings/terminology') {
    return json({
      boq: 'BOQ',
      variation: 'Variation',
      dailyReport: 'Daily report',
      vendor: 'Vendor',
      changedAt: null,
    });
  }


  const rateContractMatch = path.match(/^\/api\/v1\/purchase-orders\/rate-contracts\/([0-9a-fA-F-]+)$/);
  if (rateContractMatch && method === 'GET') {
    const id = rateContractMatch[1];
    return json({
      id,
      vendorId: '71111111-1111-4111-8111-111111111111',
      vendorName: 'Acme Materials',
      number: 'RC-2026-001',
      title: 'Annual Rate Agreement',
      status: 'active',
      paymentTerms: '30 days net',
      notes: '',
      items: [],
    });
  }

  // --- SHELL ROUTES ---
  if (path === '/api/v1/shell/counts') {
    return json({
      approvals: 0,
      unchecked: 0,
      expiring: 0,
      low: 0,
      noReport: 0,
      overdue: 0,
    });
  }

  if (path === '/api/v1/shell/my-projects') {
    return json({
      mine: PROJECTS.map((p) => p.id),
      recent: PROJECTS.map((p) => p.id),
    });
  }

  if (path === '/api/v1/shell/preferences') {
    return json({
      columns: {},
      sidebar: {
        collapsed: false,
        open: ['projects', 'buying', 'sales', 'money', 'site'],
      },
      lastProjectId: PROJECTS[0]?.id ?? null,
      starredViews: [],
      starredReports: [],
      singleKeyShortcuts: false,
    });
  }

  if (path === '/api/v1/shell/search') {
    const q = searchParams.get('q') ?? '';
    const scope = searchParams.get('scope') ?? 'everything';
    return json({
      scope,
      items: [],
    });
  }

  if (path === '/api/v1/shell/quick-create') {
    return json({
      groups: [
        {
          section: 'Projects',
          items: [
            {
              key: 'new-project',
              label: 'New Project',
              href: '/projects',
              projectScoped: false,
            },
          ],
        },
      ],
    });
  }

  if (path === '/api/v1/shell/recent-history') {
    return json({ items: [] });
  }

  if (path === '/api/v1/shell/saved-views') {
    return json({ items: [] });
  }

  // --- TODAY & ROLLUP STATS ---
  if (path === '/api/v1/today/margin-at-risk') {
    return json({
      status: 'present',
      total: '0',
      costBudget: '50000000',
      committedApproved: '20000000',
      coveredPct: 40,
      projectsOver: 0,
      partialProjects: 0,
      unpricedLines: 0,
      items: [],
    });
  }

  if (path === '/api/v1/today/spend-by-trade') {
    return json({
      period: 'fy',
      label: 'FY 2026-27',
      from: '2026-04-01',
      to: '2027-03-31',
      total: '10000000',
      items: [],
      rest: { count: 0, gross: '0', pct: 0 },
    });
  }

  if (path === '/api/v1/purchase-orders/bills/ageing') {
    const emptyBucket = { count: 0, total: '0', pct: 0 };
    return json({
      today: '2026-09-24',
      total: '0',
      openCount: 0,
      overdue: emptyBucket,
      buckets: {
        current: emptyBucket,
        days1to30: emptyBucket,
        days31to60: emptyBucket,
        over60: emptyBucket,
      },
      toAcknowledge: { count: 0, total: '0' },
      oldest: null,
    });
  }

  if (path === '/api/v1/money/client-invoices/ageing') {
    const emptyBucket = { count: 0, total: '0', pct: 0 };
    return json({
      today: '2026-09-24',
      total: '0',
      openCount: 0,
      overdue: emptyBucket,
      buckets: {
        current: emptyBucket,
        days1to30: emptyBucket,
        days31to60: emptyBucket,
        over60: emptyBucket,
      },
      oldest: null,
    });
  }

  if (path === '/api/v1/money/by-month') {
    return json({
      period: 'fy',
      label: 'FY 2026-27',
      from: '2026-04',
      to: '2027-03',
      months: [],
      collected: '0',
      paidOut: '0',
      net: '0',
      ticks: [],
    });
  }

  if (path === '/api/v1/projects/leads/pipeline-summary') {
    return json({
      month: '2026-09',
      quoted: { count: 0, total: '0', names: [] },
      nextStepThisMonth: { count: 0, total: '0', names: [] },
      closingThisMonth: { count: 0, total: '0', names: [] },
      open: { count: 0, total: '0', names: [] },
    });
  }

  if (path === '/api/v1/projects/change-orders/unsigned') {
    return json({
      count: 0,
      total: '0',
      items: [],
      oldest: null,
    });
  }

  if (path === '/api/v1/rollups/rate-library') {
    return json({
      items: [],
      count: 0,
      summary: { above: 0, neverOrdered: 0, contracts: 0 },
    });
  }

  if (path === '/api/v1/rollups/projects') {
    return json({
      items: PROJECTS.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        state: p.state,
        contractValue: '10000000',
        committed: '5000000',
        orderCount: 1,
        health: 'on-track',
        orderedPct: 50,
        billed: '0',
        billedPct: 0,
        meter: {
          trackPct: 100,
          fillPct: 50,
          thresholdPct: 85,
          overPct: 0,
        },
        margin: {
          status: 'complete',
          costBudget: '8000000',
          committedApproved: '4000000',
          atRisk: '0',
          unpricedLines: 0,
          coveredPct: 50,
        },
      })),
      threshold: { atRiskPct: 85, provisional: true },
      unattached: { committed: '0', orderCount: 0 },
      orderedSoFar: '5000000',
      count: PROJECTS.length,
    });
  }

  // --- RECCE & MISC ---
  const recceMatch = path.match(/^\/api\/v1\/siteops\/recce\/([0-9a-fA-F-]+)$/);
  if (recceMatch && method === 'GET') {
    const id = recceMatch[1];
    return json({
      id,
      projectId: PROJECTS[0]?.id ?? '11111111-1111-4111-8111-111111111111',
      recceOn: '2026-09-24',
      conductedBy: '11111111-1111-4111-8111-111111111111',
      clientPresent: true,
      buaMicros: '1000000000',
      carpetMicros: '800000000',
      floorHeightMicros: '3000000',
      floorNumber: '2',
      numFloors: 1,
      siteCondition: 'bare_shell',
      handoverOn: '2026-12-31',
      keyChallenges: 'None noted',
      observations: 'Site ready for fitout',
      measurements: {},
      services: {},
      status: 'completed',
      version: 1,
    });
  }

  if (path.includes('/transporter-declarations')) {
    return json({
      items: [],
      count: 0,
      evidence: [],
      currentFinancialYear: '2026-27',
    });
  }

  if (path === '/api/v1/portal/whoami') {
    return json({
      kind: 'vendor',
      name: 'Shalini Kamath',
      email: 'vendor@example.com',
      organisation: 'Acme Materials',
      firm: 'Luxeworx Atelier',
      projects: [],
    });
  }

  if (path === '/platform/v1/whoami') {
    return json({
      principalId: '11111111-1111-4111-8111-111111111111',
      kind: 'platform',
    });
  }

  // 22. Generic Wildcard Handlers
  if (method === 'GET') {
    // List/collection endpoints
    return json({
      items: [],
      nextCursor: null,
      prevCursor: null,
      count: 0,
    });
  }

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    return json({
      id: '00000000-0000-4000-8000-000000000001',
      ok: true,
    });
  }

  if (method === 'DELETE') {
    return json(null, 204);
  }

  return json({ ok: true });
}
