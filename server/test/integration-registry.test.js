/**
 * Conformance test for the integration registry.
 *
 * Every adapter listed in services/integrations/registry.js must:
 *   - load without throwing,
 *   - be a subclass of BaseIntegration,
 *   - instantiate with a minimal config,
 *   - declare a valid `static capabilities` array (only known capabilities),
 *   - resolve through getIntegrationInstance's registry lookup, including aliases.
 *
 * Runnable with plain node (no test framework required):
 *   node test/integration-registry.test.js
 * Exits non-zero on the first failure so it can gate CI.
 */

const assert = require('assert');
const hrms = require('../services/hrms-integration');
const { registry, BaseIntegration, CAPABILITY } = hrms;

const KNOWN_CAPS = new Set(Object.values(CAPABILITY));

// A declared capability must be backed by a real method. Method names vary
// across the older adapters (getLeave vs pullLeave), so each capability accepts
// a small set of aliases.
const CAP_METHODS = {
    push_attendance: ['pushAttendance'],
    push_daily_attendance: ['pushDailyAttendance'],
    push_leave: ['pushLeave', 'pushLeaveRequest', 'pushLeaves'],
    pull_employees: ['pullEmployees', 'getEmployees'],
    pull_leave: ['pullLeave', 'getLeave'],
    pull_shifts: ['pullShifts', 'getShifts'],
    employees: ['pullEmployees', 'getEmployees'],
    leave: ['pullLeave', 'getLeave'],
    shifts: ['pullShifts', 'getShifts'],
    holidays: ['pullHolidays', 'getHolidays'],
};
let failures = 0;
const check = (name, fn) => {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failures++; console.log(`  FAIL ${name}\n       ${e.message}`); }
};

console.log('integration registry conformance\n');

// 1. registry is non-empty and every type is unique
check('registry lists adapters', () => {
    assert(registry.list().length > 0, 'registry is empty');
});
check('no duplicate types', () => {
    const types = registry.ADAPTERS.map(a => a.type);
    assert.strictEqual(new Set(types).size, types.length, `duplicate type in ${types}`);
});

// 2. per-adapter checks
for (const entry of registry.ADAPTERS) {
    const label = entry.type;
    check(`${label}: loads a class`, () => {
        const Adapter = entry.load();
        assert.strictEqual(typeof Adapter, 'function', 'load() did not return a class');
    });
    check(`${label}: extends BaseIntegration`, () => {
        const Adapter = entry.load();
        assert(Adapter.prototype instanceof BaseIntegration, `${label} does not extend BaseIntegration`);
    });
    check(`${label}: instantiates with minimal config`, () => {
        const Adapter = entry.load();
        // minimal config shaped like a DB row
        const inst = new Adapter({ type: entry.type, base_url: 'https://example.test', config: {} });
        assert(inst instanceof BaseIntegration);
    });
    check(`${label}: declared capabilities are valid`, () => {
        const Adapter = entry.load();
        const caps = Adapter.capabilities || [];
        assert(Array.isArray(caps), 'capabilities is not an array');
        for (const c of caps) assert(KNOWN_CAPS.has(c), `unknown capability "${c}" (add it to CAPABILITY)`);
    });
    check(`${label}: declared capabilities have a backing method`, () => {
        const Adapter = entry.load();
        for (const c of (Adapter.capabilities || [])) {
            const aliases = CAP_METHODS[c] || [];
            const has = aliases.some(m => typeof Adapter.prototype[m] === 'function');
            assert(has, `declares "${c}" but implements none of: ${aliases.join(', ')}`);
        }
    });
    check(`${label}: resolves via registry.find`, () => {
        assert.strictEqual(registry.find(entry.type), entry);
        for (const alias of entry.aliases || []) {
            assert.strictEqual(registry.find(alias), entry, `alias "${alias}" did not resolve`);
        }
    });
}

// 3. unknown type resolves to undefined (resolver then throws a clear error)
check('unknown type resolves to undefined', () => {
    assert.strictEqual(registry.find('definitely_not_a_vendor'), undefined);
});

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
