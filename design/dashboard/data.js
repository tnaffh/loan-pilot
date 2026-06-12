// Raccoons Financial Services — dashboard sample data
// Figures are precomputed (not derived from a rate formula) so they stay neutral
// on the open question of how the 30% finance charge is applied.
window.RFS = (function () {
  function n$(v) { return 'N$ ' + Math.round(v).toLocaleString('en-US'); }

  var borrowers = [
    { id: 'B-1042', first: 'Helena', last: 'Kapenda', initials: 'HK', idNo: '98031500412', phone: '+264 81 234 5567', email: 'helena.k@email.na', address: '12 Acacia St, Khomasdal, Windhoek', employer: 'Ministry of Health', occupation: 'Registered Nurse', income: 18500, empType: 'Civil servant', bank: 'Bank Windhoek', acct: 'Savings', since: '2023-11-02', status: 'active' },
    { id: 'B-1043', first: 'Trofimus', last: 'Nangolo', initials: 'TN', idNo: '90061100231', phone: '+264 81 552 1180', email: 't.nangolo@email.na', address: '5 Omuramba Rd, Katutura, Windhoek', employer: 'Windhoek High School', occupation: 'Teacher', income: 22000, empType: 'Permanently employed', bank: 'FNB', acct: 'Cheque', since: '2024-01-15', status: 'active' },
    { id: 'B-1051', first: 'Shateni', last: 'Amukwa', initials: 'SA', idNo: '85100400785', phone: '+264 81 778 9921', email: 's.amukwa@shop.na', address: '88 Independence Ave, Windhoek CBD', employer: 'Amukwa Trading CC (self)', occupation: 'Shop owner', income: 31000, empType: 'Self-employed', bank: 'Standard Bank', acct: 'Cheque', since: '2024-03-09', status: 'arrears' },
    { id: 'B-1067', first: 'Maria', last: 'Shikongo', initials: 'MS', idNo: '95072200119', phone: '+264 81 990 2231', email: 'maria.s@email.na', address: '23 Hosea Kutako Dr, Windhoek', employer: 'NamPower', occupation: 'Administrator', income: 16800, empType: 'Permanently employed', bank: 'Nedbank', acct: 'Savings', since: '2024-05-21', status: 'active' },
    { id: 'B-1072', first: 'Petrus', last: 'Haufiku', initials: 'PH', idNo: '88021900456', phone: '+264 81 445 6610', email: 'p.haufiku@email.na', address: '4 Eros St, Klein Windhoek', employer: 'Pupkewitz Motors', occupation: 'Sales executive', income: 26500, empType: 'Permanently employed', bank: 'FNB', acct: 'Cheque', since: '2024-07-30', status: 'active' },
    { id: 'B-1080', first: 'Lukas', last: 'Iipinge', initials: 'LI', idNo: '92110800332', phone: '+264 81 233 8890', email: 'l.iipinge@email.na', address: '17 Mandume Ndemufayo Ave, Windhoek', employer: 'Iipinge Logistics CC (self)', occupation: 'Transport operator', income: 42000, empType: 'Self-employed', bank: 'Bank Windhoek', acct: 'Cheque', since: '2024-09-12', status: 'active' },
    { id: 'B-1091', first: 'Ndapewa', last: 'Amadhila', initials: 'NA', idNo: '97040300981', phone: '+264 81 667 1245', email: 'n.amadhila@email.na', address: '9 Sam Nujoma Dr, Windhoek', employer: 'Standard Bank', occupation: 'Teller', income: 15200, empType: 'Permanently employed', bank: 'Standard Bank', acct: 'Savings', since: '2025-01-08', status: 'settled' },
    { id: 'B-1102', first: 'Johannes', last: 'Gowaseb', initials: 'JG', idNo: '83061200147', phone: '+264 81 880 4412', email: 'j.gowaseb@email.na', address: '31 Stockholm St, Otjomuise, Windhoek', employer: 'City of Windhoek', occupation: 'Engineer', income: 38000, empType: 'Civil servant', bank: 'FNB', acct: 'Cheque', since: '2025-02-19', status: 'active' }
  ];

  // status: active | arrears | settled
  var loans = [
    { id: 'L-20451', borrowerId: 'B-1042', type: 'payday', principal: 8000, total: 10400, term: 2, instalment: 5200, paid: 1, of: 2, balance: 5200, disbursed: '2026-05-25', nextDue: '2026-07-25', status: 'active' },
    { id: 'L-20448', borrowerId: 'B-1043', type: 'payday', principal: 5000, total: 6500, term: 1, instalment: 6500, paid: 0, of: 1, balance: 6500, disbursed: '2026-06-02', nextDue: '2026-07-02', status: 'active' },
    { id: 'L-20399', borrowerId: 'B-1051', type: 'business', principal: 60000, total: 78000, term: 5, instalment: 15600, paid: 2, of: 5, balance: 46800, disbursed: '2026-03-15', nextDue: '2026-06-15', status: 'arrears', daysLate: 12 },
    { id: 'L-20467', borrowerId: 'B-1067', type: 'payday', principal: 4500, total: 5850, term: 2, instalment: 2925, paid: 1, of: 2, balance: 2925, disbursed: '2026-05-20', nextDue: '2026-07-20', status: 'active' },
    { id: 'L-20470', borrowerId: 'B-1072', type: 'collateral', principal: 120000, total: 150000, term: 5, instalment: 30000, paid: 1, of: 5, balance: 120000, disbursed: '2026-05-10', nextDue: '2026-07-10', status: 'active', collateral: 'Toyota Hilux 2021 (N99-123W)' },
    { id: 'L-20412', borrowerId: 'B-1080', type: 'business', principal: 45000, total: 58500, term: 5, instalment: 11700, paid: 3, of: 5, balance: 23400, disbursed: '2026-02-28', nextDue: '2026-07-01', status: 'active' },
    { id: 'L-20301', borrowerId: 'B-1091', type: 'payday', principal: 3000, total: 3900, term: 1, instalment: 3900, paid: 1, of: 1, balance: 0, disbursed: '2026-04-10', nextDue: '—', status: 'settled' },
    { id: 'L-20480', borrowerId: 'B-1102', type: 'collateral', principal: 90000, total: 112500, term: 5, instalment: 22500, paid: 1, of: 5, balance: 90000, disbursed: '2026-05-18', nextDue: '2026-07-18', status: 'active', collateral: 'Erf 1123, Otjomuise (title deed)' }
  ];

  var applications = [
    { id: 'A-3310', name: 'Selma Nghidinwa', initials: 'SN', type: 'payday', amount: 6000, term: '2 months', income: 14000, date: '2026-06-10', status: 'pending', affordability: 'pass' },
    { id: 'A-3309', name: 'David Garoëb', initials: 'DG', type: 'business', amount: 75000, term: '5 months', income: 52000, date: '2026-06-10', status: 'review', affordability: 'review' },
    { id: 'A-3307', name: 'Aina Hamutenya', initials: 'AH', type: 'payday', amount: 9500, term: '1 month', income: 12000, date: '2026-06-09', status: 'pending', affordability: 'fail' },
    { id: 'A-3305', name: 'Erastus Shilongo', initials: 'ES', type: 'collateral', amount: 140000, term: '5 months', income: 60000, date: '2026-06-09', status: 'pending', affordability: 'pass' },
    { id: 'A-3302', name: 'Tuyeimo Nakale', initials: 'TK', type: 'payday', amount: 4000, term: '1 month', income: 9800, date: '2026-06-08', status: 'approved', affordability: 'pass' },
    { id: 'A-3298', name: 'Festus Iyambo', initials: 'FI', type: 'business', amount: 30000, term: '4 months', income: 28000, date: '2026-06-07', status: 'declined', affordability: 'fail' }
  ];

  // Borrower portal: "logged in" as Helena Kapenda (B-1042), loan L-20451
  var schedule = [
    { no: 1, due: '2026-06-25', amount: 5200, status: 'paid', paidOn: '2026-06-24' },
    { no: 2, due: '2026-07-25', amount: 5200, status: 'due' }
  ];

  var activity = [
    { date: '2026-06-24', label: 'Repayment received', amount: 5200, dir: 'in' },
    { date: '2026-05-25', label: 'Loan disbursed', amount: 8000, dir: 'out' },
    { date: '2026-05-24', label: 'Application approved', amount: null, dir: 'note' }
  ];

  var typeLabel = { payday: 'Payday / short-term', business: 'Business & SME', collateral: 'Collateral-backed' };

  function borrower(id) { return borrowers.find(function (b) { return b.id === id; }); }
  function loansFor(id) { return loans.filter(function (l) { return l.borrowerId === id; }); }

  // KPIs
  var bookSize = loans.reduce(function (s, l) { return s + l.balance; }, 0);
  var activeCount = loans.filter(function (l) { return l.status === 'active'; }).length;
  var arrears = loans.filter(function (l) { return l.status === 'arrears'; });
  var arrearsAmt = arrears.reduce(function (s, l) { return s + l.balance; }, 0);
  var disbursedMonth = loans.filter(function (l) { return l.disbursed >= '2026-06-01'; }).reduce(function (s, l) { return s + l.principal; }, 0);
  var pendingApps = applications.filter(function (a) { return a.status === 'pending' || a.status === 'review'; }).length;

  return {
    n$: n$, borrowers: borrowers, loans: loans, applications: applications,
    schedule: schedule, activity: activity, typeLabel: typeLabel,
    borrower: borrower, loansFor: loansFor,
    kpis: { bookSize: bookSize, activeCount: activeCount, arrearsCount: arrears.length, arrearsAmt: arrearsAmt, disbursedMonth: disbursedMonth, pendingApps: pendingApps, collectionsMonth: 13125, borrowers: borrowers.length }
  };
})();
