/**
 * Capability gating — the sync engine and the manual sync routes call
 * pushAttendance / pullEmployees only when the adapter declares support, so a
 * push-only vendor never has a pull method it lacks invoked on it.
 *
 *   node test/capability-gating.test.js
 */

const assert = require('assert');
const hrms = require('../services/hrms-integration');
const { supports, CAPABILITY, registry } = hrms;

let failures = 0;
const check = (name, ok, extra = '') => {
    if (ok) console.log(`  ok   ${name}`);
    else { failures++; console.log(`  FAIL ${name}${extra ? '\n       ' + extra : ''}`); }
};

const make = (type) => {
    const Adapter = registry.find(type).load();
    return new Adapter({ type, base_url: 'https://example.test', config: {} });
};

console.log('capability gating\n');

const greythr = make('greythr');
check('greytHR supports push_attendance', supports(greythr, CAPABILITY.PUSH_ATTENDANCE) === true);
check('greytHR does NOT support pull_employees (push-only)', supports(greythr, CAPABILITY.PULL_EMPLOYEES) === false);

const erpnext = make('erpnext');
check('erpnext supports pull_employees', supports(erpnext, CAPABILITY.PULL_EMPLOYEES) === true);
check('erpnext supports push_attendance', supports(erpnext, CAPABILITY.PUSH_ATTENDANCE) === true);

const webhook = make('webhook');
check('webhook supports push_attendance', supports(webhook, CAPABILITY.PUSH_ATTENDANCE) === true);

// The gate the engine/routes use: enabling employee-sync on greytHR must be a
// no-op (skipped), not a crash on a missing pullEmployees.
check('gate: greytHR employee-sync would be skipped', supports(greythr, CAPABILITY.PULL_EMPLOYEES) === false);
check('gate: erpnext employee-sync would run', supports(erpnext, CAPABILITY.PULL_EMPLOYEES) === true);

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
